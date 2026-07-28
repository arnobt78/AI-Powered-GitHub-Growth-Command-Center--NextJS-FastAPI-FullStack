"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Filter, Lightbulb, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DismissIconButton } from "@/components/ui/dismiss-icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxItemCard } from "@/components/ui/inbox-item-card";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { useDismissRecommendation, useRecommendations } from "@/hooks/use-recommendations";
import { useRepoNameById } from "@/hooks/use-repo-name-by-id";

export function RecommendationsClient() {
  const { data: recommendations, isPending, isError } = useRecommendations();
  const repoNameById = useRepoNameById();
  const dismiss = useDismissRecommendation();
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(recommendations?.map((r) => r.category) ?? [])),
    [recommendations],
  );

  const visible = recommendations?.filter(
    (r) => !r.dismissed && (categoryFilter === null || r.category === categoryFilter),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Lightbulb}
        title="Recommendations inbox"
        subtitle="Fact-checked suggestions across every tracked repo"
        iconColor="text-amber-500"
      />

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Button
            variant={categoryFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setCategoryFilter(null)}
          >
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            All
          </Button>
          {categories.map((category) => (
            <Button
              key={category}
              variant={categoryFilter === category ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter(category)}
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              {category}
            </Button>
          ))}
        </div>
      )}

      <QueryState
        isPending={isPending}
        isError={isError}
        hasData={recommendations !== undefined}
        errorTitle="Couldn't load recommendations"
      >
        {visible && visible.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            iconColor="text-emerald-500"
            title="Inbox zero"
            description="No open recommendations right now."
          />
        ) : (
          <div className="space-y-2">
            {visible?.map((rec, index) => (
              <InboxItemCard
                key={rec.id}
                index={index}
                meta={repoNameById.get(rec.repo_id) ?? `repo #${rec.repo_id}`}
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
