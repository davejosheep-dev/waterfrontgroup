"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/admin-access";
import { passwordResetRedirectUrl } from "@/lib/auth-urls";
import { isEmailLike, normalizeUsername, usernamePattern } from "@/lib/auth-identity";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthActionState = { error?: string; message?: string } | undefined;

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(160),
  password: z.string().min(8).max(72),
});
const resetSchema = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()) });
const updatePasswordSchema = z.object({
  password: z.string().min(8).max(72),
  confirmation: z.string().min(8).max(72),
}).refine((value) => value.password === value.confirmation, { path: ["confirmation"], message: "Passwords do not match." });
const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(72),
  password: z.string().min(8).max(72),
  confirmation: z.string().min(8).max(72),
}).refine((value) => value.password === value.confirmation, { path: ["confirmation"], message: "Passwords do not match." });

async function resolveLoginEmail(identifier: string) {
  if (isEmailLike(identifier)) {
    const parsedEmail = z.email().safeParse(identifier.trim().toLowerCase());
    return parsedEmail.success ? parsedEmail.data : null;
  }

  const username = normalizeUsername(identifier);
  if (!usernamePattern.test(username)) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("staff_profiles")
    .select("email,active")
    .eq("username", username)
    .maybeSingle();
  if (error || !data?.active || !data.email) return null;
  return data.email;
}

export async function login(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({ identifier: formData.get("identifier"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter a valid email or username and a password of at least 8 characters." };

  try {
    const email = await resolveLoginEmail(parsed.data.identifier);
    if (!email) return { error: "The email, username, or password is incorrect." };
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
    if (error) return { error: "The email, username, or password is incorrect." };
  } catch {
    return { error: "Authentication is not configured for this environment." };
  }
  redirect("/");
}

export async function requestPasswordReset(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter the work email attached to your account." };

  const requestHeaders = await headers();
  const referer = requestHeaders.get("referer");
  let requestOrigin = requestHeaders.get("origin") ?? undefined;
  if (!requestOrigin && referer) {
    try { requestOrigin = new URL(referer).origin; } catch { /* APP_URL remains the fallback. */ }
  }
  const redirectTo = passwordResetRedirectUrl(requestOrigin ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined));
  if (!redirectTo) return { error: "Password recovery is not configured for this environment." };
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
    if (error) return { error: "Password recovery is temporarily unavailable. Try again shortly." };
  } catch {
    return { error: "Password recovery is temporarily unavailable. Try again shortly." };
  }
  return { message: "If that email belongs to an account, a password reset link is on its way." };
}

export async function updatePassword(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({ password: formData.get("password"), confirmation: formData.get("confirmation") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Use a password of at least 8 characters." };

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "This reset link is no longer valid. Request a new one." };
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return { error: "The password could not be updated. Request a new reset link and try again." };
    await supabase.auth.signOut();
  } catch {
    return { error: "Password recovery is temporarily unavailable. Try again shortly." };
  }
  redirect("/login?password=updated");
}

export async function changeOwnPassword(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Use a password of at least 8 characters." };

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Your session has expired. Sign in again before changing your password." };
    if (!user.email) return { error: "Add a work email before changing your password from Profile." };
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return { error: "Password changes are not configured for this environment." };
    const verifier = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: currentPasswordError } = await verifier.auth.signInWithPassword({ email: user.email, password: parsed.data.currentPassword });
    if (currentPasswordError) return { error: "The current password is incorrect or the new password could not be saved." };
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password, current_password: parsed.data.currentPassword });
    if (error) return { error: "The current password is incorrect or the new password could not be saved." };
  } catch {
    return { error: "Password changes are temporarily unavailable. Try again shortly." };
  }
  return { message: "Your password was changed successfully." };
}

export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
