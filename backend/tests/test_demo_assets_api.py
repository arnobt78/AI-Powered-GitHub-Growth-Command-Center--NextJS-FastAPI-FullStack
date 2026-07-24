from unittest.mock import patch

from app.db import SessionLocal
from app.models import DemoAsset, Repo


def _seed_repo(user_id: int) -> int:
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)
    repo_id = repo.id
    db.close()
    return repo_id


def test_trigger_demo_asset_returns_202_and_creates_generating_row(client, seed_user):
    repo_id = _seed_repo(seed_user)

    with patch("app.api.demo_assets._background_generate_demo_asset"):
        resp = client.post(f"/repos/{repo_id}/demo-assets")

    assert resp.status_code == 202

    db = SessionLocal()
    assets = db.query(DemoAsset).filter_by(repo_id=repo_id).all()
    assert len(assets) == 1
    assert assets[0].status == "generating"
    db.close()


def test_trigger_demo_asset_404_for_other_users_repo(client, other_user_client):
    repo_id = _seed_repo(other_user_client.test_user_id)

    resp = client.post(f"/repos/{repo_id}/demo-assets")

    assert resp.status_code == 404


def test_list_demo_assets_returns_current_users_assets(client, seed_user):
    repo_id = _seed_repo(seed_user)
    db = SessionLocal()
    db.add(DemoAsset(user_id=seed_user, repo_id=repo_id, status="ready", video_path="1.mp4"))
    db.commit()
    db.close()

    resp = client.get(f"/repos/{repo_id}/demo-assets")

    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["status"] == "ready"


def test_list_demo_assets_404_for_other_users_repo(client, other_user_client):
    repo_id = _seed_repo(other_user_client.test_user_id)

    resp = client.get(f"/repos/{repo_id}/demo-assets")

    assert resp.status_code == 404
