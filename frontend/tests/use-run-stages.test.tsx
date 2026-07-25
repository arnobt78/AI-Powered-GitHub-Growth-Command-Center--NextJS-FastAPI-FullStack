import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { useRunStages } from "@/hooks/use-run-stages";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), handler];
  }
  emit(type: string, data: unknown) {
    for (const handler of this.listeners[type] ?? []) {
      handler({ type, data: JSON.stringify(data) } as MessageEvent);
    }
  }
  close() {}
}

function Harness({ runId }: { runId: number }) {
  useRunStages(runId, true);
  return null;
}

describe("useRunStages live invalidation", () => {
  it("invalidates this run's stages query when a matching stage_completed event arrives", () => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <Harness runId={42} />
      </QueryClientProvider>,
    );

    // Note: this hook subscribes to the same "/api/events" EventSource opened
    // by useLiveEvents — in this isolated test there's no LiveEventsProvider,
    // so useRunStages must open its own subscription for run_id-keyed events
    // (a static EVENT_QUERY_MAP entry can't express "only if run_id matches").
    const source = FakeEventSource.instances[0];
    source.emit("stage_completed", { run_id: 42, stage_name: "extractor", status: "ok" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.runs.stages(42) });

    vi.unstubAllGlobals();
  });

  it("ignores stage_completed events for a different run", () => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    render(
      <QueryClientProvider client={queryClient}>
        <Harness runId={42} />
      </QueryClientProvider>,
    );

    const source = FakeEventSource.instances[0];
    source.emit("stage_completed", { run_id: 999, stage_name: "extractor", status: "ok" });

    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.runs.stages(42) });

    vi.unstubAllGlobals();
  });
});
