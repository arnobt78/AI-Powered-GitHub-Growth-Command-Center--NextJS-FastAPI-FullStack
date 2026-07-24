from playwright.sync_api import sync_playwright


class DemoRecorder:
    """Launches headless Chromium, records a walkthrough of the given URLs,
    returns the path to the raw .webm recording. Playwright writes video
    files to a directory it manages internally via record_video_dir — the
    exact filename isn't known until the context closes and the page
    finishes writing it."""

    def record(self, urls: list[str], output_dir: str) -> str:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(record_video_dir=output_dir, viewport={"width": 1280, "height": 800})
            page = context.new_page()
            for url in urls:
                page.goto(url)
                page.wait_for_timeout(2000)
            video_path = page.video.path()
            context.close()
            browser.close()
            return video_path
