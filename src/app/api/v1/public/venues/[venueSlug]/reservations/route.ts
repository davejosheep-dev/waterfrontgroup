import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { finalizePublicReservation } from "@/lib/reservation-service.server";
import { publicRateKey } from "@/lib/public-rate-limit";

const bodySchema = z.object({
  holdToken: z.string().min(32).max(160),
  fullName: z.string().trim().min(2).max(160),
  mobile: z.string().min(7).max(32),
  email: z.string().email().max(160).optional().or(z.literal("")),
  occasion: z.string().max(120).optional(),
  specialRequests: z.string().max(500).optional(),
  termsAccepted: z.literal(true),
  termsVersion: z.string().max(80).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ venueSlug: string }> }) {
  const rate = publicRateKey(request, "booking");
  if (!rate.allowed) return NextResponse.json({ error: "Too many booking attempts. Please wait a moment.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } });
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (idempotencyKey.length < 16 || idempotencyKey.length > 160) return NextResponse.json({ error: "A valid idempotency key is required.", code: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  try {
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Please review the reservation details.", code: "INVALID_REQUEST" }, { status: 400 });
    const { venueSlug } = await context.params;
    const result = await finalizePublicReservation({ venueSlug, holdToken: body.data.holdToken, idempotencyKey, fullName: body.data.fullName, mobile: body.data.mobile, email: body.data.email, occasion: body.data.occasion, specialRequests: body.data.specialRequests, termsAccepted: body.data.termsAccepted, termsVersion: body.data.termsVersion });
    return NextResponse.json({ confirmationCode: result.reservation.code, status: result.reservation.status, startsAt: result.reservation.starts_at, endsAt: result.reservation.ends_at, manageToken: result.manageToken }, { status: 201, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESERVATION_COULD_NOT_BE_CREATED";
    if (message === "SLOT_NO_LONGER_AVAILABLE") return NextResponse.json({ error: "That time is no longer available. Please search again.", code: message }, { status: 409 });
    if (message === "HOLD_EXPIRED") return NextResponse.json({ error: "Your table hold expired. Please choose the time again.", code: message }, { status: 410 });
    return NextResponse.json({ error: "We could not complete the reservation.", code: "RESERVATION_COULD_NOT_BE_CREATED" }, { status: 400 });
  }
}
