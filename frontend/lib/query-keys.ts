/**
 * Stable TanStack Query key factory — single source of truth for cache identity.
 *
 * Educational walkthrough
 * -----------------------
 * Always import keys from here (never hard-code `["repos"]` in components).
 * Mutations + SSE handlers invalidate these keys so the current page and every
 * other open tab refresh immediately without a full page reload.
 *
 * Nested factories (e.g. `repos.snapshots(id)`) keep related data hierarchical
 * so prefix invalidation of `repos.all` can refresh nested insight queries too.
 */

export const queryKeys = {
  repos: {
    all: ["repos"] as const,
    snapshots: (id: number) => ["repos", id, "snapshots"] as const,
    insights: (id: number) => ["repos", id, "insights"] as const,
    benchmarks: (id: number) => ["repos", id, "benchmarks"] as const,
    referrers: (id: number) => ["repos", id, "referrers"] as const,
    popularPaths: (id: number) => ["repos", id, "popular-paths"] as const,
  },
  recommendations: {
    all: ["recommendations"] as const,
  },
  drafts: {
    all: ["drafts"] as const,
  },
  runs: {
    all: ["runs"] as const,
    stages: (id: number) => ["runs", id, "stages"] as const,
  },
  providers: {
    status: ["providers", "status"] as const,
  },
  opportunities: {
    all: ["opportunities"] as const,
  },
  demoAssets: {
    forRepo: (repoId: number) => ["repos", repoId, "demo-assets"] as const,
  },
  users: {
    me: ["users", "me"] as const,
  },
};
