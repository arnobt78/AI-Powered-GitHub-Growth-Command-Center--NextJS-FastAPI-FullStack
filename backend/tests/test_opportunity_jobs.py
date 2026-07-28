from unittest.mock import MagicMock, patch

from app.db import SessionLocal
from app.models import Opportunity, Repo, User
from app.pipeline.opportunity_jobs import run_opportunities_pipeline_for_all_repos


def _fake_hn_client():
    hn = MagicMock()
    hn.search.return_value = []
    return hn


def _fake_gh_client():
    gh = MagicMock()
    gh.search_discussions.return_value = [
        {"id": "D_kwABC123", "title": "usage question", "url": "https://example.com/1"},
    ]
    return gh


@patch("app.pipeline.opportunity_jobs.broadcaster.publish")
@patch("app.pipeline.opportunity_jobs.GitHubClient")
@patch("app.pipeline.opportunity_jobs.HackerNewsClient")
def test_runs_opportunities_pipeline_and_publishes_per_user(mock_hn_cls, mock_gh_cls, mock_publish, seed_user):
    mock_hn_cls.return_value = _fake_hn_client()
    mock_gh_cls.return_value = _fake_gh_client()

    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=seed_user)
    db.add(repo)
    db.commit()

    run_opportunities_pipeline_for_all_repos(db, user_id=seed_user)

    opportunities = db.query(Opportunity).filter_by(repo_id=repo.id).all()
    assert len(opportunities) == 1
    assert opportunities[0].source == "github_discussions"

    # assert_any_call, not assert_called_once_with: the patch target is the shared
    # broadcaster singleton, so this mock also captures runner.py's per-stage
    # stage_completed broadcasts now that those exist (Phase 3 Task 10).
    mock_publish.assert_any_call("opportunities_generated", {}, user_id=seed_user)
    db.close()


@patch("app.pipeline.opportunity_jobs.broadcaster.publish")
def test_skips_repos_for_user_with_undecryptable_token(mock_publish, seed_user):
    db = SessionLocal()
    user = db.get(User, seed_user)
    user.access_token_encrypted = "not-valid-fernet-ciphertext"
    db.commit()

    repo = Repo(owner="octocat", name="hello-world", user_id=seed_user)
    db.add(repo)
    db.commit()

    run_opportunities_pipeline_for_all_repos(db, user_id=seed_user)

    assert db.query(Opportunity).count() == 0
    # On-demand still publishes so the UI kickoff toast closes (no repos ran).
    mock_publish.assert_any_call("opportunities_generated", {}, user_id=seed_user)
    db.close()
