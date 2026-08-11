import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { searchVenueAvailability } from "@/lib/reservation-service.server";

const bodySchema = z.object({
  venueId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  partySize: z.number().int().min(1).max(40),
  durationMinutes: z.number().int().min(30).max(720).optional(),
  fullName: z.string().trim().min(2).max(160),
  mobile: z.string().min(7).max(32),
  email: z.string().email().max(160).optional().or(z.literal("")),
  occasion: z.string().max(120).optional(),
  specialRequests: z.string().max(500).optional(),
  source: z.string().trim().min(2).max(80).default("Staff Entry"),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (idempotencyKey.length < 16 || idempotencyKey.length > 160) return NextResponse.json({ error: "A valid idempotency key is required.", code: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Please review the reservation details.", code: "INVALID_REQUEST" }, { status: 400 });

  const { data: venue, error: venueError } = await supabase.from("outlets").select("id,slug,organization_id,active").eq("id", parsed.data.venueId).maybeSingle();
  if (venueError || !venue || !venue.active) return NextResponse.json({ error: "Venue is not available to this account.", code: "VENUE_NOT_FOUND" }, { status: 404 });

  try {
    const availability = await searchVenueAvailability(venue.slug, {
      serviceDate: parsed.data.date,
      partySize: parsed.data.partySize,
      channel: "staff",
      preferredStart: parsed.data.time,
      preferredEnd: parsed.data.time,
      durationMinutes: parsed.data.durationMinutes,
    });
    const slot = availability.slots[0];
    if (!slot) return NextResponse.json({ error: "That time is no longer available. Please search again.", code: "SLOT_NO_LONGER_AVAILABLE" }, { status: 409 });

    const { data: reservation, error } = await supabase.rpc("finalize_reservation_atomic", {
      payload: {
        organization_id: venue.organization_id,
        venue_id: venue.id,
        service_period_id: availability.servicePeriod?.id,
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        party_size: parsed.data.partySize,
        channel: "staff",
        actor_type: "staff",
        status: "confirmed",
        idempotency_key: idempotencyKey,
        full_name: parsed.data.fullName,
        mobile_display: parsed.data.mobile,
        email: parsed.data.email ?? "",
        occasion: parsed.data.occasion ?? "",
        special_requests: parsed.data.specialRequests ?? "",
        source: parsed.data.source,
        configuration_version: availability.configurationVersion,
        table_ids: slot.assignment.tableIds,
      },
    });
    if (error || !reservation) {
      if (error?.message.includes("SLOT_NO_LONGER_AVAILABLE")) return NextResponse.json({ error: "That time is no longer available. Please search again.", code: "SLOT_NO_LONGER_AVAILABLE" }, { status: 409 });
      if (error?.message.includes("Not authorized")) return NextResponse.json({ error: "Your role cannot create reservations for this venue.", code: "FORBIDDEN" }, { status: 403 });
      return NextResponse.json({ error: "The reservation could not be created.", code: "RESERVATION_COULD_NOT_BE_CREATED" }, { status: 400 });
    }
    return NextResponse.json({
      confirmationCode: reservation.code,
      status: reservation.status,
      startsAt: reservation.starts_at,
      endsAt: reservation.ends_at,
      assignment: { tableIds: slot.assignment.tableIds, combinationId: slot.assignment.combinationId },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "VENUE_NOT_FOUND") return NextResponse.json({ error: "Venue is not available.", code: "VENUE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ error: "The reservation could not be created.", code: "RESERVATION_COULD_NOT_BE_CREATED" }, { status: 400 });
  }
}
