"use client";

import { AlertTriangle } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepoSnapshots } from "@/hooks/use-repo-snapshots";

export function TrendChart({ repoId }: { repoId: number }) {
  const { data: snapshots, isPending, isError } = useRepoSnapshots(repoId);

  if (isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  // isError alone would also fire on a background-refetch failure that
  // leaves prior data intact (TanStack Query's isLoadingError vs
  // isRefetchError distinction) — gating on !snapshots keeps already-visible
  // data on screen instead of discarding it for an error block.
  if (isError && !snapshots) {
    return <EmptyState icon={AlertTriangle} title="Couldn't load trend data" description="Please try refreshing the page." />;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={snapshots}>
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Line type="monotone" dataKey="stars" stroke="#f59e0b" strokeWidth={2} dot={false} name="Stars" />
          <Line type="monotone" dataKey="forks" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Forks" />
          <Line type="monotone" dataKey="views_14d" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Views (14d)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
