import { NextResponse } from "next/server";
import { requireFloorAuth, floorErrorResponse } from "@/lib/floor-api.server";
import { loadFloorSnapshot } from "@/lib/floor-service.server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ serviceRunId: string }> }) {
  const auth = await requireFloorAuth();
  if ("response" in auth) return auth.response;
  const { serviceRunId } = await context.params;
  try {
    return NextResponse.json({ snapshot: await loadFloorSnapshot(auth.supabase, serviceRunId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return floorErrorResponse(error);
  }
}

