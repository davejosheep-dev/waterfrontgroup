import { NextRequest } from "next/server";
import { z } from "zod";
import { executeFloorRpc } from "@/lib/floor-api.server";

const schema = z.object({ reservationId: z.uuid(), commandId: z.string().trim().min(8).max(160).optional() });
export async function POST(request: NextRequest, context: { params: Promise<{ serviceRunId: string }> }) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "A reservation is required.", code: "INVALID_REQUEST" }, { status: 400 });
  const { serviceRunId } = await context.params;
  return executeFloorRpc(request, "seat_floor_reservation", body, { service_run_id: serviceRunId, reservation_id: parsed.data.reservationId });
}

