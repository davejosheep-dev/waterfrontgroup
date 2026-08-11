import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  mobile: z.string().min(7).max(32),
  email: z.string().email().max(160).optional().or(z.literal("")),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  preferredEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  partySize: z.number().int().min(1).max(40),
  priority: z.number().int().min(0).max(100).optional(),
  quotedWaitMinutes: z.number().int().min(0).max(1440).optional(),
  notes: z.string().max(500).optional(),
});

export const dynamic = "force-dynamic";

async function authenticatedVenue(request: NextRequest, venueId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required.", code: "UNAUTHENTICATED" }, { status: 401 }) } as const;
  const { data: venue, error } = await supabase.from("outlets").select("id,organization_id,active").eq("id", venueId).maybeSingle();
  if (error || !venue || !venue.active) return { response: NextResponse.json({ error: "Venue is not available to this account.", code: "VENUE_NOT_FOUND" }, { status: 404 }) } as const;
  return { supabase, user, venue } as const;
}

export async function GET(request: NextRequest, context: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await context.params;
  const auth = await authenticatedVenue(request, venueId);
  if ("response" in auth) return auth.response;
  let query = auth.supabase.from("waitlist_entries").select("id,full_name,mobile_display,email,service_date,preferred_start_local,preferred_end_local,party_size,priority,quoted_wait_minutes,status,notes,created_at").eq("venue_id", venueId).in("status", ["open", "offered"]).order("priority", { ascending: false }).order("created_at", { ascending: true });
  const serviceDate = request.nextUrl.searchParams.get("date");
  if (serviceDate) query = query.eq("service_date", serviceDate);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "The waitlist could not be loaded.", code: "WAITLIST_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ entries: data ?? [] }, { headers: { "Cache-Control": "private, max-age=5" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ venueId: string }> }) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (idempotencyKey.length < 16 || idempotencyKey.length > 160) return NextResponse.json({ error: "A valid idempotency key is required.", code: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const { venueId } = await context.params;
  const auth = await authenticatedVenue(request, venueId);
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Please review the waitlist details.", code: "INVALID_REQUEST" }, { status: 400 });

  const { data: existing } = await auth.supabase.from("waitlist_entries").select("id,full_name,service_date,party_size,status,created_at").eq("venue_id", venueId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return NextResponse.json({ entry: existing }, { status: 200, headers: { "Cache-Control": "no-store" } });
  const { data, error } = await auth.supabase.from("waitlist_entries").insert({
    organization_id: auth.venue.organization_id,
    venue_id: venueId,
    full_name: parsed.data.fullName,
    mobile_display: parsed.data.mobile,
    email: parsed.data.email || null,
    service_date: parsed.data.serviceDate,
    preferred_start_local: parsed.data.preferredStart || null,
    preferred_end_local: parsed.data.preferredEnd || null,
    party_size: parsed.data.partySize,
    priority: parsed.data.priority ?? 0,
    quoted_wait_minutes: parsed.data.quotedWaitMinutes ?? null,
    notes: parsed.data.notes || null,
    source: "staff",
    status: "open",
    created_by: auth.user.id,
    idempotency_key: idempotencyKey,
  }).select("id,full_name,service_date,party_size,status,created_at").single();
  if (error) return NextResponse.json({ error: "The waitlist entry could not be saved.", code: error.code === "23505" ? "IDEMPOTENCY_REPLAY_CONFLICT" : "WAITLIST_CREATE_FAILED" }, { status: error.code === "23505" ? 409 : 400 });
  return NextResponse.json({ entry: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
