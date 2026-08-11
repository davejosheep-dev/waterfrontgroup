import { NextRequest, NextResponse } from "next/server";
import { eventErrorResponse, requireEventAuth } from "@/lib/event-api.server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ inquiryId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { inquiryId } = await params;
  try {
    const { data, error } = await auth.supabase.rpc("convert_event_inquiry_atomic", { target_inquiry: inquiryId });
    if (error || !data) return eventErrorResponse(error, "The inquiry could not be converted into an event.");
    return NextResponse.json({ event: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The inquiry could not be converted into an event."); }
}
