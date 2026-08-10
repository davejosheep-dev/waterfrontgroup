import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const publicPath = request.nextUrl.pathname.startsWith("/reserve/")
    || request.nextUrl.pathname.startsWith("/preferences/")
    || request.nextUrl.pathname.startsWith("/auth/callback")
    || request.nextUrl.pathname === "/update-password"
    || request.nextUrl.pathname.startsWith("/api/public/")
    || request.nextUrl.pathname === "/api/v1/health"
    || request.nextUrl.pathname.startsWith("/api/webhooks/");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.APP_DEMO_MODE === "true" && process.env.NODE_ENV !== "production") return NextResponse.next({ request });
  if (!url || !key) return NextResponse.next({ request });
  if (publicPath) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && request.nextUrl.pathname !== "/login") return NextResponse.redirect(new URL("/login", request.url));
  if (user && request.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
