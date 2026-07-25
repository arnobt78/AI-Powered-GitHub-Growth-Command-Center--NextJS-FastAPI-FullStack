import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunRow } from "@/components/runs/run-row";
import * as useRunStagesModule from "@/hooks/use-run-stages";
import type { PipelineRun, StageRun } from "@/lib/api-types";

// Regression test for the STAGE_ORDER prefix bug (Task 11 review fix):
// STAGE_ORDER used unprefixed stage names ("extractor", "analyzer", ...) for
// every pipeline kind, but the backend's real Stage.name for content/
// opportunities stages is prefixed ("content_extractor", "opportunity_extractor",
// see backend/app/pipeline/content/*.py and backend/app/pipeline/opportunities/*.py).
// Against the buggy unprefixed STAGE_ORDER, `stages?.find((s) => s.stage_name ===
// stageName)` never matches a real content/opportunities StageRun, so this test's
// assertions on the real duration/status would fail (the pending-stage branch
// would render instead of the completed-stage branch).
function mockUseRunStages(stages: StageRun[]) {
  vi.spyOn(useRunStagesModule, "useRunStages").mockReturnValue({
    data: stages,
    isPending: false,
  } as unknown as ReturnType<typeof useRunStagesModule.useRunStages>);
}

const contentRun: PipelineRun = {
  id: 7,
  status: "running",
  pipeline_kind: "content",
  started_at: "2026-07-25T00:00:00Z",
  finished_at: null,
};

describe("RunRow content-kind stage rendering", () => {
  it("renders real stage data for a completed content_extractor StageRun", () => {
    mockUseRunStages([
      { id: 1, stage_name: "content_extractor", status: "ok", duration_ms: 321, error: null },
    ]);

    render(<RunRow run={contentRun} />);
    fireEvent.click(screen.getByRole("button", { name: /Run #7/i }));

    expect(screen.getByText("content_extractor")).toBeInTheDocument();
    expect(screen.getByText("321ms")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  // Regression test for the failed-stage-shows-green-checkmark bug (final
  // whole-branch review finding): StageRowLine used to hardcode CheckCircle2
  // + text-emerald-500 regardless of stageRow.status, so an errored stage
  // showed a green success checkmark next to red "error" text. Against that
  // bug this test's icon-color assertion would fail (icon stays emerald).
  it("renders a red icon, not a green checkmark, for a failed stage", () => {
    mockUseRunStages([
      { id: 2, stage_name: "content_extractor", status: "error", duration_ms: 45, error: "boom" },
    ]);

    render(<RunRow run={contentRun} />);
    fireEvent.click(screen.getByRole("button", { name: /Run #7/i }));

    const icon = screen.getByText("content_extractor").parentElement?.querySelector("svg");
    expect(icon).toHaveClass("text-red-500");
    expect(icon).not.toHaveClass("text-emerald-500");
  });
});
