import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { DraftsClient } from "@/components/drafts/drafts-client";
import * as useDraftsModule from "@/hooks/use-drafts";
import * as useReposModule from "@/hooks/use-repos";

// No pre-existing sonner mocking convention was found in this codebase's tests
// (grepped tests/ and tests/setup.ts), so this establishes one: mock the
// module and assert directly on toast.success/toast.error.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);

const baseDraft = {
  id: 1,
  repo_id: 10,
  status: "pending" as const,
  created_at: "2026-07-24T00:00:00Z",
  reviewed_at: null,
};

function mockHooks(drafts: unknown[]) {
  vi.spyOn(useDraftsModule, "useDrafts").mockReturnValue({ data: drafts } as ReturnType<typeof useDraftsModule.useDrafts>);
  vi.spyOn(useDraftsModule, "useReviewDraft").mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useDraftsModule.useReviewDraft>);
  vi.spyOn(useDraftsModule, "useTriggerContentRun").mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useDraftsModule.useTriggerContentRun>);
  vi.spyOn(useReposModule, "useRepos").mockReturnValue({ data: [{ id: 10, owner: "octocat", name: "hello-world" }] } as unknown as ReturnType<typeof useReposModule.useRepos>);
}

function mockHooksWithReview(drafts: unknown[], mutate: ReturnType<typeof vi.fn>) {
  mockHooks(drafts);
  vi.spyOn(useDraftsModule, "useReviewDraft").mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useDraftsModule.useReviewDraft>);
}

// vi.mock("sonner", ...) returns the same toast.success/toast.error fn across
// every test in this file — clear call history between tests so an earlier
// test's toast calls can't leak into a later "not.toHaveBeenCalled()" assertion.
afterEach(() => {
  vi.clearAllMocks();
});

describe("DraftsClient release_notes header", () => {
  it("shows the release tag in the header for a release_notes draft", () => {
    mockHooks([{ ...baseDraft, kind: "release_notes", target: "v1.2.0", content: { suggested: "## Features", reason: "clear" } }]);
    render(<DraftsClient />);
    expect(screen.getByText(/Release notes/)).toBeInTheDocument();
    expect(screen.getByText(/\(v1\.2\.0\)/)).toBeInTheDocument();
  });

  it("does not append a target suffix for other kinds", () => {
    mockHooks([{ ...baseDraft, kind: "readme_suggestion", target: "readme", content: { current: "# Old", suggested: "# New", reason: null } }]);
    render(<DraftsClient />);
    expect(screen.getByText(/README suggestion/)).toBeInTheDocument();
    expect(screen.queryByText(/\(readme\)/)).not.toBeInTheDocument();
  });
});

describe("DraftsClient approve toast behavior", () => {
  it("shows a success toast when approving results in status posted", () => {
    const mutate = vi.fn((_vars, opts) => opts?.onSuccess?.({ id: 1, status: "posted", error_message: null }));
    mockHooksWithReview([{ ...baseDraft, kind: "issue_reply", target: "issue:42", content: { suggested: "Thanks!", reason: "ack" } }], mutate);
    render(<DraftsClient />);
    fireEvent.click(screen.getAllByRole("button", { name: /approve/i })[0]);
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/posted/i), expect.anything());
  });

  it("shows an error toast with the failure reason when approving results in status failed", () => {
    const mutate = vi.fn((_vars, opts) => opts?.onSuccess?.({ id: 1, status: "failed", error_message: "GitHub API unavailable" }));
    mockHooksWithReview([{ ...baseDraft, kind: "issue_reply", target: "issue:42", content: { suggested: "Thanks!", reason: "ack" } }], mutate);
    render(<DraftsClient />);
    fireEvent.click(screen.getAllByRole("button", { name: /approve/i })[0]);
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("Could not post"), { description: "GitHub API unavailable" });
  });

  it("shows no posted/failed toast for a non-posting kind like readme_suggestion", () => {
    const mutate = vi.fn((_vars, opts) => opts?.onSuccess?.({ id: 1, status: "approved", error_message: null }));
    mockHooksWithReview([{ ...baseDraft, kind: "readme_suggestion", target: "readme", content: { current: null, suggested: "# New", reason: null } }], mutate);
    render(<DraftsClient />);
    fireEvent.click(screen.getAllByRole("button", { name: /approve/i })[0]);
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
