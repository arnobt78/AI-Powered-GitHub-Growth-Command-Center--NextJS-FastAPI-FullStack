/**
 * Overview dashboard page (Server Component).
 *
 * Educational walkthrough
 * -----------------------
 * - `force-dynamic`: per-user data must not be statically cached at the edge.
 * - Prefetch repos + per-repo snapshots/insights in parallel (`Promise.all`).
 * - `dehydrate` + `HydrationBoundary` seed TanStack Query so the client does
 *   not flash empty skeletons for data we already fetched on the server.
 * - Interactive UI lives in `OverviewClient` (`"use client"`).
 * - Never `void` a prefetch that you plan to dehydrate (empty cache → refetch).
 */

import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { OverviewClient } from "@/components/overview/overview-client";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const queryClient = new QueryClient();

  // Seed the list first so we know which repo ids to prefetch next.
  const repos = await api.listRepos();
  queryClient.setQueryData(queryKeys.repos.all, repos);

  // Independent per-repo fetches run in parallel (max latency ≈ slowest one).
  await Promise.all(
    repos.flatMap((repo) => [
      queryClient.prefetchQuery({
        queryKey: queryKeys.repos.snapshots(repo.id),
        queryFn: () => api.listSnapshots(repo.id),
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.repos.insights(repo.id),
        queryFn: () => api.getInsights(repo.id),
      }),
    ]),
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OverviewClient />
    </HydrationBoundary>
  );
}
