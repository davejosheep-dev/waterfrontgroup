import { NextRequest } from "next/server";
import { z } from "zod";
import { executeFloorRpc } from "@/lib/floor-api.server";

const schema = z.object({ organizationId: z.uuid(), venueId: z.uuid(), tableId: z.uuid(), overrideType: z.enum(["blocked", "unavailable", "hold", "maintenance"]).default("blocked"), reason: z.string().trim().min(3).max(400), startsAt: z.string().datetime().optional(), expiresAt: z.string().datetime().optional(), commandId: z.string().trim().min(8).max(160).optional() });
export async function POST(request: NextRequest, context: { params: Promise<{ serviceRunId: string }> }) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "A table and reason are required.", code: "INVALID_REQUEST" }, { status: 400 });
  const { serviceRunId } = await context.params;
  return executeFloorRpc(request, "block_floor_table", body, { organization_id: parsed.data.organizationId, venue_id: parsed.data.venueId, service_run_id: serviceRunId, table_id: parsed.data.tableId, override_type: parsed.data.overrideType, reason: parsed.data.reason, starts_at: parsed.data.startsAt ?? null, expires_at: parsed.data.expiresAt ?? null });
}

