import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { BackendError } from "@/lib/backend-client";
import { queryKeys } from "@/lib/query-keys";
import { runWithRecordingToken } from "@/lib/request-identity";
import { RepoDetailClient } from "@/components/repo-detail/repo-detail-client";

export const dynamic = "force-dynamic";

export default async function RepoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recording_token?: string }>;
}) {
  const { id } = await params;
  const { recording_token: recordingToken } = await searchParams;
  const repoId = Number(id);

  // DemoRecorder's headless browser has no Auth.js session — a valid,
  // repo-scoped recording_token (see lib/request-identity.ts) lets
  // backendFetch resolve a real backend identity for this render instead
  // of every prefetch call below 401ing.
  return runWithRecordingToken(recordingToken, async () => {
    const queryClient = new QueryClient();

    let repo;
    try {
      repo = await api.getRepo(repoId);
    } catch (error) {
      if (error instanceof BackendError && error.status === 404) {
        notFound();
      }
      throw error;
    }

    await Promise.all([
      queryClient.prefetchQuery({ queryKey: queryKeys.repos.snapshots(repoId), queryFn: () => api.listSnapshots(repoId) }),
      queryClient.prefetchQuery({ queryKey: queryKeys.repos.benchmarks(repoId), queryFn: () => api.listBenchmarks(repoId) }),
      queryClient.prefetchQuery({ queryKey: queryKeys.repos.referrers(repoId), queryFn: () => api.listReferrers(repoId) }),
      queryClient.prefetchQuery({ queryKey: queryKeys.repos.popularPaths(repoId), queryFn: () => api.listPopularPaths(repoId) }),
      queryClient.prefetchQuery({ queryKey: queryKeys.recommendations.all, queryFn: () => api.listRecommendations() }),
      queryClient.prefetchQuery({ queryKey: queryKeys.demoAssets.forRepo(repoId), queryFn: () => api.listDemoAssets(repoId) }),
    ]);

    return (
      <HydrationBoundary state={dehydrate(queryClient)}>
        <RepoDetailClient repo={repo} />
      </HydrationBoundary>
    );
  });
}
