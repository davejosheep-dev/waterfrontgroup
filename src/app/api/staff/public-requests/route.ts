import { NextRequest, NextResponse } from "next/server";
import { listPublicRequests, staffRequestAction, type StaffRequestAction } from "@/lib/public-store";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ requests: listPublicRequests() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
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
