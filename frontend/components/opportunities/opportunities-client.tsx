"use client";

import { Radar, X } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { useDismissOpportunity, useOpportunities } from "@/hooks/use-opportunities";
import { useRepos } from "@/hooks/use-repos";

const SOURCE_LABELS: Record<string, string> = {
  hacker_news: "Hacker News",
  github_discussions: "GitHub Discussions",
};

export function OpportunitiesClient() {
  const { data: opportunities } = useOpportunities();
  const { data: repos } = useRepos();
  const dismiss = useDismissOpportunity();

  const repoNameById = useMemo(() => {
    const map = new Map<number, string>();
    repos?.forEach((r) => map.set(r.id, `${r.owner}/${r.name}`));
    return map;
  }, [repos]);

  const visible = opportunities?.filter((o) => !o.dismissed);

  return (
    <div className="space-y-6">
      <SectionHeading icon={Radar} title="Opportunities" subtitle="New community mentions of your tracked repos" iconColor="text-rose-500" />

      {visible && visible.length === 0 ? (
        <EmptyState icon={Radar} title="No opportunities yet" description="They'll show up here once a mention is found." />
      ) : (
        <div className="space-y-2">
          {visible?.map((opp) => (
            <Card key={opp.id}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {repoNameById.get(opp.repo_id) ?? `repo #${opp.repo_id}`}
                  </p>
                  <a href={opp.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {opp.title}
                  </a>
                  <div className="mt-1">
                    <Chip>{SOURCE_LABELS[opp.source] ?? opp.source}</Chip>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Dismiss opportunity"
                  onClick={() =>
                    dismiss.mutate(
                      { id: opp.id, dismissed: true },
                      { onError: () => toast.error("Could not dismiss — try again.") },
                    )
                  }
                  disabled={dismiss.isPending}
                >
                  <X className="h-4 w-4 text-red-500" aria-hidden="true" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
