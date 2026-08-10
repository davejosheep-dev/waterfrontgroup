import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/admin-access";
import { hashManageToken } from "@/lib/public-security";
import { publicRateKey } from "@/lib/public-rate-limit";

export const dynamic = "force-dynamic";

async function reservationForToken(token: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("reservations").select("id,code,status,starts_at,ends_at,guest_count,occasion,source,outlets(name,slug),guests(full_name)").eq("public_manage_token_hash", hashManageToken(token)).maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const rate = publicRateKey(_request, "manage");
  if (!rate.allowed) return NextResponse.json({ error: "Too many manage-link attempts. Please wait a moment.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } });
  try {
    const { token } = await context.params;
    const reservation = await reservationForToken(token);
    if (!reservation) return NextResponse.json({ error: "Reservation not found.", code: "NOT_FOUND" }, { status: 404 });
    const view = reservation as unknown as { code: string; status: string; starts_at: string; ends_at: string; guest_count: number; occasion?: string; outlets?: { name?: string } | Array<{ name?: string }>; guests?: { full_name?: string } | Array<{ full_name?: string }> };
    return NextResponse.json({ reservation: { confirmationCode: view.code, status: view.status, startsAt: view.starts_at, endsAt: view.ends_at, partySize: view.guest_count, occasion: view.occasion, venue: Array.isArray(view.outlets) ? view.outlets[0]?.name : view.outlets?.name, guestFirstName: (Array.isArray(view.guests) ? view.guests[0]?.full_name : view.guests?.full_name)?.split(" ")[0] } }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "Reservation could not be loaded.", code: "NOT_FOUND" }, { status: 404 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const rate = publicRateKey(request, "manage");
  if (!rate.allowed) return NextResponse.json({ error: "Too many manage-link attempts. Please wait a moment.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } });
  const body = z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(400) }).safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "A cancellation reason is required.", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const { token } = await context.params;
    const reservation = await reservationForToken(token);
    if (!reservation) return NextResponse.json({ error: "Reservation not found.", code: "NOT_FOUND" }, { status: 404 });
    if (!["confirmed", "pending_confirmation", "pending_deposit", "temporary_hold"].includes(reservation.status)) return NextResponse.json({ error: "This reservation can no longer be cancelled online.", code: "ACTION_NOT_ALLOWED" }, { status: 409 });
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("transition_reservation_status_v2", { target_reservation: reservation.id, next_status: "cancelled", reason: body.data.reason });
    if (error) return NextResponse.json({ error: "This reservation could not be cancelled.", code: "ACTION_NOT_ALLOWED" }, { status: 409 });
    return NextResponse.json({ confirmationCode: data.code, status: data.status }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "This reservation could not be cancelled.", code: "ACTION_NOT_ALLOWED" }, { status: 409 });
  }
}
