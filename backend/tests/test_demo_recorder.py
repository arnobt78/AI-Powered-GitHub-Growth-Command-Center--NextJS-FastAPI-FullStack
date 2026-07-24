from unittest.mock import MagicMock, patch

from app.demo_recorder import DemoRecorder


@patch("app.demo_recorder.sync_playwright")
def test_record_launches_browser_and_visits_each_url(mock_sync_playwright):
    mock_page = MagicMock()
    mock_page.video.path.return_value = "/tmp/demo/abc123.webm"
    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page
    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context
    mock_playwright = MagicMock()
    mock_playwright.chromium.launch.return_value = mock_browser
    mock_sync_playwright.return_value.__enter__.return_value = mock_playwright

    result = DemoRecorder().record(["https://example.com/repos/1"], output_dir="/tmp/demo")

    assert result == "/tmp/demo/abc123.webm"
    mock_browser.new_context.assert_called_once_with(record_video_dir="/tmp/demo", viewport={"width": 1280, "height": 800})
    mock_page.goto.assert_called_once_with("https://example.com/repos/1")
    mock_context.close.assert_called_once()
    mock_browser.close.assert_called_once()


@patch("app.demo_recorder.sync_playwright")
def test_record_visits_multiple_urls_in_order(mock_sync_playwright):
    mock_page = MagicMock()
    mock_page.video.path.return_value = "/tmp/demo/xyz.webm"
    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page
    mock_browser = MagicMock()
    mock_browser.new_context.return_value = mock_context
    mock_playwright = MagicMock()
    mock_playwright.chromium.launch.return_value = mock_browser
    mock_sync_playwright.return_value.__enter__.return_value = mock_playwright

    DemoRecorder().record(["https://example.com/a", "https://example.com/b"], output_dir="/tmp/demo")

    assert mock_page.goto.call_args_list[0].args[0] == "https://example.com/a"
    assert mock_page.goto.call_args_list[1].args[0] == "https://example.com/b"
