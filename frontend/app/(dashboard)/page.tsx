/**
 * Overview dashboard page (Server Component).
 *
 * Educational walkthrough
 * -----------------------
 * SSR seeds only `repos.all` so the shell + repo list hydrate immediately.
 * Per-repo snapshots/insights load in RepoCard via TanStack Query — those
 * slots show isPending skeletons on slow networks, not a full-page wait.
 */

import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { OverviewClient } from "@/components/overview/overview-client";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const queryClient = new QueryClient();
  const repos = await api.listRepos();
  queryClient.setQueryData(queryKeys.repos.all, repos);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OverviewClient />
    </HydrationBoundary>
  );
}
