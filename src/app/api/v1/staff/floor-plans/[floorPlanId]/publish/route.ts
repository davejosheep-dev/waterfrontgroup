import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFloorAuth, floorErrorResponse, readCommandId } from "@/lib/floor-api.server";
import { callFloorCommand } from "@/lib/floor-service.server";

const schema = z.object({ versionId: z.uuid().optional(), effectiveAt: z.string().datetime().optional(), commandId: z.string().trim().min(8).max(160).optional() });
export async function POST(request: NextRequest, context: { params: Promise<{ floorPlanId: string }> }) {
  const auth = await requireFloorAuth();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid floor plan publication request.", code: "INVALID_REQUEST" }, { status: 400 });
  const { floorPlanId } = await context.params;
  try {
    const result = await callFloorCommand(auth.supabase, "publish_floor_plan", { floor_plan_id: floorPlanId, version_id: parsed.data.versionId ?? null, effective_at: parsed.data.effectiveAt ?? null, command_id: readCommandId(request, body) });
    return NextResponse.json({ plan: result }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return floorErrorResponse(error);
  }
}

