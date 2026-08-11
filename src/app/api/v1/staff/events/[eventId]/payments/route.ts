import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventErrorResponse, getVenueScope, readEventCommandId, requireEventAuth } from "@/lib/event-api.server";

const paymentSchema = z.object({
  venueId: z.uuid(),
  scheduleId: z.uuid().optional(),
  provider: z.string().trim().min(2).max(80),
  providerReference: z.string().trim().min(2).max(160),
  amount: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("PHP"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { eventId } = await params;
  const [{ data: payments, error: paymentsError }, { data: schedules, error: schedulesError }] = await Promise.all([
    auth.supabase.from("event_payments").select("id,event_id,schedule_id,provider,provider_reference,amount,currency,status,received_at,metadata").eq("event_id", eventId).order("received_at", { ascending: false }),
    auth.supabase.from("event_payment_schedules").select("id,event_id,proposal_id,schedule_type,due_at,amount,currency,status").eq("event_id", eventId).order("due_at"),
  ]);
  if (paymentsError || schedulesError) return NextResponse.json({ error: "Event payment data is temporarily unavailable.", code: "EVENT_FINANCE_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ payments: payments ?? [], schedules: schedules ?? [] }, { headers: { "Cache-Control": "private, max-age=5" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { eventId } = await params;
  const parsed = paymentSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Please provide a provider reference and a positive amount.", code: "INVALID_REQUEST" }, { status: 400 });
  const venue = await getVenueScope(auth.supabase, parsed.data.venueId);
  if (!venue) return NextResponse.json({ error: "Venue is not available to this account.", code: "VENUE_NOT_FOUND" }, { status: 404 });
  try {
    const { data, error } = await auth.supabase.rpc("record_event_payment_atomic", { payload: { organization_id: venue.organization_id, venue_id: venue.id, event_id: eventId, schedule_id: parsed.data.scheduleId || null, provider: parsed.data.provider, provider_reference: parsed.data.providerReference, amount: parsed.data.amount, currency: parsed.data.currency, idempotency_key: readEventCommandId(request), metadata: parsed.data.metadata } });
    if (error || !data) return eventErrorResponse(error, "The event payment could not be recorded.");
    return NextResponse.json({ payment: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The event payment could not be recorded."); }
}
