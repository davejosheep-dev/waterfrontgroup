import { NextRequest } from "next/server";
import { z } from "zod";
import { executeFloorRpc } from "@/lib/floor-api.server";

const schema = z.object({ tableSessionId: z.uuid(), tableIds: z.array(z.uuid()).min(1), reason: z.string().trim().min(3).max(400), commandId: z.string().trim().min(8).max(160).optional() });
export async function POST(request: NextRequest, context: { params: Promise<{ serviceRunId: string }> }) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "A destination and transfer reason are required.", code: "INVALID_REQUEST" }, { status: 400 });
  const { serviceRunId } = await context.params;
  return executeFloorRpc(request, "transfer_floor_session", body, { service_run_id: serviceRunId, table_session_id: parsed.data.tableSessionId, table_ids: parsed.data.tableIds, reason: parsed.data.reason });
}

