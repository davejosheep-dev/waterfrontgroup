import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventErrorResponse, getVenueScope, readEventCommandId, requireEventAuth } from "@/lib/event-api.server";

const inquirySchema = z.object({
  venueId: z.uuid(),
  contactName: z.string().trim().min(2).max(160),
  contactEmail: z.string().email().max(160).optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
  eventName: z.string().max(160).optional(),
  eventTypeId: z.uuid().optional(),
  source: z.string().trim().min(2).max(80).default("staff_entry"),
  requestedStartsAt: z.iso.datetime({ offset: true }),
  requestedEndsAt: z.iso.datetime({ offset: true }),
  expectedGuests: z.number().int().min(1).max(1000),
  preferredSpaceIds: z.array(z.uuid()).max(12).default([]),
  budget: z.number().nonnegative().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("PHP"),
  requirements: z.record(z.string(), z.unknown()).default({}),
  ownerUserId: z.uuid().optional(),
  nextActionAt: z.iso.datetime({ offset: true }).optional(),
  estimatedValue: z.number().nonnegative().default(0),
  probability: z.number().int().min(0).max(100).default(20),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const venueId = request.nextUrl.searchParams.get("venueId");
  const stage = request.nextUrl.searchParams.get("stage");
  let inquiryQuery = auth.supabase.from("event_inquiries").select("id,venue_id,contact_name,contact_email,contact_phone,event_name,source,requested_starts_at,requested_ends_at,expected_guests,preferred_space_ids,budget,currency,requirements,stage,owner_user_id,next_action_at,estimated_value,probability,converted_event_id,created_at,updated_at").order("next_action_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(200);
  let eventQuery = auth.supabase.from("events").select("id,inquiry_id,venue_id,name,starts_at,ends_at,setup_starts_at,teardown_ends_at,expected_headcount,final_headcount,status,owner_user_id,currency,estimated_value,quoted_total,balance_due,created_at,updated_at").order("starts_at", { ascending: true }).limit(200);
  if (venueId) { inquiryQuery = inquiryQuery.eq("venue_id", venueId); eventQuery = eventQuery.eq("venue_id", venueId); }
  if (stage) inquiryQuery = inquiryQuery.eq("stage", stage);
  const [{ data: inquiries, error: inquiryError }, { data: events, error: eventError }, { data: holds, error: holdError }, { data: spaces, error: spaceError }] = await Promise.all([
    inquiryQuery,
    eventQuery,
    auth.supabase.from("event_space_holds").select("id,inquiry_id,event_id,venue_id,starts_at,ends_at,expires_at,state,priority,created_at").eq("state", "active").order("expires_at", { ascending: true }).limit(200),
    auth.supabase.from("event_spaces").select("id,venue_id,code,name,location,min_capacity,max_capacity,features,active,sort_order").eq("active", true).order("sort_order").order("code"),
  ]);
  if (inquiryError || eventError || holdError || spaceError) return NextResponse.json({ error: "Event data is temporarily unavailable.", code: "EVENT_DATA_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ inquiries: inquiries ?? [], events: events ?? [], holds: holds ?? [], spaces: spaces ?? [] }, { headers: { "Cache-Control": "private, max-age=5" } });
}

export async function POST(request: NextRequest) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const parsed = inquirySchema.safeParse(await request.json());
  if (!parsed.success || new Date(parsed.data.requestedEndsAt) <= new Date(parsed.data.requestedStartsAt)) return NextResponse.json({ error: "Please review the event date, time, and contact details.", code: "INVALID_REQUEST" }, { status: 400 });
  const venue = await getVenueScope(auth.supabase, parsed.data.venueId);
  if (!venue) return NextResponse.json({ error: "Venue is not available to this account.", code: "VENUE_NOT_FOUND" }, { status: 404 });
  try {
    const { data, error } = await auth.supabase.rpc("create_event_inquiry_atomic", { payload: {
      organization_id: venue.organization_id,
      venue_id: venue.id,
      contact_name: parsed.data.contactName,
      contact_email: parsed.data.contactEmail || null,
      contact_phone: parsed.data.contactPhone || null,
      event_name: parsed.data.eventName || null,
      event_type_id: parsed.data.eventTypeId || null,
      source: parsed.data.source,
      requested_starts_at: parsed.data.requestedStartsAt,
      requested_ends_at: parsed.data.requestedEndsAt,
      expected_guests: parsed.data.expectedGuests,
      preferred_space_ids: parsed.data.preferredSpaceIds,
      budget: parsed.data.budget ?? null,
      currency: parsed.data.currency,
      requirements: parsed.data.requirements,
      owner_user_id: parsed.data.ownerUserId || null,
      next_action_at: parsed.data.nextActionAt || null,
      estimated_value: parsed.data.estimatedValue,
      probability: parsed.data.probability,
      idempotency_key: readEventCommandId(request),
    } });
    if (error || !data) return eventErrorResponse(error, "The event inquiry could not be created.");
    return NextResponse.json({ inquiry: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The event inquiry could not be created."); }
}
