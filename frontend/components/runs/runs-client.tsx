"use client";

import { History, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { useRuns, useTriggerRun } from "@/hooks/use-runs";
import { RunRow } from "@/components/runs/run-row";
import { startJobToast } from "@/lib/job-toasts";

export function RunsClient() {
  const { data: runs, isPending, isError } = useRuns();
  const triggerRun = useTriggerRun();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={History}
        title="Pipeline runs"
        subtitle="Execution history, per-stage status"
        iconColor="text-violet-500"
        action={
          <Button
            onClick={() =>
              triggerRun.mutate(undefined, {
                onSuccess: () =>
                  startJobToast(
                    "analytics_run",
                    "Running analytics…",
                    "This may take a few minutes. Stages will appear as they finish.",
                  ),
                onError: () => toast.error("Could not trigger a run", { description: "Please try again." }),
              })
            }
            disabled={triggerRun.isPending}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {triggerRun.isPending ? "Running..." : "Run now"}
          </Button>
        }
      />
      <QueryState
        isPending={isPending}
        isError={isError}
        hasData={runs !== undefined}
        errorTitle="Couldn't load runs"
      >
        {runs && runs.length === 0 ? (
          <EmptyState
            icon={History}
            iconColor="text-violet-500"
            title="No runs yet"
            description="Trigger one manually or wait for the daily schedule."
          />
        ) : (
          <div className="space-y-2">
            {runs?.map((run, index) => <RunRow key={run.id} run={run} index={index} />)}
          </div>
        )}
      </QueryState>
    </div>
  );
}
