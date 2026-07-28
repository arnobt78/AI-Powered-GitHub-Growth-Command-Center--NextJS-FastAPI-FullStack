"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import type { Opportunity } from "@/lib/api-types";

export function useOpportunities() {
  return useQuery({
    queryKey: queryKeys.opportunities.all,
    queryFn: () => fetchJson<Opportunity[]>("/api/opportunities"),
  });
}

export function useDismissOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dismissed }: { id: number; dismissed: boolean }) =>
      fetchJson<Opportunity>(`/api/opportunities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ dismissed }),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Opportunity[]>(queryKeys.opportunities.all, (current) =>
        current?.map((o) => (o.id === updated.id ? updated : o)) ?? [],
      );
    },
  });
}

export function useTriggerOpportunitiesRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<{ status: string }>("/api/runs/opportunities", { method: "POST" }),
    onSuccess: () => {
      // Same 202 race as analytics/content — stage_completed SSE invalidates
      // runs.all once the PipelineRun row exists; opportunities_generated
      // refreshes the inbox when the scan finishes.
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.all });
    },
  });
}
