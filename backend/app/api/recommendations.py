"""Growth recommendations produced by the analytics pipeline.

Educational walkthrough
-----------------------
List + dismiss/update. Publishing ``recommendation_updated`` SSE keeps Overview
badges and the recommendations page in sync across tabs.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_owned_or_404, require_api_key, require_user
from app.events import broadcaster
from app.models import Recommendation, User

router = APIRouter(prefix="/recommendations", tags=["recommendations"], dependencies=[Depends(require_api_key)])


class RecommendationOut(BaseModel):
    id: int
    repo_id: int
    category: str
    title: str
    body: str
    validated: bool
    dismissed: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RecommendationPatch(BaseModel):
    dismissed: bool


@router.get("", response_model=list[RecommendationOut])
def list_recommendations(
    db: Session = Depends(get_db), current_user: User = Depends(require_user)
) -> list[Recommendation]:
    return db.execute(
        select(Recommendation)
        .where(Recommendation.user_id == current_user.id)
        .order_by(Recommendation.created_at.desc())
    ).scalars().all()


@router.patch("/{recommendation_id}", response_model=RecommendationOut)
def update_recommendation(
    recommendation_id: int,
    payload: RecommendationPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
) -> Recommendation:
    rec = get_owned_or_404(db, Recommendation, recommendation_id, current_user.id, "Recommendation")
    rec.dismissed = payload.dismissed
    db.commit()
    db.refresh(rec)
    broadcaster.publish(
        "recommendation_updated", {"id": rec.id, "dismissed": rec.dismissed}, user_id=current_user.id
    )
    return rec
