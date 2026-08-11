import { NextRequest, NextResponse } from "next/server";
import { eventErrorResponse, requireEventAuth } from "@/lib/event-api.server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { eventId } = await params;
  try {
    const { data, error } = await auth.supabase.rpc("confirm_event_atomic", { target_event: eventId });
    if (error || !data) return eventErrorResponse(error, "The event could not be confirmed.");
    return NextResponse.json({ event: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The event could not be confirmed."); }
}
