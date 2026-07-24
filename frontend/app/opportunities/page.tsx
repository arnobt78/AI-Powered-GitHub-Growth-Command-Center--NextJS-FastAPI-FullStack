import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { OpportunitiesClient } from "@/components/opportunities/opportunities-client";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const queryClient = new QueryClient();

  const [opportunities, repos] = await Promise.all([api.listOpportunities(), api.listRepos()]);
  queryClient.setQueryData(queryKeys.opportunities.all, opportunities);
  queryClient.setQueryData(queryKeys.repos.all, repos);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OpportunitiesClient />
    </HydrationBoundary>
  );
}
