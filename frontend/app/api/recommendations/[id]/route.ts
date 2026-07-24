import { api } from "@/lib/api";
import { proxyRoute } from "@/lib/route-handler";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = (await request.json()) as { dismissed: boolean };
  return proxyRoute(request, () => api.dismissRecommendation(Number(id), payload.dismissed));
}
