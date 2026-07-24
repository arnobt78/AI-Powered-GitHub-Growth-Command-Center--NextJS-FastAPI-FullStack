import os

from sqlalchemy.orm import Session

from app.config import get_settings
from app.demo_recorder import DemoRecorder
from app.events import broadcaster
from app.models import DemoAsset
from app.video_compositor import VideoCompositor


def generate_demo_asset(db: Session, demo_asset_id: int, urls: list[str]) -> None:
    settings = get_settings()
    asset = db.get(DemoAsset, demo_asset_id)
    os.makedirs(settings.demo_assets_dir, exist_ok=True)

    try:
        raw_path = DemoRecorder().record(urls, output_dir=settings.demo_assets_dir)
        mp4_filename = f"{demo_asset_id}.mp4"
        mp4_path = os.path.join(settings.demo_assets_dir, mp4_filename)
        VideoCompositor().to_mp4(raw_path, mp4_path)
        os.remove(raw_path)
        asset.status = "ready"
        asset.video_path = mp4_filename
    except Exception as exc:
        asset.status = "failed"
        asset.error_message = str(exc)

    db.commit()
    broadcaster.publish("demo_asset_updated", {"id": asset.id, "status": asset.status}, user_id=asset.user_id)
