import { api } from "@/lib/api";
import { proxyRoute } from "@/lib/route-handler";

export async function GET(request: Request) {
  return proxyRoute(request, () => api.getMe());
}

export async function PATCH(request: Request) {
  const payload = (await request.json()) as { notification_email: string | null };
  return proxyRoute(request, () => api.updateMe(payload));
}
