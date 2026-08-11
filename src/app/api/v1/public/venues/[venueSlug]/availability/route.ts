import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchVenueAvailability } from "@/lib/reservation-service.server";
import { publicRateKey } from "@/lib/public-rate-limit";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(40),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration: z.coerce.number().int().min(30).max(720).optional(),
  feature: z.string().max(120).optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ venueSlug: string }> }) {
  const rate = publicRateKey(request, "availability");
  if (!rate.allowed) return NextResponse.json({ error: "Too many availability searches. Please wait a moment.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } });
  try {
    const { venueSlug } = await context.params;
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) return NextResponse.json({ error: "Invalid availability request.", code: "INVALID_REQUEST" }, { status: 400 });
    const result = await searchVenueAvailability(venueSlug, {
      serviceDate: parsed.data.date, partySize: parsed.data.partySize, channel: "public", preferredStart: parsed.data.start, preferredEnd: parsed.data.end,
      durationMinutes: parsed.data.duration, requiredFeatures: parsed.data.feature ? parsed.data.feature.split(",").map((value) => value.trim()).filter(Boolean) : [],
    });
    return NextResponse.json({
      state: result.state, reason: result.reason, configurationVersion: result.configurationVersion,
      servicePeriod: result.servicePeriod,
      slots: result.slots.map((slot) => ({ localTime: slot.localTime, startsAt: slot.startsAt, endsAt: slot.endsAt })),
    }, { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    const code = error instanceof Error && error.message === "VENUE_NOT_FOUND" ? "VENUE_NOT_FOUND" : "AVAILABILITY_UNAVAILABLE";
    return NextResponse.json({ error: "Availability is temporarily unavailable.", code }, { status: code === "VENUE_NOT_FOUND" ? 404 : 503 });
  }
}
