"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

const EVENT_QUERY_MAP: Record<string, QueryKey[]> = {
  repo_added: [queryKeys.repos.all],
  // Backend cascades repo deletion to that repo's recommendations/drafts (ON DELETE
  // CASCADE) — other open tabs need those inboxes invalidated too, not just the repo list.
  repo_removed: [queryKeys.repos.all, queryKeys.recommendations.all, queryKeys.drafts.all],
  // Payload only carries {id, dismissed} (no repo_id — see backend app/api/recommendations.py),
  // so we can't target one repo's insights key; invalidate repos.all (prefix-matches
  // ["repos", id, "insights"] too) to refresh the recommendation_count badge everywhere.
  recommendation_updated: [queryKeys.recommendations.all, queryKeys.repos.all],
  run_completed: [queryKeys.runs.all, queryKeys.repos.all, queryKeys.recommendations.all],
  draft_updated: [queryKeys.drafts.all],
  drafts_generated: [queryKeys.drafts.all, queryKeys.runs.all],
  opportunities_generated: [queryKeys.opportunities.all, queryKeys.runs.all],
  opportunity_updated: [queryKeys.opportunities.all],
  // Payload only carries {id, status} where id is the demo asset id, not a repo_id
  // (see backend app/demo_asset_jobs.py) — there's no repoId to build a scoped
  // ["repos", repoId, "demo-assets"] key from, and falling back to a broad
  // queryKeys.repos.all prefix match would over-invalidate every other repo-scoped
  // query (snapshots, insights, benchmarks, ...) for every repo just to catch demo
  // assets. useTriggerDemoAsset's own onSuccess already invalidates the triggering
  // tab; cross-tab refresh for other tabs viewing the same repo is left as a
  // nice-to-have, not wired here.
  user_updated: [queryKeys.users.me],
};

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
    };

    for (const eventType of Object.keys(EVENT_QUERY_MAP)) {
      source.addEventListener(eventType, handler);
    }

    return () => {
      source.close();
    };
  }, [queryClient, status]);
}
