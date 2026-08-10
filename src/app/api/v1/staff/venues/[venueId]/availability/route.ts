import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { searchVenueAvailability } from "@/lib/reservation-service.server";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(40),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration: z.coerce.number().int().min(30).max(720).optional(),
  feature: z.string().max(120).optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ venueId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid availability request.", code: "INVALID_REQUEST" }, { status: 400 });

  const { venueId } = await context.params;
  const { data: venue, error: venueError } = await supabase.from("outlets").select("id,slug,active").eq("id", venueId).maybeSingle();
  if (venueError || !venue || !venue.active) return NextResponse.json({ error: "Venue is not available to this account.", code: "VENUE_NOT_FOUND" }, { status: 404 });

  const { data: role } = await supabase.rpc("current_access_role");
  const includeAssignments = role === "superadmin" || role === "manager";
  try {
    const result = await searchVenueAvailability(venue.slug, {
      serviceDate: parsed.data.date,
      partySize: parsed.data.partySize,
      channel: "staff",
      preferredStart: parsed.data.start,
      preferredEnd: parsed.data.end,
      durationMinutes: parsed.data.duration,
      requiredFeatures: parsed.data.feature ? parsed.data.feature.split(",").map((value) => value.trim()).filter(Boolean) : [],
    });
    return NextResponse.json({
      state: result.state,
      reason: result.reason,
      configurationVersion: result.configurationVersion,
      servicePeriod: result.servicePeriod,
      slots: result.slots.map((slot) => ({
        localTime: slot.localTime,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        assignment: includeAssignments ? slot.assignment : { capacity: slot.assignment.capacity, tableCount: slot.assignment.tableCount },
      })),
    }, { headers: { "Cache-Control": "private, max-age=5", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "Availability is temporarily unavailable.", code: "AVAILABILITY_UNAVAILABLE" }, { status: 503 });
  }
}
