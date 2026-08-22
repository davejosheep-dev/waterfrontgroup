import type { NextConfig } from "next";

// The staff workspace renders guest contact details, deposit records and
// payment proofs, so it must not be framable and must not depend on the
// platform for its baseline headers. Vercel supplies HSTS at the edge;
// everything below is the application's own responsibility.
const supabaseOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
})();

const isDevelopment = process.env.NODE_ENV === "development";

// `'self'` is not reliably treated as covering ws:/wss: by browsers, so the
// dev server's HMR socket has to be listed explicitly or the app hangs on
// first paint with the socket blocked.
const connectSources = [
  "'self'",
  supabaseOrigin,
  supabaseOrigin.replace("https://", "wss://"),
  ...(isDevelopment ? ["ws://localhost:*", "wss://localhost:*", "ws://127.0.0.1:*"] : []),
]
  .filter(Boolean)
  .join(" ");

// `unsafe-inline` for styles is required by Next's streamed style injection.
// Scripts stay free of it: Next emits its bootstrap inline, so `strict-dynamic`
// with a nonce would need middleware-generated nonces on every request — a
// follow-up worth doing, but not one to land silently alongside header setup.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' ${isDevelopment ? "'unsafe-eval' 'unsafe-inline'" : "'unsafe-inline'"}`,
  `connect-src ${connectSources}`,
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
