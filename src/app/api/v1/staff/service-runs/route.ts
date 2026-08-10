import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFloorAuth, floorErrorResponse, readCommandId } from "@/lib/floor-api.server";
import { callFloorCommand } from "@/lib/floor-service.server";

const openSchema = z.object({
  venueId: z.uuid(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  servicePeriodId: z.uuid().optional().nullable(),
  floorPlanVersionId: z.uuid().optional().nullable(),
  organizationId: z.uuid().optional(),
  commandId: z.string().trim().min(8).max(160).optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireFloorAuth();
  if ("response" in auth) return auth.response;
  const venueId = request.nextUrl.searchParams.get("venueId");
  const serviceDate = request.nextUrl.searchParams.get("serviceDate");
  let query = auth.supabase.from("service_runs").select("id,venue_id,service_date,service_period_id,floor_plan_version_id,status,version,opened_at,last_event_at").order("service_date", { ascending: false }).limit(30);
  if (venueId) query = query.eq("venue_id", venueId);
  if (serviceDate) query = query.eq("service_date", serviceDate);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Service runs are temporarily unavailable.", code: "FLOOR_DATA_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ serviceRuns: data ?? [] }, { headers: { "Cache-Control": "private, max-age=5" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireFloorAuth();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = openSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A venue and service date are required.", code: "INVALID_REQUEST" }, { status: 400 });
  const { data: venue, error: venueError } = await auth.supabase.from("outlets").select("id,organization_id,active").eq("id", parsed.data.venueId).maybeSingle();
  if (venueError || !venue?.active) return NextResponse.json({ error: "Venue is not available to this account.", code: "VENUE_NOT_FOUND" }, { status: 404 });
  try {
    const result = await callFloorCommand(auth.supabase, "open_service_run", { organization_id: venue.organization_id, venue_id: venue.id, service_date: parsed.data.serviceDate, service_period_id: parsed.data.servicePeriodId ?? null, floor_plan_version_id: parsed.data.floorPlanVersionId ?? null, command_id: readCommandId(request, body) });
    return NextResponse.json({ serviceRun: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return floorErrorResponse(error);
  }
}

