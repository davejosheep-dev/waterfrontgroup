import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventErrorResponse, requireEventAuth } from "@/lib/event-api.server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ proposalId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { proposalId } = await params;
  const body = await request.json().catch(() => ({}));
  const terms = z.record(z.string(), z.unknown()).safeParse(body.termsSnapshot);
  try {
    const { data, error } = await auth.supabase.rpc("issue_event_proposal", { target_proposal: proposalId, terms: terms.success ? terms.data : null });
    if (error || !data) return eventErrorResponse(error, "The proposal could not be issued.");
    return NextResponse.json({ proposal: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The proposal could not be issued."); }
}
