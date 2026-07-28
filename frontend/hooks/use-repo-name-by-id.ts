/**
 * Map tracked repo id → "owner/name" for inbox meta lines.
 * Shared so drafts / recommendations / opportunities don't each rebuild the Map.
 */

"use client";

import { useMemo } from "react";
import { useRepos } from "@/hooks/use-repos";

export function useRepoNameById(): Map<number, string> {
  const { data: repos } = useRepos();
  return useMemo(() => {
    const map = new Map<number, string>();
    repos?.forEach((r) => map.set(r.id, `${r.owner}/${r.name}`));
    return map;
  }, [repos]);
}
