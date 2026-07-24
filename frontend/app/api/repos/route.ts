import { api } from "@/lib/api";
import { proxyRoute } from "@/lib/route-handler";
import type { RepoCreate } from "@/lib/api-types";

export async function GET(request: Request) {
  return proxyRoute(request, () => api.listRepos());
}

export async function POST(request: Request) {
  const payload = (await request.json()) as RepoCreate;
  return proxyRoute(request, () => api.createRepo(payload), 201);
}
