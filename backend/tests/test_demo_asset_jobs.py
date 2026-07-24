from unittest.mock import MagicMock, patch

from app.db import SessionLocal
from app.demo_asset_jobs import generate_demo_asset
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
