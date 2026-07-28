"use client";

import { Radar, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DismissIconButton } from "@/components/ui/dismiss-icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxItemCard } from "@/components/ui/inbox-item-card";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import {
  useDismissOpportunity,
  useOpportunities,
  useTriggerOpportunitiesRun,
} from "@/hooks/use-opportunities";
import { useRepoNameById } from "@/hooks/use-repo-name-by-id";
import { startJobToast } from "@/lib/job-toasts";

const SOURCE_LABELS: Record<string, string> = {
  hacker_news: "Hacker News",
  github_discussions: "GitHub Discussions",
};

export function OpportunitiesClient() {
  const { data: opportunities, isPending, isError } = useOpportunities();
  const repoNameById = useRepoNameById();
  const dismiss = useDismissOpportunity();
  const triggerScan = useTriggerOpportunitiesRun();

  const visible = opportunities?.filter((o) => !o.dismissed);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Radar}
        title="Opportunities"
        subtitle="New community mentions of your tracked repos"
        iconColor="text-rose-500"
        action={
          <Button
            onClick={() =>
              triggerScan.mutate(undefined, {
                onSuccess: () =>
                  startJobToast(
                    "opportunities_run",
                    "Scanning communities…",
                    "Checking Hacker News and GitHub Discussions for mentions.",
                  ),
                onError: () =>
                  toast.error("Could not start opportunities scan", { description: "Please try again." }),
              })
            }
            disabled={triggerScan.isPending}
          >
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
            {triggerScan.isPending ? "Scanning..." : "Scan now"}
          </Button>
        }
      />

      <QueryState
        isPending={isPending}
        isError={isError}
        hasData={opportunities !== undefined}
        errorTitle="Couldn't load opportunities"
      >
        {visible && visible.length === 0 ? (
          <EmptyState
            icon={Radar}
            iconColor="text-rose-500"
            title="No opportunities yet"
            description="Click 'Scan now' or wait for the daily schedule to find mentions."
          />
        ) : (
          <div className="space-y-2">
            {visible?.map((opp, index) => (
              <InboxItemCard
                key={opp.id}
                index={index}
                meta={repoNameById.get(opp.repo_id) ?? `repo #${opp.repo_id}`}
                action={
                  <DismissIconButton
                    label="Dismiss opportunity"
                    disabled={dismiss.isPending}
                    onClick={() =>
                      dismiss.mutate(
                        { id: opp.id, dismissed: true },
                        {
                          onError: () =>
                            toast.error("Could not dismiss opportunity", {
                              description: "Please try again.",
                            }),
                        },
                      )
                    }
                  />
                }
              >
                <a href={opp.url} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">
                  {opp.title}
                </a>
                <div className="mt-1">
                  <Chip>{SOURCE_LABELS[opp.source] ?? opp.source}</Chip>
                </div>
              </InboxItemCard>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
