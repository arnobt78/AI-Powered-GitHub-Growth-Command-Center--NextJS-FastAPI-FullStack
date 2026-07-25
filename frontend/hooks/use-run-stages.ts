"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import type { StageRun } from "@/lib/api-types";

export function useRunStages(runId: number, enabled: boolean) {
  const queryClient = useQueryClient();

  // Payload-keyed by run_id, not a static queryKey — the shared
  // EVENT_QUERY_MAP in use-live-events.ts can't express "only invalidate if
  // this event's run_id matches this specific hook instance's runId", so
  // this hook opens its own small, dedicated subscription instead, matching
  // the connection-per-consumer shape useLiveEvents already establishes.
  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource("/api/events");
    const handler = (event: MessageEvent) => {
      // Live event stream — a malformed frame has nothing useful to recover
      // to, so skip it silently rather than letting JSON.parse throw
      // uncaught inside the listener and take down the subscription.
      try {
        const payload = JSON.parse(event.data) as { run_id: number; stage_name: string; status: string };
        if (payload.run_id === runId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.runs.stages(runId) });
        }
      } catch {
        // Ignore malformed frame.
      }
    };
    source.addEventListener("stage_completed", handler);

    return () => source.close();
  }, [enabled, runId, queryClient]);

  return useQuery({
    queryKey: queryKeys.runs.stages(runId),
    queryFn: () => fetchJson<StageRun[]>(`/api/runs/${runId}/stages`),
    enabled,
  });
}
