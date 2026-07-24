import { api } from "@/lib/api";
import { proxyRoute } from "@/lib/route-handler";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRoute(request, () => api.listPopularPaths(Number(id)));
}
