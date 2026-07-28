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
 * A soft timeout closes the spinner if SSE never arrives (empty repo list,
 * all skipped on needs_reauth, or a dropped stream before reconnect).
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
const timers = new Map<JobToastKind, ReturnType<typeof setTimeout>>();

/** Safety net when completion SSE never fires for this tab's kickoff. */
const TIMEOUT_MS = 3 * 60 * 1000;

function clearTimer(kind: JobToastKind): void {
  const handle = timers.get(kind);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(kind);
  }
}

export function startJobToast(
  kind: JobToastKind,
  title: string,
  description?: string,
): void {
  clearTimer(kind);
  pending.add(kind);
  toast.loading(title, {
    id: TOAST_IDS[kind],
    description,
  });
  timers.set(
    kind,
    setTimeout(() => {
      finishJobToast(kind, {
        ok: false,
        title: "Still working…",
        description: "Check Runs or refresh — the live update may have been missed.",
      });
    }, TIMEOUT_MS),
  );
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
  clearTimer(kind);
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
