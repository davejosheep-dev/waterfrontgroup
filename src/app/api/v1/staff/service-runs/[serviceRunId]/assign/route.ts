import { NextRequest } from "next/server";
import { z } from "zod";
import { executeFloorRpc } from "@/lib/floor-api.server";

const schema = z.object({ reservationId: z.uuid(), tableIds: z.array(z.uuid()).optional(), combinationId: z.uuid().optional(), reason: z.string().trim().max(400).optional(), commandId: z.string().trim().min(8).max(160).optional() }).refine((value) => Boolean(value.combinationId || value.tableIds?.length), "A table or combination is required.");
export async function POST(request: NextRequest, context: { params: Promise<{ serviceRunId: string }> }) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Choose an active table assignment.", code: "INVALID_REQUEST" }, { status: 400 });
  const { serviceRunId } = await context.params;
  return executeFloorRpc(request, "assign_floor_reservation", body, { service_run_id: serviceRunId, reservation_id: parsed.data.reservationId, table_ids: parsed.data.tableIds ?? [], combination_id: parsed.data.combinationId ?? null, reason: parsed.data.reason ?? null });
}

