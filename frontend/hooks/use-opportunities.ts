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
