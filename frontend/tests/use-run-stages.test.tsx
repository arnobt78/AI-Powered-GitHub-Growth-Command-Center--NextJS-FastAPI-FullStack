import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { useRunStages } from "@/hooks/use-run-stages";

vi.mock("@/lib/fetch-json", () => ({
  fetchJson: vi.fn(async () => [{ id: 1, stage_name: "extractor", status: "ok", duration_ms: 10, error: null }]),
}));

function Harness({ runId, enabled }: { runId: number; enabled: boolean }) {
  const q = useRunStages(runId, enabled);
  return <div data-testid="status">{q.fetchStatus}</div>;
}

describe("useRunStages", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not open a dedicated EventSource (live updates come from useLiveEvents)", () => {
    const EventSourceSpy = vi.fn();
    vi.stubGlobal("EventSource", EventSourceSpy);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Harness runId={42} enabled />
      </QueryClientProvider>,
    );

    expect(EventSourceSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("fetches stages when enabled", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Harness runId={7} enabled />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.runs.stages(7))).toBeDefined();
    });
  });
});
