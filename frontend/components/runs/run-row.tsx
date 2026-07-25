"use client";

import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronRight, Circle, Loader2, Radar, Sparkles } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunStages } from "@/hooks/use-run-stages";
import type { PipelineRun } from "@/lib/api-types";
import { staggerDelay } from "@/lib/stagger";

const STATUS_META = {
  ok: { icon: CheckCircle2, color: "text-emerald-500", label: "OK" },
  degraded: { icon: AlertTriangle, color: "text-amber-500", label: "Degraded" },
  running: { icon: Loader2, color: "text-sky-500", label: "Running" },
} as const;

const KIND_META = {
  analytics: { icon: BarChart3, color: "text-sky-500", label: "Analytics" },
  content: { icon: Sparkles, color: "text-fuchsia-500", label: "Content" },
  opportunities: { icon: Radar, color: "text-rose-500", label: "Opportunities" },
} as const;

// Stages run strictly in this declared order (mirrors the backend's
// build_stages / build_content_stages / opportunities stage list) — knowing
// the order lets the UI infer "which stage is active right now" from just
// the set of already-completed stage names, with no separate "started" event.
// NOTE: only `analytics` stage names are unprefixed (backend/app/pipeline/*.py
// -> name = "extractor", etc). `content` and `opportunities` stages are
// prefixed by their pipeline kind (backend/app/pipeline/content/*.py -> name =
// "content_extractor", etc; backend/app/pipeline/opportunities/*.py -> name =
// "opportunity_extractor" / "opportunity_assembler") — StageRun.stage_name and
// the stage_completed SSE payload both come straight from Stage.name
// (backend/app/pipeline/runner.py), so these strings must match exactly.
const STAGE_ORDER: Record<keyof typeof KIND_META, string[]> = {
  analytics: ["extractor", "preprocessor", "analyzer", "optimizer", "synthesizer", "validator", "assembler"],
  content: [
    "content_extractor",
    "content_analyzer",
    "content_preprocessor",
    "content_optimizer",
    "content_synthesizer",
    "content_validator",
    "content_assembler",
  ],
  opportunities: ["opportunity_extractor", "opportunity_assembler"],
};

// `index` defaults to 0 (rather than being required) so call sites that don't
// care about list position — e.g. the Task 11 regression test rendering a
// single RunRow in isolation — don't need to thread a meaningless value
// through; mirrors the optional-prop-with-default pattern used by Card's
// `size` prop (components/ui/card.tsx).
export function RunRow({ run, index = 0 }: { run: PipelineRun; index?: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data: stages, isPending } = useRunStages(run.id, expanded);
  const meta = STATUS_META[run.status as keyof typeof STATUS_META] ?? STATUS_META.running;
  const StatusIcon = meta.icon;
  const kindKey = (run.pipeline_kind as keyof typeof KIND_META) in KIND_META ? (run.pipeline_kind as keyof typeof KIND_META) : "analytics";
  const kindMeta = KIND_META[kindKey];
  const KindIcon = kindMeta.icon;

  const completedNames = new Set(stages?.map((s) => s.stage_name));
  const nextPendingIndex = STAGE_ORDER[kindKey].findIndex((name) => !completedNames.has(name));

  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards motion-reduce:animate-none"
      style={staggerDelay(index)}
    >
      <CardContent className="py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={expanded}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            Run #{run.id}
            <span className={`flex items-center gap-1 text-xs ${kindMeta.color}`}>
              <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {kindMeta.label}
            </span>
          </span>
          <span className={`flex items-center gap-1 text-sm ${meta.color}`}>
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            {meta.label}
          </span>
        </button>
        {expanded && (
          <div className="mt-3 space-y-1 border-t pt-3">
            {isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              STAGE_ORDER[kindKey].map((stageName, index) => {
                const stageRow = stages?.find((s) => s.stage_name === stageName);
                const isActive = run.status === "running" && index === nextPendingIndex;
                const isPendingStage = run.status === "running" && index > nextPendingIndex;

                if (stageRow) {
                  return (
                    <div key={stageName} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                          {stageRow.stage_name}
                        </span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          {stageRow.duration_ms}ms
                          <span className={stageRow.status === "ok" ? "text-emerald-500" : "text-red-500"}>{stageRow.status}</span>
                        </span>
                      </div>
                      {stageRow.error && <p className="mt-0.5 text-xs text-red-500">{stageRow.error}</p>}
                    </div>
                  );
                }

                return (
                  <div key={stageName} className={`flex items-center gap-1.5 text-sm ${isPendingStage ? "text-muted-foreground/50" : ""}`}>
                    {isActive ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" aria-hidden="true" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/40" aria-hidden="true" />
                    )}
                    <span className={isActive ? "font-medium text-sky-500" : ""}>{stageName}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
