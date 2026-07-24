import subprocess
from unittest.mock import patch

import pytest

from app.video_compositor import VideoCompositor


@patch("app.video_compositor.subprocess.run")
def test_to_mp4_invokes_ffmpeg_with_correct_args(mock_run):
    VideoCompositor().to_mp4("/tmp/raw.webm", "/tmp/out.mp4")

    mock_run.assert_called_once_with(
        ["ffmpeg", "-y", "-i", "/tmp/raw.webm", "-vcodec", "libx264", "-crf", "23", "/tmp/out.mp4"],
        check=True, capture_output=True,
    )


@patch("app.video_compositor.subprocess.run")
def test_to_mp4_propagates_ffmpeg_failure(mock_run):
    mock_run.side_effect = subprocess.CalledProcessError(1, "ffmpeg")

    with pytest.raises(subprocess.CalledProcessError):
        VideoCompositor().to_mp4("/tmp/raw.webm", "/tmp/out.mp4")
