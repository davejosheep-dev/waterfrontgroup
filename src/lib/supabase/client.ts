"use client";
import { createBrowserClient } from "@supabase/ssr";
import { readPublicEnvironment } from "@/lib/env";

export function createClientSupabaseClient() {
  const environment = readPublicEnvironment();
  return createBrowserClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
