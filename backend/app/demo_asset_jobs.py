import os
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import get_settings
from app.demo_recorder import DemoRecorder
from app.events import broadcaster
from app.models import DemoAsset
from app.video_compositor import VideoCompositor


def generate_demo_asset(db: Session, demo_asset_id: int, urls: list[str]) -> None:
    settings = get_settings()
    asset = db.get(DemoAsset, demo_asset_id)

    try:
        os.makedirs(settings.demo_assets_dir, exist_ok=True)
        raw_path = DemoRecorder().record(urls, output_dir=settings.demo_assets_dir)
        # The raw .webm must be removed whether compositing succeeds or
        # fails — otherwise an ffmpeg failure leaks it forever, since the
        # cleanup job only ever knows about video_path (never set on this
        # path) and can't find it.
        try:
            mp4_filename = f"{demo_asset_id}.mp4"
            mp4_path = os.path.join(settings.demo_assets_dir, mp4_filename)
            VideoCompositor().to_mp4(raw_path, mp4_path)
        finally:
            os.remove(raw_path)
        asset.status = "ready"
        asset.video_path = mp4_filename
    except Exception as exc:
        asset.status = "failed"
        # Playwright's navigation-failure messages embed the full URL,
        # which carries ?recording_token=... — that's a live (if
        # short-lived and single-user-scoped) credential and must never be
        # persisted or served back via GET /repos/{id}/demo-assets.
        asset.error_message = re.sub(r"recording_token=[^&\s]*", "recording_token=[redacted]", str(exc))

    db.commit()
    broadcaster.publish("demo_asset_updated", {"id": asset.id, "status": asset.status}, user_id=asset.user_id)


def cleanup_expired_demo_assets(db: Session) -> None:
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.demo_asset_retention_days)
    expired = db.query(DemoAsset).filter(DemoAsset.created_at < cutoff).all()
    for asset in expired:
        if asset.video_path:
            full_path = os.path.join(settings.demo_assets_dir, asset.video_path)
            if os.path.exists(full_path):
                os.remove(full_path)
        db.delete(asset)
    db.commit()
