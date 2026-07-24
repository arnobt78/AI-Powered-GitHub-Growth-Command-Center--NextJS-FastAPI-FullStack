"use client";

import { Clapperboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { useDemoAssets, useTriggerDemoAsset } from "@/hooks/use-demo-assets";

const STATUS_LABELS: Record<string, string> = {
  generating: "Generating…",
  ready: "Ready",
  failed: "Failed",
};

export function DemoAssetsSection({ repoId }: { repoId: number }) {
  const { data: assets } = useDemoAssets(repoId);
  const trigger = useTriggerDemoAsset(repoId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionHeading icon={Clapperboard} title="Demo Assets" iconColor="text-cyan-500" />
        <Button
          onClick={() =>
            trigger.mutate(undefined, { onError: () => toast.error("Could not start demo generation") })
          }
          disabled={trigger.isPending}
        >
          {trigger.isPending ? "Starting..." : "Generate"}
        </Button>
      </div>

      {assets && assets.length === 0 ? (
        <EmptyState icon={Clapperboard} title="No demo videos yet" description="Click Generate to record a walkthrough." />
      ) : (
        <div className="space-y-2">
          {assets?.map((asset) => (
            <Card key={asset.id}>
              <CardContent className="py-3">
                <p className="text-sm font-medium">{STATUS_LABELS[asset.status] ?? asset.status}</p>
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
          ))}
        </div>
      )}
    </div>
  );
}
