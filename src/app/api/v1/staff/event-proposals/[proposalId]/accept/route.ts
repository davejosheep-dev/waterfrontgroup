import { NextRequest, NextResponse } from "next/server";
import { eventErrorResponse, requireEventAuth } from "@/lib/event-api.server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ proposalId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { proposalId } = await params;
  try {
    const { data, error } = await auth.supabase.rpc("accept_event_proposal", { target_proposal: proposalId });
    if (error || !data) return eventErrorResponse(error, "The proposal could not be accepted.");
    return NextResponse.json({ proposal: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The proposal could not be accepted."); }
}
