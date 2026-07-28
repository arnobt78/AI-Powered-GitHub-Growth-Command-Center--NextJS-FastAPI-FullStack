/**
 * Stages for one pipeline run — fetched only when the RunRow is expanded.
 *
 * WHY no dedicated EventSource: LiveEventsProvider's single SSE already
 * invalidates `queryKeys.runs.stages(runId)` on `stage_completed` (see
 * use-live-events.ts). A second connection per expanded row was redundant.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import type { StageRun } from "@/lib/api-types";

export function useRunStages(runId: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.runs.stages(runId),
    queryFn: () => fetchJson<StageRun[]>(`/api/runs/${runId}/stages`),
    enabled,
  });
}
