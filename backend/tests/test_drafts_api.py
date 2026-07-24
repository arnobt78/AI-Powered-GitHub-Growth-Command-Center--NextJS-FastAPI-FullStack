from unittest.mock import MagicMock, patch

from app.db import SessionLocal
from app.models import Draft, Repo


def _seed_draft_for(user_id: int, status: str = "pending") -> tuple[int, int]:
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    draft = Draft(
        user_id=user_id,
        repo_id=repo.id,
        kind="readme_suggestion",
        target="readme",
        content={"text": "Add a Quick Start section."},
        status=status,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    repo_id, draft_id = repo.id, draft.id
    db.close()
    return repo_id, draft_id


def _seed_reply_draft(user_id: int, kind: str, target: str, content: dict) -> tuple[int, int]:
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    draft = Draft(user_id=user_id, repo_id=repo.id, kind=kind, target=target, content=content, status="pending")
    db.add(draft)
    db.commit()
    db.refresh(draft)
    repo_id, draft_id = repo.id, draft.id
    db.close()
    return repo_id, draft_id


def test_drafts_isolated_per_user(client, other_user_client):
    _repo_id, draft_id = _seed_draft_for(client.test_user_id)

    other_list = other_user_client.get("/drafts")
    assert other_list.json() == []

    other_patch = other_user_client.patch(f"/drafts/{draft_id}", json={"status": "approved"})
    assert other_patch.status_code == 404


def test_list_drafts_returns_current_users_drafts(client):
    _repo_id, draft_id = _seed_draft_for(client.test_user_id)

    resp = client.get("/drafts")
    assert resp.status_code == 200
    assert any(d["id"] == draft_id and d["status"] == "pending" for d in resp.json())


@patch("app.api.drafts.broadcaster.publish")
def test_approve_draft(mock_publish, client):
    _repo_id, draft_id = _seed_draft_for(client.test_user_id)

    resp = client.patch(f"/drafts/{draft_id}", json={"status": "approved"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "approved"
    assert body["reviewed_at"] is not None

    mock_publish.assert_called_once_with(
        "draft_updated", {"id": draft_id, "status": "approved"}, user_id=client.test_user_id
    )


def test_reject_draft(client):
    _repo_id, draft_id = _seed_draft_for(client.test_user_id)

    resp = client.patch(f"/drafts/{draft_id}", json={"status": "rejected"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


def test_patch_rejects_invalid_status_value(client):
    _repo_id, draft_id = _seed_draft_for(client.test_user_id)

    resp = client.patch(f"/drafts/{draft_id}", json={"status": "pending"})
    assert resp.status_code == 422


def test_patch_already_reviewed_draft_returns_409(client):
    _repo_id, draft_id = _seed_draft_for(client.test_user_id, status="approved")

    resp = client.patch(f"/drafts/{draft_id}", json={"status": "rejected"})
    assert resp.status_code == 409

    list_resp = client.get("/drafts")
    assert any(d["id"] == draft_id and d["status"] == "approved" for d in list_resp.json())


def test_drafts_require_user_token(client_without_user_token):
    resp = client_without_user_token.get("/drafts")
    assert resp.status_code == 401

    resp = client_without_user_token.patch("/drafts/1", json={"status": "approved"})
    assert resp.status_code == 401


@patch("app.api.drafts.GitHubClient")
def test_approve_issue_reply_posts_comment_and_marks_posted(mock_gh_cls, client):
    mock_gh = MagicMock()
    mock_gh.create_issue_comment.return_value = {"id": 999}
    mock_gh_cls.return_value = mock_gh

    _repo_id, draft_id = _seed_reply_draft(
        client.test_user_id, "issue_reply", "issue:42", {"suggested": "Thanks for the report!", "reason": "acknowledges"},
    )

    resp = client.patch(f"/drafts/{draft_id}", json={"status": "approved"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "posted"
    mock_gh.create_issue_comment.assert_called_once_with("octocat", "hello-world", 42, "Thanks for the report!")


@patch("app.api.drafts.GitHubClient")
def test_approve_discussion_reply_posts_comment_and_marks_posted(mock_gh_cls, client):
    mock_gh = MagicMock()
    mock_gh.create_discussion_comment.return_value = {"data": {}}
    mock_gh_cls.return_value = mock_gh

    _repo_id, draft_id = _seed_reply_draft(
        client.test_user_id, "discussion_reply", "discussion:7",
        {"suggested": "Great question!", "reason": "directly answers", "discussion_node_id": "D_kwDOABCD1"},
    )

    resp = client.patch(f"/drafts/{draft_id}", json={"status": "approved"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "posted"
    mock_gh.create_discussion_comment.assert_called_once_with("D_kwDOABCD1", "Great question!")


@patch("app.api.drafts.GitHubClient")
def test_approve_issue_reply_marks_failed_on_posting_error(mock_gh_cls, client):
    mock_gh = MagicMock()
    mock_gh.create_issue_comment.side_effect = RuntimeError("GitHub API unavailable")
    mock_gh_cls.return_value = mock_gh

    _repo_id, draft_id = _seed_reply_draft(
        client.test_user_id, "issue_reply", "issue:42", {"suggested": "Thanks!", "reason": "ack"},
    )

    resp = client.patch(f"/drafts/{draft_id}", json={"status": "approved"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "failed"
    assert body["error_message"] == "GitHub API unavailable"


@patch("app.api.drafts.GitHubClient")
def test_reject_issue_reply_never_posts(mock_gh_cls, client):
    mock_gh = MagicMock()
    mock_gh_cls.return_value = mock_gh

    _repo_id, draft_id = _seed_reply_draft(
        client.test_user_id, "issue_reply", "issue:42", {"suggested": "Thanks!", "reason": "ack"},
    )

    resp = client.patch(f"/drafts/{draft_id}", json={"status": "rejected"})

    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"
    mock_gh.create_issue_comment.assert_not_called()
