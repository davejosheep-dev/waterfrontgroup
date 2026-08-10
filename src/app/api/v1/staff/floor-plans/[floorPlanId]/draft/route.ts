import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFloorAuth, floorErrorResponse, readCommandId } from "@/lib/floor-api.server";
import { callFloorCommand } from "@/lib/floor-service.server";

const objectSchema = z.object({ tableId: z.uuid(), x: z.number().min(0).max(100), y: z.number().min(0).max(100), width: z.number().positive().max(100), height: z.number().positive().max(100), rotation: z.number().min(-360).max(360), label: z.string().trim().max(120).optional() });
const schema = z.object({ objects: z.array(objectSchema).max(500), commandId: z.string().trim().min(8).max(160).optional() });

export async function POST(request: NextRequest, context: { params: Promise<{ floorPlanId: string }> }) {
  const auth = await requireFloorAuth();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Floor objects must use plan-relative coordinates.", code: "INVALID_REQUEST" }, { status: 400 });
  const { floorPlanId } = await context.params;
  try {
    const result = await callFloorCommand(auth.supabase, "save_floor_plan_draft", { floor_plan_id: floorPlanId, objects: parsed.data.objects.map((object) => ({ table_id: object.tableId, x: object.x, y: object.y, width: object.width, height: object.height, rotation: object.rotation, label: object.label ?? null })), command_id: readCommandId(request, body) });
    return NextResponse.json({ draft: result }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return floorErrorResponse(error);
  }
}

