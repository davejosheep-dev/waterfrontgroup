import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { searchVenueAvailability } from "@/lib/reservation-service.server";

const bodySchema = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(30).max(720).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ venueId: string; walkInId: string }> }) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (idempotencyKey.length < 16 || idempotencyKey.length > 160) return NextResponse.json({ error: "A valid idempotency key is required.", code: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid walk-in conversion request.", code: "INVALID_REQUEST" }, { status: 400 });
  const { venueId, walkInId } = await context.params;
  const [{ data: venue, error: venueError }, { data: walkIn, error: walkInError }] = await Promise.all([
    supabase.from("outlets").select("id,slug,organization_id,active").eq("id", venueId).maybeSingle(),
    supabase.from("walk_ins").select("id,venue_id,full_name,mobile_display,party_size,status,reservation_id").eq("id", walkInId).eq("venue_id", venueId).maybeSingle(),
  ]);
  if (venueError || !venue || !venue.active) return NextResponse.json({ error: "Venue is not available to this account.", code: "VENUE_NOT_FOUND" }, { status: 404 });
  if (walkInError || !walkIn) return NextResponse.json({ error: "Walk-in not found.", code: "WALKIN_NOT_FOUND" }, { status: 404 });
  if (walkIn.status === "converted" && walkIn.reservation_id) return NextResponse.json({ reservationId: walkIn.reservation_id, status: "converted" }, { status: 200 });
  if (!walkIn.mobile_display) return NextResponse.json({ error: "Add a mobile number before converting this walk-in to a reservation.", code: "MOBILE_REQUIRED" }, { status: 400 });

  try {
    const availability = await searchVenueAvailability(venue.slug, { serviceDate: parsed.data.serviceDate, partySize: walkIn.party_size, channel: "walk_in", preferredStart: parsed.data.time, preferredEnd: parsed.data.time, durationMinutes: parsed.data.durationMinutes });
    const slot = availability.slots[0];
    if (!slot) return NextResponse.json({ error: "That time has no feasible table assignment.", code: "SLOT_NO_LONGER_AVAILABLE" }, { status: 409 });
    const { data: reservation, error: reservationError } = await supabase.rpc("finalize_reservation_atomic", {
      payload: {
        organization_id: venue.organization_id,
        venue_id: venue.id,
        service_period_id: availability.servicePeriod?.id,
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        party_size: walkIn.party_size,
        channel: "walk_in",
        actor_type: "staff",
        status: "confirmed",
        idempotency_key: idempotencyKey,
        full_name: walkIn.full_name,
        mobile_display: walkIn.mobile_display ?? "",
        source: "Walk-in",
        configuration_version: availability.configurationVersion,
        table_ids: slot.assignment.tableIds,
      },
    });
    if (reservationError || !reservation) {
      if (reservationError?.message.includes("Not authorized")) return NextResponse.json({ error: "Your role cannot convert walk-ins for this venue.", code: "FORBIDDEN" }, { status: 403 });
      return NextResponse.json({ error: "The walk-in could not be converted.", code: "CONVERSION_FAILED" }, { status: 400 });
    }
    const { error: updateError } = await supabase.from("walk_ins").update({ status: "converted", reservation_id: reservation.id }).eq("id", walkInId).eq("status", "waiting");
    if (updateError) return NextResponse.json({ error: "The reservation was created but the walk-in queue could not be updated.", code: "QUEUE_UPDATE_FAILED" }, { status: 409 });
    return NextResponse.json({ reservation: { id: reservation.id, confirmationCode: reservation.code, status: reservation.status }, assignment: { tableIds: slot.assignment.tableIds, combinationId: slot.assignment.combinationId } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The walk-in could not be converted.", code: "CONVERSION_FAILED" }, { status: 400 });
  }
}
