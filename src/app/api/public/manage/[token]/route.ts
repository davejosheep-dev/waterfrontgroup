import { NextRequest, NextResponse } from "next/server";
import { guestManageAction, requestForManageToken } from "@/lib/public-store";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const managed = requestForManageToken(token);
  if (!managed) return NextResponse.json({ error: "This manage link is invalid or no longer available." }, { status: 404 });
  return NextResponse.json(managed, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const body = await request.json();
    const result = guestManageAction(token, String(body.action), typeof body.details === "string" ? body.details : undefined);
    return NextResponse.json({ request: result }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ error: "That action is not available for this request." }, { status: 400 });
  }
}
