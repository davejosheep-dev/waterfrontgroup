import { isPublicEnvironmentConfigured } from "@/lib/env";
import { requestIdFrom } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const ready = isPublicEnvironmentConfigured();
  return Response.json(
    {
      status: ready ? "ready" : "degraded",
      service: "waterfront-reservations",
      requestId,
      checkedAt: new Date().toISOString(),
    },
    { status: ready ? 200 : 503, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
  );
}
