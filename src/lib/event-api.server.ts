import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireEventAuth() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Authentication required.", code: "UNAUTHENTICATED" }, { status: 401 }) } as const;
  return { supabase, user } as const;
}

export function readEventCommandId(request: Request) {
  return (request.headers.get("idempotency-key")?.trim() || randomUUID()).slice(0, 160);
}

export function eventErrorResponse(error: unknown, fallback = "The event operation could not be completed.") {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const known: Record<string, { status: number; error: string }> = {
    "Not authorized": { status: 403, error: "Your role cannot perform this event action." },
    VENUE_NOT_FOUND: { status: 404, error: "Venue is not available to this account." },
    INQUIRY_NOT_FOUND: { status: 404, error: "Event inquiry not found." },
    EVENT_NOT_FOUND: { status: 404, error: "Event not found." },
    PROPOSAL_NOT_FOUND: { status: 404, error: "Proposal not found." },
    EVENT_SPACE_UNAVAILABLE: { status: 409, error: "That space is already held or booked for the selected interval." },
    SPACE_NOT_FOUND: { status: 409, error: "One or more selected spaces are no longer active." },
    HOLD_EXPIRED: { status: 409, error: "The event hold has expired. Check availability again." },
    EVENT_HOLD_REQUIRED: { status: 409, error: "A live space hold is required before confirmation." },
    DEPOSIT_REQUIRED: { status: 409, error: "The required deposit has not been recorded." },
    PROPOSAL_IMMUTABLE: { status: 409, error: "Issued and accepted proposal versions are immutable." },
    PROPOSAL_NOT_ISSUED: { status: 409, error: "Only an issued proposal can be accepted." },
    INVALID_EVENT_STAGE_TRANSITION: { status: 409, error: "That pipeline transition is not allowed." },
    STAGE_REASON_REQUIRED: { status: 400, error: "A reason is required for this stage change." },
    INQUIRY_CANNOT_CONVERT: { status: 409, error: "This inquiry cannot be converted in its current state." },
    SPACE_SELECTION_REQUIRED: { status: 400, error: "Select at least one event space." },
  };
  const match = Object.entries(known).find(([code]) => message.includes(code));
  if (match) return NextResponse.json({ error: match[1].error, code: match[0] }, { status: match[1].status });
  return NextResponse.json({ error: fallback, code: "EVENT_COMMAND_FAILED" }, { status: 400 });
}

export async function getVenueScope(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, venueId: string) {
  const { data: venue, error } = await supabase.from("outlets").select("id,organization_id,active").eq("id", venueId).maybeSingle();
  if (error || !venue || !venue.active) return null;
  return venue;
}
