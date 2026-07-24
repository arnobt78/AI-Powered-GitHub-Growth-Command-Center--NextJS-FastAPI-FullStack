"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import type { DemoAsset } from "@/lib/api-types";

export function useDemoAssets(repoId: number) {
  return useQuery({
    queryKey: queryKeys.demoAssets.all,
    queryFn: () => fetchJson<DemoAsset[]>(`/api/repos/${repoId}/demo-assets`),
  });
}

export function useTriggerDemoAsset(repoId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<{ status: string }>(`/api/repos/${repoId}/demo-assets`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.demoAssets.all });
    },
  });
}
