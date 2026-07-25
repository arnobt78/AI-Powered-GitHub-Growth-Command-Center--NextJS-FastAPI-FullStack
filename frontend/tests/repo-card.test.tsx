import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RepoCard } from "@/components/overview/repo-card";
import * as useRepoSnapshotsModule from "@/hooks/use-repo-snapshots";
import * as useRepoInsightsModule from "@/hooks/use-repo-insights";
import * as useReposModule from "@/hooks/use-repos";
import type { Repo } from "@/lib/api-types";

const repo: Repo = { id: 1, owner: "octocat", name: "hello-world", tracked_since: "2026-01-01T00:00:00Z" };

// Snapshots kept pending (skeleton, not the recharts chart) — this test is
// scoped to the recommendation-count threshold coloring, not chart rendering.
function mockHooks(recommendationCount: number) {
  vi.spyOn(useRepoSnapshotsModule, "useRepoSnapshots").mockReturnValue({
    data: undefined,
    isPending: true,
  } as unknown as ReturnType<typeof useRepoSnapshotsModule.useRepoSnapshots>);
  vi.spyOn(useRepoInsightsModule, "useRepoInsights").mockReturnValue({
    data: { latest_stars: 0, latest_forks: 0, recommendation_count: recommendationCount },
  } as unknown as ReturnType<typeof useRepoInsightsModule.useRepoInsights>);
  vi.spyOn(useReposModule, "useDeleteRepo").mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useReposModule.useDeleteRepo>);
}

describe("RepoCard recommendation-count threshold coloring", () => {
  it("colors the recommendations badge amber/warning for a low count (1-2)", () => {
    mockHooks(2);
    render(<RepoCard repo={repo} />);
    const icon = screen.getByLabelText("Open recommendations").querySelector("svg");
    expect(icon).toHaveClass("text-amber-500");
    expect(icon).not.toHaveClass("text-red-500");
  });

  it("colors the recommendations badge red/negative once the count reaches 3", () => {
    mockHooks(3);
    render(<RepoCard repo={repo} />);
    const icon = screen.getByLabelText("Open recommendations").querySelector("svg");
    expect(icon).toHaveClass("text-red-500");
    expect(icon).not.toHaveClass("text-amber-500");
  });

  it("renders no recommendations badge when the count is zero (existing gate untouched)", () => {
    mockHooks(0);
    render(<RepoCard repo={repo} />);
    expect(screen.queryByLabelText("Open recommendations")).not.toBeInTheDocument();
  });
});
