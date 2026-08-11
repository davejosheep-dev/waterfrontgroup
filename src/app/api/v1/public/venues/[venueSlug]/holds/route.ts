import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createInventoryHold } from "@/lib/reservation-service.server";
import { publicRateKey } from "@/lib/public-rate-limit";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  partySize: z.number().int().min(1).max(40),
  durationMinutes: z.number().int().min(30).max(720).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ venueSlug: string }> }) {
  const rate = publicRateKey(request, "booking");
  if (!rate.allowed) return NextResponse.json({ error: "Too many booking attempts. Please wait a moment.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } });
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (idempotencyKey.length < 16 || idempotencyKey.length > 160) return NextResponse.json({ error: "A valid idempotency key is required.", code: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  try {
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid hold request.", code: "INVALID_REQUEST" }, { status: 400 });
    const { venueSlug } = await context.params;
    const result = await createInventoryHold({ venueSlug, serviceDate: body.data.date, localTime: body.data.time, partySize: body.data.partySize, durationMinutes: body.data.durationMinutes, idempotencyKey });
    return NextResponse.json({ holdToken: result.token, expiresAt: result.hold.expires_at, slot: { localTime: result.slot.localTime, startsAt: result.slot.startsAt, endsAt: result.slot.endsAt } }, { status: 201, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "HOLD_COULD_NOT_BE_CREATED";
    if (message === "SLOT_NO_LONGER_AVAILABLE") return NextResponse.json({ error: "That time was just taken. Please choose another time.", code: message }, { status: 409 });
    return NextResponse.json({ error: "We could not hold that time. Please try another slot.", code: message === "VENUE_NOT_FOUND" ? message : "HOLD_COULD_NOT_BE_CREATED" }, { status: message === "VENUE_NOT_FOUND" ? 404 : 400 });
  }
}
