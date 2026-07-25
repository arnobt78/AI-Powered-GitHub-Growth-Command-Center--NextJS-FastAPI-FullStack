"use client";

import { AlertTriangle, CheckCircle2, Clapperboard, Loader2, Play, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { useDemoAssets, useTriggerDemoAsset } from "@/hooks/use-demo-assets";

const STATUS_META = {
  generating: { icon: Loader2, color: "text-sky-500", label: "Generating…" },
  ready: { icon: CheckCircle2, color: "text-emerald-500", label: "Ready" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
} as const;

export function DemoAssetsSection({ repoId }: { repoId: number }) {
  const { data: assets, isPending, isError } = useDemoAssets(repoId);
  const trigger = useTriggerDemoAsset(repoId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeading icon={Clapperboard} title="Demo Assets" iconColor="text-cyan-500" />
        <Button
          onClick={() =>
            trigger.mutate(undefined, { onError: () => toast.error("Could not start demo generation", { description: "Please try again." }) })
          }
          disabled={trigger.isPending}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {trigger.isPending ? "Starting..." : "Generate"}
        </Button>
      </div>

      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : isError && !assets ? (
        // Gated on !assets (not bare isError) so a background-refetch
        // failure doesn't discard already-visible data for an error block.
        <EmptyState icon={AlertTriangle} title="Couldn't load demo assets" description="Please try refreshing the page." />
      ) : assets && assets.length === 0 ? (
        <EmptyState icon={Clapperboard} title="No demo videos yet" description="Click Generate to record a walkthrough." />
      ) : (
        <div className="space-y-2">
          {assets?.map((asset) => {
            const meta = STATUS_META[asset.status as keyof typeof STATUS_META] ?? STATUS_META.generating;
            const StatusIcon = meta.icon;
            return (
              <Card key={asset.id}>
                <CardContent className="py-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <StatusIcon className={`h-4 w-4 ${meta.color}`} aria-hidden="true" />
                    {meta.label}
                  </p>
                  {asset.status === "failed" && asset.error_message && (
                    <p className="mt-1 text-xs text-red-500">{asset.error_message}</p>
                  )}
                  {asset.status === "ready" && (
                    <div className="mt-2 space-y-2">
                      <video controls className="w-full max-w-md rounded-md" src={`/api/demo-assets/${asset.id}/video`} />
                      <a href={`/api/demo-assets/${asset.id}/video`} download className="text-sm text-sky-500 hover:underline">
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
    </div>
  );
}
