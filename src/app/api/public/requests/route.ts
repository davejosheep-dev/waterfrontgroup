import { NextRequest, NextResponse } from "next/server";
import { submitPublicRequest } from "@/lib/public-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.PHASE2_PUBLIC_BOOKING_ENABLED !== "true") {
    return NextResponse.json({ error: "Online requests are temporarily unavailable. Please contact Waterfront directly.", code: "PUBLIC_INTAKE_DISABLED" }, { status: 503 });
  }
  try {
    const body = await request.json();
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local-preview";
    const result = submitPublicRequest(body, idempotencyKey, rateKey);
    return NextResponse.json({ request: result.request, token: result.token }, { status: 201, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_REQUEST";
    const status = message === "RATE_LIMITED" ? 429 : 400;
    return NextResponse.json({ error: "We could not submit that request. Please review the details and try again.", code: message }, { status });
  }
}
