import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventErrorResponse, requireEventAuth } from "@/lib/event-api.server";

const schema = z.object({ status: z.enum(["new_inquiry","qualified","availability_checked","pencil_booking","proposal_sent","negotiation","deposit_pending","confirmed","planning","event_day","completed","final_billing","closed","lost","cancelled"]), reason: z.string().max(500).optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { eventId } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Please choose a valid event stage.", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const { data, error } = await auth.supabase.rpc("transition_event_status", { target_event: eventId, next_status: parsed.data.status, reason: parsed.data.reason || null });
    if (error || !data) return eventErrorResponse(error, "The event status could not be updated.");
    return NextResponse.json({ event: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The event status could not be updated."); }
}
