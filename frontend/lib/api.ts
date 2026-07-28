/**
 * Typed facade over `backendFetch` — one method per backend endpoint.
 *
 * Educational walkthrough: pages/hooks call `api.*` instead of raw URLs so
 * path changes stay centralized. Types come from OpenAPI-generated helpers
 * in `lib/api-types` (regenerate with `npm run generate:types`).
 */

import { backendFetch } from "@/lib/backend-client";
import type {
  Benchmark,
  DemoAsset,
  Draft,
  Insights,
  Opportunity,
  PipelineRun,
  PopularPath,
  ProviderStatus,
  Recommendation,
  Referrer,
  Repo,
  RepoCreate,
  Snapshot,
  StageRun,
  UserOut,
} from "@/lib/api-types";

export const api = {
  listRepos: () => backendFetch<Repo[]>("/repos"),
  getRepo: (id: number) => backendFetch<Repo>(`/repos/${id}`),
  createRepo: (payload: RepoCreate) =>
    backendFetch<Repo>("/repos", { method: "POST", body: JSON.stringify(payload) }),
  deleteRepo: (id: number) => backendFetch<void>(`/repos/${id}`, { method: "DELETE" }),

  listSnapshots: (id: number) => backendFetch<Snapshot[]>(`/repos/${id}/snapshots`),
  getInsights: (id: number) => backendFetch<Insights>(`/repos/${id}/insights`),
  listBenchmarks: (id: number) => backendFetch<Benchmark[]>(`/repos/${id}/benchmarks`),
  listReferrers: (id: number) => backendFetch<Referrer[]>(`/repos/${id}/referrers`),
  listPopularPaths: (id: number) => backendFetch<PopularPath[]>(`/repos/${id}/popular-paths`),

  listRecommendations: () => backendFetch<Recommendation[]>("/recommendations"),
  dismissRecommendation: (id: number, dismissed: boolean) =>
    backendFetch<Recommendation>(`/recommendations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ dismissed }),
    }),

  listOpportunities: () => backendFetch<Opportunity[]>("/opportunities"),
  dismissOpportunity: (id: number, dismissed: boolean) =>
    backendFetch<Opportunity>(`/opportunities/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ dismissed }),
    }),

  listDemoAssets: (repoId: number) => backendFetch<DemoAsset[]>(`/repos/${repoId}/demo-assets`),
  triggerDemoAsset: (repoId: number) =>
    backendFetch<{ status: string }>(`/repos/${repoId}/demo-assets`, { method: "POST" }),

  listDrafts: () => backendFetch<Draft[]>("/drafts"),
  reviewDraft: (id: number, status: "approved" | "rejected") =>
    backendFetch<Draft>(`/drafts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  listRuns: () => backendFetch<PipelineRun[]>("/runs"),
  triggerRun: () => backendFetch<{ status: string }>("/runs", { method: "POST" }),
  listRunStages: (id: number) => backendFetch<StageRun[]>(`/runs/${id}/stages`),
  triggerContentRun: () => backendFetch<{ status: string }>("/runs/content", { method: "POST" }),
  triggerOpportunitiesRun: () =>
    backendFetch<{ status: string }>("/runs/opportunities", { method: "POST" }),

  providerStatus: () => backendFetch<ProviderStatus[]>("/providers/status"),

  getMe: () => backendFetch<UserOut>("/users/me"),
  updateMe: (payload: { notification_email: string | null }) =>
    backendFetch<UserOut>("/users/me", { method: "PATCH", body: JSON.stringify(payload) }),
};
