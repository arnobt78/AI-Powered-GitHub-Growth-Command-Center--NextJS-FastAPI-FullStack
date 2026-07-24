import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoAssetsSection } from "@/components/repo-detail/demo-assets-section";
import * as useDemoAssetsModule from "@/hooks/use-demo-assets";

function mockHooks(assets: unknown[], mutate = vi.fn(), isPending = false) {
  vi.spyOn(useDemoAssetsModule, "useDemoAssets").mockReturnValue({ data: assets, isPending } as ReturnType<typeof useDemoAssetsModule.useDemoAssets>);
  vi.spyOn(useDemoAssetsModule, "useTriggerDemoAsset").mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useDemoAssetsModule.useTriggerDemoAsset>);
}

describe("DemoAssetsSection", () => {
  it("shows a loading skeleton while the initial fetch is pending", () => {
    mockHooks([], vi.fn(), true);
    const { container } = render(<DemoAssetsSection repoId={1} />);
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByText(/no demo/i)).not.toBeInTheDocument();
  });

  it("shows an empty state when no assets exist yet", () => {
    mockHooks([]);
    render(<DemoAssetsSection repoId={1} />);
    expect(screen.getByText(/no demo/i)).toBeInTheDocument();
  });

  it("calls the trigger mutation when Generate is clicked", () => {
    const mutate = vi.fn();
    mockHooks([], mutate);
    render(<DemoAssetsSection repoId={1} />);
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("shows a video element and download link for a ready asset", () => {
    mockHooks([{ id: 1, repo_id: 1, status: "ready", video_path: "1.mp4", error_message: null, created_at: "2026-07-24T00:00:00Z" }]);
    render(<DemoAssetsSection repoId={1} />);
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute("href", "/api/demo-assets/1/video");
  });

  it("shows the error message for a failed asset", () => {
    mockHooks([{ id: 1, repo_id: 1, status: "failed", video_path: null, error_message: "ffmpeg not found", created_at: "2026-07-24T00:00:00Z" }]);
    render(<DemoAssetsSection repoId={1} />);
    expect(screen.getByText("ffmpeg not found")).toBeInTheDocument();
  });
});
