"use client";

import { CheckCircle2, Copy, Inbox, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxItemCard } from "@/components/ui/inbox-item-card";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { DraftContent } from "@/components/drafts/draft-content";
import { useDrafts, useReviewDraft, useTriggerContentRun } from "@/hooks/use-drafts";
import { useRepoNameById } from "@/hooks/use-repo-name-by-id";
import { suggestedTextForCopy } from "@/lib/draft-copy";
import { startJobToast } from "@/lib/job-toasts";
import type { DraftKind } from "@/types/drafts";

const DRAFT_KIND_LABELS: Record<string, string> = {
  readme_suggestion: "README suggestion",
  missing_doc_suggestion: "Missing doc",
  topic_suggestion: "Topic suggestion",
  seo_suggestion: "SEO suggestion",
  release_notes: "Release notes",
  issue_reply: "Issue reply",
  discussion_reply: "Discussion reply",
} satisfies Record<DraftKind, string>;

const REPLY_KINDS = new Set(["issue_reply", "discussion_reply"]);

export function DraftsClient() {
  const { data: drafts, isPending, isError } = useDrafts();
  const repoNameById = useRepoNameById();
  const review = useReviewDraft();
  const triggerContentRun = useTriggerContentRun();

  const pending = drafts?.filter((d) => d.status === "pending");
  const hasReviewed = Boolean(drafts?.some((d) => d.status !== "pending"));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Inbox}
        title="Drafts"
        subtitle="Review before anything goes out"
        iconColor="text-emerald-500"
        action={
          <Button
            onClick={() =>
              triggerContentRun.mutate(undefined, {
                onSuccess: () =>
                  startJobToast(
                    "content_run",
                    "Generating drafts…",
                    "This may take a minute. We'll notify you when they're ready.",
                  ),
                onError: () =>
                  toast.error("Could not start content generation", { description: "Please try again." }),
              })
            }
            disabled={triggerContentRun.isPending}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {triggerContentRun.isPending ? "Generating..." : "Generate drafts"}
          </Button>
        }
      />

      <QueryState
        isPending={isPending}
        isError={isError}
        hasData={drafts !== undefined}
        errorTitle="Couldn't load drafts"
      >
        {pending && pending.length === 0 ? (
          <EmptyState
            icon={hasReviewed ? CheckCircle2 : Inbox}
            iconColor={hasReviewed ? "text-emerald-500" : "text-emerald-500"}
            title={hasReviewed ? "Inbox clear" : "No drafts yet"}
            description={
              hasReviewed
                ? "All drafts have been reviewed. Generate again anytime for fresh suggestions."
                : "Click 'Generate drafts' or wait for the daily schedule."
            }
          />
        ) : (
          <div className="space-y-2">
            {pending?.map((draft, index) => {
              const copyText = suggestedTextForCopy(draft.kind, draft.content);
              return (
                <InboxItemCard
                  key={draft.id}
                  index={index}
                  meta={
                    <>
                      {draft.repo_id !== null
                        ? repoNameById.get(draft.repo_id) ?? `repo #${draft.repo_id}`
                        : "Account-level"}
                      {" · "}
                      {DRAFT_KIND_LABELS[draft.kind] ?? draft.kind}
                      {draft.kind === "release_notes" && ` (${draft.target})`}
                    </>
                  }
                  action={
                    <>
                      {copyText ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Copy suggested text"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(copyText);
                              toast.success("Copied to clipboard");
                            } catch {
                              toast.error("Could not copy", { description: "Clipboard permission denied." });
                            }
                          }}
                        >
                          <Copy className="h-4 w-4 text-sky-500" aria-hidden="true" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Approve draft"
                        onClick={() =>
                          review.mutate(
                            { id: draft.id, status: "approved" },
                            {
                              onSuccess: (updated) => {
                                if (updated.status === "posted") {
                                  toast.success("Reply posted to GitHub", {
                                    description: "Your approved reply is now live.",
                                  });
                                } else if (updated.status === "failed") {
                                  toast.error("Could not post reply", {
                                    description: updated.error_message ?? "Unknown error.",
                                  });
                                } else if (!REPLY_KINDS.has(draft.kind)) {
                                  toast.success("Draft approved", {
                                    description:
                                      "Removed from the pending inbox. Use Copy if you still need the text.",
                                  });
                                }
                              },
                              onError: () =>
                                toast.error("Could not approve draft", { description: "Please try again." }),
                            },
                          )
                        }
                        disabled={review.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Reject draft"
                        onClick={() =>
                          review.mutate(
                            { id: draft.id, status: "rejected" },
                            {
                              onSuccess: () =>
                                toast.success("Draft rejected", {
                                  description: "Removed from the pending inbox.",
                                }),
                              onError: () =>
                                toast.error("Could not reject draft", { description: "Please try again." }),
                            },
                          )
                        }
                        disabled={review.isPending}
                      >
                        <X className="h-4 w-4 text-red-500" aria-hidden="true" />
                      </Button>
                    </>
                  }
                >
                  <DraftContent kind={draft.kind} content={draft.content} />
                </InboxItemCard>
              );
            })}
          </div>
        )}
      </QueryState>
    </div>
  );
}
