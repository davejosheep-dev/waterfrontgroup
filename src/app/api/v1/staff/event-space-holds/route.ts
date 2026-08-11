import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventErrorResponse, getVenueScope, readEventCommandId, requireEventAuth } from "@/lib/event-api.server";

const holdSchema = z.object({
  venueId: z.uuid(),
  inquiryId: z.uuid().optional(),
  eventId: z.uuid().optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  spaceIds: z.array(z.uuid()).min(1).max(12),
  priority: z.number().int().min(1).max(9).default(1),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const venueId = request.nextUrl.searchParams.get("venueId");
  const startsAt = request.nextUrl.searchParams.get("startsAt");
  const endsAt = request.nextUrl.searchParams.get("endsAt");
  if (!venueId) return NextResponse.json({ error: "Venue is required.", code: "VENUE_REQUIRED" }, { status: 400 });
  const spacesQuery = auth.supabase.from("event_spaces").select("id,venue_id,code,name,location,min_capacity,max_capacity,features,sort_order").eq("venue_id", venueId).eq("active", true).order("sort_order").order("code");
  let holdsQuery = auth.supabase.from("event_space_hold_resources").select("space_id,hold_id,starts_at,ends_at,event_space_holds!inner(id,state,expires_at)").eq("venue_id", venueId).eq("state", "active");
  let assignmentsQuery = auth.supabase.from("event_space_assignments").select("space_id,event_id,starts_at,ends_at").eq("venue_id", venueId).eq("state", "active");
  if (startsAt && endsAt) {
    holdsQuery = holdsQuery.lt("starts_at", endsAt).gt("ends_at", startsAt);
    assignmentsQuery = assignmentsQuery.lt("starts_at", endsAt).gt("ends_at", startsAt);
  }
  const [{ data: spaces, error: spacesError }, { data: holds, error: holdsError }, { data: assignments, error: assignmentsError }] = await Promise.all([spacesQuery, holdsQuery, assignmentsQuery]);
  if (spacesError || holdsError || assignmentsError) return NextResponse.json({ error: "Event availability is temporarily unavailable.", code: "EVENT_AVAILABILITY_UNAVAILABLE" }, { status: 503 });
  const blockedSpaceIds = new Set([...(holds ?? []).map((row) => row.space_id), ...(assignments ?? []).map((row) => row.space_id)]);
  return NextResponse.json({ spaces: (spaces ?? []).map((space) => ({ ...space, available: !blockedSpaceIds.has(space.id) })), holds: holds ?? [], assignments: assignments ?? [] }, { headers: { "Cache-Control": "private, max-age=3" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const parsed = holdSchema.safeParse(await request.json());
  if (!parsed.success || new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt) || new Date(parsed.data.expiresAt) <= new Date()) return NextResponse.json({ error: "Please review the hold interval and expiry.", code: "INVALID_REQUEST" }, { status: 400 });
  const venue = await getVenueScope(auth.supabase, parsed.data.venueId);
  if (!venue) return NextResponse.json({ error: "Venue is not available to this account.", code: "VENUE_NOT_FOUND" }, { status: 404 });
  try {
    const { data, error } = await auth.supabase.rpc("create_event_space_hold_atomic", { payload: { organization_id: venue.organization_id, venue_id: venue.id, inquiry_id: parsed.data.inquiryId || null, event_id: parsed.data.eventId || null, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt, expires_at: parsed.data.expiresAt, space_ids: parsed.data.spaceIds, priority: parsed.data.priority, idempotency_key: readEventCommandId(request) } });
    if (error || !data) return eventErrorResponse(error, "The event space could not be held.");
    return NextResponse.json({ hold: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The event space could not be held."); }
}
