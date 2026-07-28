"use client";

import { CheckCircle2, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { DismissIconButton } from "@/components/ui/dismiss-icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxItemCard } from "@/components/ui/inbox-item-card";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { useDismissRecommendation, useRecommendations } from "@/hooks/use-recommendations";

export function RepoRecommendations({ repoId }: { repoId: number }) {
  const { data: recommendations, isPending, isError } = useRecommendations();
  const dismiss = useDismissRecommendation();

  const scoped = recommendations?.filter((r) => r.repo_id === repoId && !r.dismissed);

  return (
    <div className="space-y-3">
      <PageHeader
        icon={Lightbulb}
        title="Recommendations"
        subtitle="Fact-checked suggestions for this repo"
        iconColor="text-amber-500"
      />
      <QueryState
        isPending={isPending}
        isError={isError}
        hasData={recommendations !== undefined}
        errorTitle="Couldn't load recommendations"
        skeletonCount={1}
        skeletonClassName="h-24 w-full"
      >
        {scoped && scoped.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            iconColor="text-emerald-500"
            title="All caught up"
            description="No open recommendations for this repo."
          />
        ) : (
          <div className="space-y-2">
            {scoped?.map((rec, index) => (
              <InboxItemCard
                key={rec.id}
                index={index}
                action={
                  <DismissIconButton
                    label="Dismiss recommendation"
                    disabled={dismiss.isPending}
                    onClick={() =>
                      dismiss.mutate(
                        { id: rec.id, dismissed: true },
                        {
                          onError: () =>
                            toast.error("Could not dismiss recommendation", {
                              description: "Please try again.",
                            }),
                        },
                      )
                    }
                  />
                }
              >
                <p className="font-medium text-foreground">{rec.title}</p>
                <p className="text-sm text-muted-foreground">{rec.body}</p>
              </InboxItemCard>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
