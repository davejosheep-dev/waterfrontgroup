import { NextRequest, NextResponse } from "next/server";
import { getCurrentAccessContext } from "@/lib/access-context";
import { canAccessScreen, hasPermission } from "@/lib/access-control";
import { listPublicRequests, staffRequestAction, type StaffRequestAction } from "@/lib/public-store";

export const dynamic = "force-dynamic";

// This route was reachable by any authenticated caller. The proxy confirms a
// Supabase session exists and nothing more, and self-registration means a
// session is not evidence of employment — so the queue, which carries guest
// names, mobile numbers and email addresses, has to authorize here rather
// than rely on middleware. Every sibling route under /api/v1/staff already
// does; this one was the exception.
async function denyUnlessPermitted(mutating: boolean) {
  const accessContext = await getCurrentAccessContext();
  // Resolving a context requires an active staff profile, so this is what
  // separates a member of staff from someone who merely signed up.
  if (!accessContext) {
    return NextResponse.json({ error: "Authentication required.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!canAccessScreen(accessContext.role, "requests")) {
    return NextResponse.json({ error: "Your role cannot view public requests.", code: "FORBIDDEN" }, { status: 403 });
  }
  // Owner is read-only oversight across the group, so reaching the screen is
  // not enough to review, decline, or convert a request into a reservation.
  if (mutating && !hasPermission(accessContext.role, "operate_reservations")) {
    return NextResponse.json({ error: "Your role cannot act on public requests.", code: "FORBIDDEN" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await denyUnlessPermitted(false);
  if (denied) return denied;
  return NextResponse.json({ requests: listPublicRequests() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const denied = await denyUnlessPermitted(true);
  if (denied) return denied;
  try {
    const body = await request.json();
    const result = staffRequestAction(String(body.requestId), body.action as StaffRequestAction, body.details);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_ACTION";
    const status = code === "STALE_AVAILABILITY" || code === "ALREADY_CONVERTED" ? 409 : 400;
    return NextResponse.json({ error: code === "STALE_AVAILABILITY" ? "Availability changed. The request was preserved—propose an alternative instead." : "That staff action could not be completed.", code }, { status });
  }
}
