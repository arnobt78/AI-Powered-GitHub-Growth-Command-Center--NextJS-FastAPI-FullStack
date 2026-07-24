from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.db import SessionLocal
from app.demo_asset_jobs import cleanup_expired_demo_assets, generate_demo_asset
from app.models import DemoAsset, Repo


def _seed_demo_asset(user_id: int) -> tuple[int, int]:
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=user_id)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    asset = DemoAsset(user_id=user_id, repo_id=repo.id)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    asset_id = asset.id
    repo_id = repo.id
    db.close()
    return repo_id, asset_id


@patch("app.demo_asset_jobs.broadcaster.publish")
@patch("app.demo_asset_jobs.os.remove")
@patch("app.demo_asset_jobs.VideoCompositor")
@patch("app.demo_asset_jobs.DemoRecorder")
def test_generate_demo_asset_success_marks_ready(mock_recorder_cls, mock_compositor_cls, mock_os_remove, mock_publish, seed_user):
    _repo_id, asset_id = _seed_demo_asset(seed_user)

    mock_recorder = MagicMock()
    mock_recorder.record.return_value = "/tmp/demo_assets/raw.webm"
    mock_recorder_cls.return_value = mock_recorder
    mock_compositor_cls.return_value = MagicMock()

    db = SessionLocal()
    generate_demo_asset(db, asset_id, urls=["https://example.com/repos/1"])

    asset = db.get(DemoAsset, asset_id)
    assert asset.status == "ready"
    assert asset.video_path == f"{asset_id}.mp4"
    assert asset.error_message is None
    mock_publish.assert_called_once_with("demo_asset_updated", {"id": asset_id, "status": "ready"}, user_id=seed_user)
    db.close()


@patch("app.demo_asset_jobs.broadcaster.publish")
@patch("app.demo_asset_jobs.DemoRecorder")
def test_generate_demo_asset_failure_marks_failed(mock_recorder_cls, mock_publish, seed_user):
    _repo_id, asset_id = _seed_demo_asset(seed_user)

    mock_recorder = MagicMock()
    mock_recorder.record.side_effect = RuntimeError("browser launch failed")
    mock_recorder_cls.return_value = mock_recorder

    db = SessionLocal()
    generate_demo_asset(db, asset_id, urls=["https://example.com/repos/1"])

    asset = db.get(DemoAsset, asset_id)
    assert asset.status == "failed"
    assert asset.error_message == "browser launch failed"
    mock_publish.assert_called_once_with("demo_asset_updated", {"id": asset_id, "status": "failed"}, user_id=seed_user)
    db.close()


@patch("app.demo_asset_jobs.os.path.exists")
@patch("app.demo_asset_jobs.os.remove")
def test_cleanup_deletes_expired_assets_and_files(mock_os_remove, mock_os_exists, seed_user):
    mock_os_exists.return_value = True

    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=seed_user)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    old_asset = DemoAsset(
        user_id=seed_user, repo_id=repo.id, status="ready", video_path="old.mp4",
        created_at=datetime.now(timezone.utc) - timedelta(days=5),
    )
    recent_asset = DemoAsset(
        user_id=seed_user, repo_id=repo.id, status="ready", video_path="recent.mp4",
        created_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db.add_all([old_asset, recent_asset])
    db.commit()
    old_id, recent_id = old_asset.id, recent_asset.id

    cleanup_expired_demo_assets(db)

    assert db.get(DemoAsset, old_id) is None
    assert db.get(DemoAsset, recent_id) is not None
    mock_os_remove.assert_called_once()
    db.close()


@patch("app.demo_asset_jobs.os.path.exists")
@patch("app.demo_asset_jobs.os.remove")
def test_cleanup_deletes_failed_assets_with_no_file(mock_os_remove, mock_os_exists, seed_user):
    db = SessionLocal()
    repo = Repo(owner="octocat", name="hello-world", user_id=seed_user)
    db.add(repo)
    db.commit()
    db.refresh(repo)

    failed_asset = DemoAsset(
        user_id=seed_user, repo_id=repo.id, status="failed", video_path=None,
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    db.add(failed_asset)
    db.commit()
    failed_id = failed_asset.id

    cleanup_expired_demo_assets(db)

    assert db.get(DemoAsset, failed_id) is None
    mock_os_remove.assert_not_called()
    db.close()
