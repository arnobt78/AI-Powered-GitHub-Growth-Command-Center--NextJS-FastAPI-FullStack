import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpportunitiesClient } from "@/components/opportunities/opportunities-client";
import * as useOpportunitiesModule from "@/hooks/use-opportunities";
import * as useReposModule from "@/hooks/use-repos";

const baseOpportunity = {
  id: 1,
  repo_id: 10,
  dismissed: false,
  created_at: "2026-07-24T00:00:00Z",
};

function mockHooks(opportunities: unknown[]) {
  vi.spyOn(useOpportunitiesModule, "useOpportunities").mockReturnValue({ data: opportunities } as ReturnType<typeof useOpportunitiesModule.useOpportunities>);
  vi.spyOn(useOpportunitiesModule, "useDismissOpportunity").mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useOpportunitiesModule.useDismissOpportunity>);
  vi.spyOn(useReposModule, "useRepos").mockReturnValue({ data: [{ id: 10, owner: "octocat", name: "hello-world" }] } as unknown as ReturnType<typeof useReposModule.useRepos>);
}

describe("OpportunitiesClient", () => {
  it("shows an empty state when there are no opportunities", () => {
    mockHooks([]);
    render(<OpportunitiesClient />);
    expect(screen.getByText(/no.*opportunities/i)).toBeInTheDocument();
  });

  it("renders an opportunity card with source, title, and repo name", () => {
    mockHooks([{ ...baseOpportunity, source: "hacker_news", title: "Show HN: hello-world", url: "https://example.com/1" }]);
    render(<OpportunitiesClient />);
    expect(screen.getByText("octocat/hello-world")).toBeInTheDocument();
    expect(screen.getByText("Show HN: hello-world")).toBeInTheDocument();
    expect(screen.getByText(/Hacker News/i)).toBeInTheDocument();
  });

  it("calls dismiss when the dismiss button is clicked", () => {
    const mutate = vi.fn();
    vi.spyOn(useOpportunitiesModule, "useOpportunities").mockReturnValue({
      data: [{ ...baseOpportunity, source: "hacker_news", title: "Show HN: hello-world", url: "https://example.com/1" }],
    } as ReturnType<typeof useOpportunitiesModule.useOpportunities>);
    vi.spyOn(useOpportunitiesModule, "useDismissOpportunity").mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useOpportunitiesModule.useDismissOpportunity>);
    vi.spyOn(useReposModule, "useRepos").mockReturnValue({ data: [{ id: 10, owner: "octocat", name: "hello-world" }] } as unknown as ReturnType<typeof useReposModule.useRepos>);

    render(<OpportunitiesClient />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(mutate).toHaveBeenCalledWith({ id: 1, dismissed: true }, expect.objectContaining({ onError: expect.any(Function) }));
  });

  it("does not render dismissed opportunities", () => {
    mockHooks([{ ...baseOpportunity, source: "hacker_news", title: "Show HN: hello-world", url: "https://example.com/1", dismissed: true }]);
    render(<OpportunitiesClient />);
    expect(screen.queryByText("Show HN: hello-world")).not.toBeInTheDocument();
  });
});
