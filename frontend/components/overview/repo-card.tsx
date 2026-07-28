"use client";

import { AlertTriangle, ExternalLink, Eye, GitFork, Lightbulb, Star } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DeltaBadge } from "@/components/ui/delta-badge";
import { StatBadge } from "@/components/ui/stat-badge";
import { SafeImage } from "@/components/safe-image";
import { DeleteRepoButton } from "@/components/overview/delete-repo-button";
import { useRepoSnapshots } from "@/hooks/use-repo-snapshots";
import { useRepoInsights } from "@/hooks/use-repo-insights";
import { semanticColor, CHART_STROKE } from "@/lib/semantic-color";
import type { Repo } from "@/lib/api-types";

export function RepoCard({ repo }: { repo: Repo }) {
  const { data: snapshots, isPending, isError } = useRepoSnapshots(repo.id);
  const { data: insights } = useRepoInsights(repo.id);

  const latest = snapshots?.at(-1);
  const previous = snapshots?.at(-2);
  const starDelta = latest && previous ? latest.stars - previous.stars : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <Link href={`/repos/${repo.id}`} className="flex items-center gap-2 font-medium hover:underline">
          <SafeImage
            src={`https://avatars.githubusercontent.com/${repo.owner}`}
            alt={`${repo.owner} avatar`}
            width={20}
            height={20}
            className="rounded-full"
          />
          {repo.owner}/{repo.name}
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </Link>
        <DeleteRepoButton repo={repo} />
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : isError && !snapshots ? (
          // Gated on !snapshots (not bare isError) so a background-refetch
          // failure doesn't discard already-visible data. Compact inline
          // fallback (not the full EmptyState) — this card sits in a dense
          // grid, so a bordered/padded empty-state block would break the
          // grid's compact layout.
          <div className="flex h-16 items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
            Couldn&apos;t load trend data
          </div>
        ) : (
          <div className="h-16">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={snapshots}>
                <Line type="monotone" dataKey="stars" stroke={CHART_STROKE.sky} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <StatBadge icon={Star} label="Stars" value={latest?.stars ?? 0} color="text-amber-500" mono />
          <StatBadge icon={GitFork} label="Forks" value={latest?.forks ?? 0} color="text-violet-500" mono />
          <StatBadge icon={Eye} label="Watchers" value={latest?.watchers ?? 0} color="text-emerald-500" mono />
          <DeltaBadge value={starDelta} label="Stars change since last snapshot" />
        </div>
        {insights && insights.recommendation_count > 0 && (
          <StatBadge
            icon={Lightbulb}
            label="Open recommendations"
            value={`${insights.recommendation_count} open recommendation${insights.recommendation_count === 1 ? "" : "s"}`}
            // Few open recommendations reads as a mild warning; a growing
            // backlog (3+) escalates to negative so it visually demands attention.
            color={insights.recommendation_count >= 3 ? semanticColor("negative") : semanticColor("warning")}
          />
        )}
      </CardContent>
    </Card>
  );
}
