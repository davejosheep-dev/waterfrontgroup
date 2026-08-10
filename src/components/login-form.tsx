"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, AtSign, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { login, requestPasswordReset } from "@/app/actions/auth";

type LoginMethod = "email" | "username";

function Feedback({ error, message }: { error?: string; message?: string }) {
  if (error) return <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</p>;
  if (message) return <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">{message}</p>;
  return null;
}

function Control({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex h-11 items-center gap-3 rounded-md border border-input bg-card px-3 focus-within:border-ring">{children}</div>;
}

export function LoginForm({ notice }: { notice?: string }) {
  const [screen, setScreen] = useState<"signin" | "reset">("signin");
  const [method, setMethod] = useState<LoginMethod>("email");
  const [showPassword, setShowPassword] = useState(false);
  const [loginState, loginAction, loginPending] = useActionState(login, undefined);
  const [resetState, resetAction, resetPending] = useActionState(requestPasswordReset, undefined);

  if (screen === "reset") {
    return <form action={resetAction} className="mt-7 space-y-4">
      <button type="button" onClick={() => setScreen("signin")} className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft size={14} />Back to sign in</button>
      <div><h2 className="font-display text-2xl text-foreground">Reset your password</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Password reset requires the work email attached to your account.</p></div>
      <label className="block text-xs font-semibold text-muted-foreground">Work email<Control><Mail size={16} className="text-muted-foreground" /><input name="email" type="email" required autoComplete="email" placeholder="you@waterfronthospitalitygroup.com" className="w-full border-0 bg-transparent text-sm outline-none" /></Control></label>
      <Feedback error={resetState?.error} message={resetState?.message} />
      <button disabled={resetPending} className="flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary-strong disabled:opacity-60">{resetPending ? "Sending reset link…" : "Email reset link"}</button>
    </form>;
  }

  const usingEmail = method === "email";
  return <form action={loginAction} className="mt-7 space-y-4">
    <fieldset>
      <legend className="text-xs font-semibold text-muted-foreground">Sign in with</legend>
      <div className="mt-2 grid grid-cols-2 rounded-md bg-secondary p-1" aria-label="Sign-in method">
        <button type="button" aria-pressed={usingEmail} onClick={() => setMethod("email")} className={`flex h-9 items-center justify-center gap-2 rounded-md text-xs font-semibold transition ${usingEmail ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}><AtSign size={15} />Email</button>
        <button type="button" aria-pressed={!usingEmail} onClick={() => setMethod("username")} className={`flex h-9 items-center justify-center gap-2 rounded-md text-xs font-semibold transition ${!usingEmail ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}><UserRound size={15} />Username</button>
      </div>
    </fieldset>
    <label className="block text-xs font-semibold text-muted-foreground">{usingEmail ? "Work email" : "Username"}<Control>{usingEmail ? <Mail size={16} className="text-muted-foreground" /> : <UserRound size={16} className="text-muted-foreground" />}<input key={method} name="identifier" type={usingEmail ? "email" : "text"} required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={usingEmail ? "you@waterfronthospitalitygroup.com" : "mika.reyes"} pattern={usingEmail ? undefined : "[A-Za-z][A-Za-z0-9._-]{2,31}"} minLength={usingEmail ? undefined : 3} maxLength={usingEmail ? 160 : 32} className="w-full border-0 bg-transparent text-sm outline-none" /></Control></label>
    <div>
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground"><label htmlFor="login-password">Password</label><button type="button" onClick={() => setScreen("reset")} className="text-accent-strong hover:text-foreground">Forgot password?</button></div>
      <Control><LockKeyhole size={16} className="text-muted-foreground" /><input id="login-password" name="password" type={showPassword ? "text" : "password"} required minLength={8} maxLength={72} autoComplete="current-password" placeholder="••••••••••" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-primary">{showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}</button></Control>
    </div>
    <Feedback error={loginState?.error} message={notice} />
    <button disabled={loginPending} className="flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground transition hover:bg-primary-strong disabled:opacity-60">{loginPending ? "Signing in…" : "Sign in securely"}</button>
  </form>;
}
