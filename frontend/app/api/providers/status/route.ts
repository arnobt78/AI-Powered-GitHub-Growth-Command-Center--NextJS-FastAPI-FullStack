import { api } from "@/lib/api";
import { proxyRoute } from "@/lib/route-handler";

export async function GET(request: Request) {
  return proxyRoute(request, () => api.providerStatus());
}
