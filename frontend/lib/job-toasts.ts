/**
 * Stable loading→completion toasts for long-running background jobs.
 *
 * Educational walkthrough
 * -----------------------
 * Trigger mutations return HTTP 202 before the pipeline finishes. Kickoff
 * ``toast.success`` lied about completion; instead we keep one Sonner toast
 * id per job kind via ``toast.loading``, then flip it to success/error when
 * the matching SSE event arrives in ``useLiveEvents``.
 *
 * Browser EventSource already reconnects on drop — no toast state needed for that.
 */

import { toast } from "sonner";

export type JobToastKind =
  | "analytics_run"
  | "content_run"
  | "demo_asset"
  | "opportunities_run";

const TOAST_IDS: Record<JobToastKind, string> = {
  analytics_run: "job-analytics-run",
  content_run: "job-content-run",
  demo_asset: "job-demo-asset",
  opportunities_run: "job-opportunities-run",
};

/** Active kinds that still have a loading toast open (module-scoped). */
const pending = new Set<JobToastKind>();

export function startJobToast(
  kind: JobToastKind,
  title: string,
  description?: string,
): void {
  pending.add(kind);
  toast.loading(title, {
    id: TOAST_IDS[kind],
    description,
  });
}

export function finishJobToast(
  kind: JobToastKind,
  result: {
    ok: boolean;
    title: string;
    description?: string;
  },
): void {
  // Ignore completion events when this tab never started the job (e.g. other
  // tab's SSE, or a scheduled run) — avoid spurious success toasts.
  if (!pending.has(kind)) return;
  pending.delete(kind);
  if (result.ok) {
    toast.success(result.title, {
      id: TOAST_IDS[kind],
      description: result.description,
    });
  } else {
    toast.error(result.title, {
      id: TOAST_IDS[kind],
      description: result.description,
    });
  }
}
