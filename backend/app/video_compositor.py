import subprocess


class VideoCompositor:
    """Converts a raw .webm recording into a shareable .mp4 via the system
    ffmpeg binary. Raises subprocess.CalledProcessError on failure — the
    caller (app/demo_asset_jobs.py) catches this and marks the DemoAsset
    as failed rather than letting it propagate."""

    def to_mp4(self, input_path: str, output_path: str) -> None:
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-vcodec", "libx264", "-crf", "23", output_path],
            check=True, capture_output=True,
        )
