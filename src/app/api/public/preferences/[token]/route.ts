import { NextRequest, NextResponse } from "next/server";
import { getPublicPreferences, updatePublicPreferences } from "@/lib/marketing-preference-store";

const privacyHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

function rateKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local-preview";
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const preferences = getPublicPreferences(token, rateKey(request));
    if (!preferences) return NextResponse.json({ error: "This preference link is unavailable." }, { status: 404, headers: privacyHeaders });
    return NextResponse.json({ preferences }, { headers: privacyHeaders });
  } catch (error) {
    const status = error instanceof Error && error.message === "RATE_LIMITED" ? 429 : 400;
    return NextResponse.json({ error: "This preference link is unavailable." }, { status, headers: privacyHeaders });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: "This request could not be completed." }, { status: 403, headers: privacyHeaders });
    const { token } = await context.params;
    const preferences = updatePublicPreferences(token, await request.json(), rateKey(request));
    if (!preferences) return NextResponse.json({ error: "This preference link is unavailable." }, { status: 404, headers: privacyHeaders });
    return NextResponse.json({ preferences }, { headers: privacyHeaders });
  } catch (error) {
    const status = error instanceof Error && error.message === "RATE_LIMITED" ? 429 : 400;
    return NextResponse.json({ error: "This request could not be completed." }, { status, headers: privacyHeaders });
  }
}
