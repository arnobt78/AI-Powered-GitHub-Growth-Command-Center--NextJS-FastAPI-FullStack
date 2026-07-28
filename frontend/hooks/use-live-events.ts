/**
 * SSE → TanStack Query bridge (client-only).
 *
 * Educational walkthrough
 * -----------------------
 * Opens `EventSource("/api/events")` when authenticated. Each named backend
 * event invalidates the mapped query keys so Overview, inboxes, Runs, etc.
 * stay fresh across tabs without `router.refresh()` or full reloads.
 *
 * Keep EVENT_QUERY_MAP in parity with backend `broadcaster.publish(...)` call sites.
 *
 * WHY no custom onerror reconnect: the browser EventSource API already
 * reconnects automatically when the BFF/backend drops the stream (e.g.
 * uvicorn --reload). We only close on unmount / sign-out.
 */

"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { finishJobToast } from "@/lib/job-toasts";
import { queryKeys } from "@/lib/query-keys";

const EVENT_QUERY_MAP: Record<string, QueryKey[]> = {
  repo_added: [queryKeys.repos.all],
  // Backend cascades repo deletion to that repo's recommendations/drafts/opportunities
  // (ON DELETE CASCADE) — other open tabs need those inboxes invalidated too, not just
  // the repo list.
  repo_removed: [queryKeys.repos.all, queryKeys.recommendations.all, queryKeys.drafts.all, queryKeys.opportunities.all],
  // Payload only carries {id, dismissed} (no repo_id — see backend app/api/recommendations.py),
  // so we can't target one repo's insights key; invalidate repos.all (prefix-matches
  // ["repos", id, "insights"] too) to refresh the recommendation_count badge everywhere.
  recommendation_updated: [queryKeys.recommendations.all, queryKeys.repos.all],
  // The analytics and content pipelines are the only place LLMUsage rows change
  // (Synthesizer / ContentSynthesizer / ContentValidator make the actual LLM
  // calls) — the opportunities pipeline's stages never touch LLMRouter — so the
  // Settings provider-status table rides only these two completion events
  // instead of polling; there's no per-call event to key off of.
  run_completed: [queryKeys.runs.all, queryKeys.repos.all, queryKeys.recommendations.all, queryKeys.providers.status],
  draft_updated: [queryKeys.drafts.all],
  drafts_generated: [queryKeys.drafts.all, queryKeys.runs.all, queryKeys.providers.status],
  opportunities_generated: [queryKeys.opportunities.all, queryKeys.runs.all],
  opportunity_updated: [queryKeys.opportunities.all],
  // Payload only carries {id, status} where id is the demo asset id, not a repo_id
  // (see backend app/demo_asset_jobs.py), so we can't target one repo's scoped
  // ["repos", repoId, "demo-assets"] key. Video generation runs as a background
  // job that can take many seconds — useTriggerDemoAsset's onSuccess fires on the
  // 202 response, before the job finishes, so this SSE event is the only signal
  // that status actually changed to ready/failed. Under-invalidating here means
  // the UI silently never updates without a manual refresh, which is worse than
  // the over-invalidation cost of a repos.all prefix match (same tradeoff as
  // recommendation_updated above).
  demo_asset_updated: [queryKeys.repos.all],
  user_updated: [queryKeys.users.me],
  // PipelineRun rows are committed per-stage inside BackgroundTasks after the
  // HTTP 202 returns. Invalidating runs.all on the first stage_completed closes
  // the race where an immediate post-trigger refetch still saw an empty list.
  stage_completed: [queryKeys.runs.all],
};

function parsePayload(data: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // non-JSON payloads are treated as empty
  }
  return {};
}

function finishToastsForEvent(eventType: string, payload: Record<string, unknown>) {
  if (eventType === "drafts_generated") {
    finishJobToast("content_run", {
      ok: true,
      title: "Drafts ready",
      description: "New suggestions are in your Drafts inbox.",
    });
    return;
  }
  if (eventType === "run_completed") {
    finishJobToast("analytics_run", {
      ok: true,
      title: "Analytics run finished",
      description: "Insights and recommendations are up to date.",
    });
    return;
  }
  if (eventType === "opportunities_generated") {
    finishJobToast("opportunities_run", {
      ok: true,
      title: "Opportunities scan finished",
      description: "Check the Opportunities inbox for new mentions.",
    });
    return;
  }
  if (eventType === "demo_asset_updated") {
    const status = payload.status;
    if (status === "ready") {
      finishJobToast("demo_asset", {
        ok: true,
        title: "Demo video ready",
        description: "Open the repo page to play or download it.",
      });
    } else if (status === "failed") {
      finishJobToast("demo_asset", {
        ok: false,
        title: "Demo generation failed",
        description: "Check the demo assets section for details.",
      });
    }
    // "generating" / "expired" — leave loading toast alone or ignore
  }
}

export function useLiveEvents() {
  const queryClient = useQueryClient();
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const source = new EventSource("/api/events");

    const handler = (event: MessageEvent) => {
      const keysToInvalidate = EVENT_QUERY_MAP[event.type] ?? [];
      for (const key of keysToInvalidate) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      const payload = parsePayload(String(event.data ?? "{}"));
      // stage_completed carries run_id — also refresh that run's stages list so
      // expanded RunRows update without a second EventSource connection.
      if (event.type === "stage_completed") {
        const runId = payload.run_id;
        if (typeof runId === "number") {
          queryClient.invalidateQueries({ queryKey: queryKeys.runs.stages(runId) });
        }
      }
      finishToastsForEvent(event.type, payload);
    };

    for (const eventType of Object.keys(EVENT_QUERY_MAP)) {
      source.addEventListener(eventType, handler);
    }

    return () => {
      source.close();
    };
  }, [queryClient, status]);
}
