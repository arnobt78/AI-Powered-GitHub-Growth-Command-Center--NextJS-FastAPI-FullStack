import { api } from "@/lib/api";
import { proxyRoute } from "@/lib/route-handler";

export async function POST(request: Request) {
  return proxyRoute(request, () => api.triggerContentRun(), 202);
}
