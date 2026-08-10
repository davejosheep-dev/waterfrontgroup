import { NextResponse } from "next/server";
import { requireFloorAuth, floorErrorResponse } from "@/lib/floor-api.server";
import { callFloorCommand } from "@/lib/floor-service.server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ floorPlanId: string }> }) {
  const auth = await requireFloorAuth();
  if ("response" in auth) return auth.response;
  const { floorPlanId } = await context.params;
  const { data: plan, error } = await auth.supabase.from("floor_plans").select("id,current_version_id").eq("id", floorPlanId).maybeSingle();
  if (error || !plan) return NextResponse.json({ error: "Floor plan not found.", code: "FLOOR_PLAN_NOT_FOUND" }, { status: 404 });
  try {
    const validation = await callFloorCommand(auth.supabase, "validate_floor_plan_version", { target_version: plan.current_version_id });
    return NextResponse.json({ validation }, { headers: { "Cache-Control": "no-store" } });
  } catch (errorResponse) {
    return floorErrorResponse(errorResponse);
  }
}

