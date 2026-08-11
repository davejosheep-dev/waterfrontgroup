import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventErrorResponse, requireEventAuth } from "@/lib/event-api.server";

const transitionSchema = z.object({ stage: z.enum(["new_inquiry","qualified","availability_checked","pencil_booking","proposal_sent","negotiation","deposit_pending","confirmed","planning","event_day","completed","final_billing","closed","lost","cancelled"]), reason: z.string().max(500).optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ inquiryId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { inquiryId } = await params;
  const parsed = transitionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Please choose a valid pipeline stage.", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const { data, error } = await auth.supabase.rpc("transition_event_inquiry", { target_inquiry: inquiryId, next_stage: parsed.data.stage, reason: parsed.data.reason || null });
    if (error || !data) return eventErrorResponse(error, "The inquiry stage could not be updated.");
    return NextResponse.json({ inquiry: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The inquiry stage could not be updated."); }
}
