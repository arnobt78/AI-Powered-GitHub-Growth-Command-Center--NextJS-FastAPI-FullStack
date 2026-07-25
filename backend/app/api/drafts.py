"""Draft-and-approve API — human gate before external side effects.

Educational walkthrough
-----------------------
- ``GET`` lists the current user's drafts (content, release notes, replies, …).
- ``PATCH`` with ``approved`` | ``rejected`` is the only way to progress.
- Approving certain kinds (issue/discussion reply) may call GitHub write APIs
  via ``GitHubClient`` — never from a pipeline stage directly.
"""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_owned_or_404, require_api_key, require_user
from app.events import broadcaster
from app.github_client import GitHubClient
from app.models import Draft, Repo, User
from app.token_crypto import decrypt_token

router = APIRouter(prefix="/drafts", tags=["drafts"], dependencies=[Depends(require_api_key)])


class DraftOut(BaseModel):
    id: int
    repo_id: int | None
    kind: str
    target: str
    content: dict
    status: str
    error_message: str | None
    created_at: datetime
    reviewed_at: datetime | None

    model_config = {"from_attributes": True}


class DraftPatch(BaseModel):
    status: Literal["approved", "rejected"]


@router.get("", response_model=list[DraftOut])
def list_drafts(db: Session = Depends(get_db), current_user: User = Depends(require_user)) -> list[Draft]:
    return db.execute(
        select(Draft).where(Draft.user_id == current_user.id).order_by(Draft.created_at.desc())
    ).scalars().all()


@router.patch("/{draft_id}", response_model=DraftOut)
def review_draft(
    draft_id: int,
    payload: DraftPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
) -> Draft:
    draft = get_owned_or_404(db, Draft, draft_id, current_user.id, "Draft")
    if draft.status != "pending":
        raise HTTPException(status_code=409, detail="Draft has already been reviewed")

    draft.status = payload.status
    # Reuse created_at's own tzinfo (set by models._now(), i.e. UTC) rather than a
    # bare datetime.now() — keeps reviewed_at timezone-aware and consistent with it.
    draft.reviewed_at = datetime.now(draft.created_at.tzinfo)

    if payload.status == "approved" and draft.kind in ("issue_reply", "discussion_reply"):
        _post_reply(draft, current_user, db)

    db.commit()
    db.refresh(draft)
    broadcaster.publish("draft_updated", {"id": draft.id, "status": draft.status}, user_id=current_user.id)
    return draft


def _post_reply(draft: Draft, current_user: User, db: Session) -> None:
    # Scoped by user_id even though draft.repo_id already came from a
    # user-owned Draft row — defense in depth so this lookup can never
    # silently cross a tenant boundary if this helper is ever reused elsewhere.
    repo = db.execute(
        select(Repo).where(Repo.id == draft.repo_id, Repo.user_id == current_user.id)
    ).scalar_one()
    try:
        gh_client = GitHubClient(token=decrypt_token(current_user.access_token_encrypted))
        if draft.kind == "issue_reply":
            issue_number = int(draft.target.removeprefix("issue:"))
            gh_client.create_issue_comment(repo.owner, repo.name, issue_number, draft.content["suggested"])
        else:
            gh_client.create_discussion_comment(draft.content["discussion_node_id"], draft.content["suggested"])
        draft.status = "posted"
    except Exception as exc:
        draft.status = "failed"
        draft.error_message = str(exc)
