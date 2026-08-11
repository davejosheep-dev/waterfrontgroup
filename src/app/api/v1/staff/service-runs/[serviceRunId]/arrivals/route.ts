import { NextRequest } from "next/server";
import { z } from "zod";
import { executeFloorRpc } from "@/lib/floor-api.server";

const schema = z.object({ reservationId: z.uuid(), arrivedCount: z.number().int().min(1), reason: z.string().trim().max(400).optional(), commandId: z.string().trim().min(8).max(160).optional() });
export async function POST(request: NextRequest, context: { params: Promise<{ serviceRunId: string }> }) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose a valid arrival count.", code: "INVALID_REQUEST" }, { status: 400 });
  const { serviceRunId } = await context.params;
  return executeFloorRpc(request, "record_floor_arrival", body, { service_run_id: serviceRunId, reservation_id: parsed.data.reservationId, arrived_count: parsed.data.arrivedCount, reason: parsed.data.reason ?? null });
}

