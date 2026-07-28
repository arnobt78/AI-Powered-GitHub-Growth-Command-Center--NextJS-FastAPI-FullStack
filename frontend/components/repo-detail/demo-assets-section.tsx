"use client";

import { CheckCircle2, Clapperboard, Loader2, Play, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { useDemoAssets, useTriggerDemoAsset } from "@/hooks/use-demo-assets";
import { startJobToast } from "@/lib/job-toasts";
import { semanticColor } from "@/lib/semantic-color";

const STATUS_META = {
  generating: { icon: Loader2, color: semanticColor("neutral"), label: "Generating…", spin: true },
  ready: { icon: CheckCircle2, color: semanticColor("positive"), label: "Ready", spin: false },
  failed: { icon: XCircle, color: semanticColor("negative"), label: "Failed", spin: false },
} as const;

export function DemoAssetsSection({ repoId }: { repoId: number }) {
  const { data: assets, isPending, isError } = useDemoAssets(repoId);
  const trigger = useTriggerDemoAsset(repoId);

  return (
    <div className="space-y-3">
      <PageHeader
        icon={Clapperboard}
        title="Demo Assets"
        iconColor="text-sky-500"
        action={
          <Button
            onClick={() =>
              trigger.mutate(undefined, {
                onSuccess: () =>
                  startJobToast(
                    "demo_asset",
                    "Recording demo…",
                    "Playwright is capturing the dashboard. This can take a minute.",
                  ),
                onError: () =>
                  toast.error("Could not start demo generation", { description: "Please try again." }),
              })
            }
            disabled={trigger.isPending}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {trigger.isPending ? "Starting..." : "Generate"}
          </Button>
        }
      />

      <QueryState
        isPending={isPending}
        isError={isError}
        hasData={assets !== undefined}
        errorTitle="Couldn't load demo assets"
        skeletonCount={1}
        skeletonClassName="h-24 w-full"
      >
        {assets && assets.length === 0 ? (
          <EmptyState
            icon={Clapperboard}
            iconColor="text-sky-500"
            title="No demo videos yet"
            description="Click Generate to record a walkthrough."
          />
        ) : (
          <div className="space-y-2">
            {assets?.map((asset) => {
              const meta = STATUS_META[asset.status as keyof typeof STATUS_META] ?? STATUS_META.generating;
              const StatusIcon = meta.icon;
              return (
                <Card key={asset.id}>
                  <CardContent className="py-3">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <StatusIcon
                        className={`h-4 w-4 ${meta.color}${meta.spin ? " animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                      {meta.label}
                    </p>
                    {asset.status === "failed" && asset.error_message && (
                      <p className={`mt-1 text-xs ${semanticColor("negative")}`}>{asset.error_message}</p>
                    )}
                    {asset.status === "ready" && (
                      <div className="mt-2 space-y-2">
                        <video
                          controls
                          className="w-full max-w-md rounded-md"
                          src={`/api/demo-assets/${asset.id}/video`}
                        />
                        <a
                          href={`/api/demo-assets/${asset.id}/video`}
                          download
                          className="text-sm text-sky-500 hover:underline"
                        >
                          Download
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </QueryState>
    </div>
  );
}
