import { SlidingWindowRateLimit } from "@/lib/public-security";

const limiters = {
  availability: new SlidingWindowRateLimit(60, 60_000),
  booking: new SlidingWindowRateLimit(8, 10 * 60_000),
  manage: new SlidingWindowRateLimit(20, 10 * 60_000),
};

export function publicRateKey(request: Request, scope: keyof typeof limiters) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "local-preview";
  return limiters[scope].check(`${scope}:${address}`);
}
