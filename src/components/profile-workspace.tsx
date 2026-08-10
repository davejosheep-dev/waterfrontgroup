"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { changeOwnPassword } from "@/app/actions/auth";
import { roleDetails, type AccessContext } from "@/lib/access-control";
import { PageHeader } from "@/components/ui/baseline";

type PasswordFieldProps = {
  id: string;
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  value: boolean;
  onToggle: () => void;
};

function PasswordField({ id, label, name, autoComplete, value, onToggle }: PasswordFieldProps) {
  return <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">{label}
    <span className="mt-2 flex h-12 items-center gap-3 rounded-lg border border-[var(--input)] bg-card px-4 focus-within:border-[var(--primary)]">
      <LockKeyhole size={16} className="text-[var(--muted-foreground)]" />
      <input id={id} name={name} type={value ? "text" : "password"} required minLength={8} maxLength={72} autoComplete={autoComplete} className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
      <button type="button" aria-label={value ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={value} onClick={onToggle} className="rounded-md p-1 text-[var(--muted-foreground)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
        {value ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </span>
  </label>;
}

export function ProfileWorkspace({ accessContext }: { accessContext: AccessContext }) {
  const [state, action, pending] = useActionState(changeOwnPassword, undefined);
  const [visible, setVisible] = useState({ current: false, next: false, confirmation: false });
  const role = roleDetails[accessContext.role];

  return <div className="animate-rise">
    <PageHeader eyebrow="Account & security" title="Your profile" description="Review your Waterfront access and keep your sign-in password up to date." />

    <div className="grid gap-5 px-5 py-6 md:px-8 xl:grid-cols-[.85fr_1.15fr]">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-strong)] text-lg font-bold text-white">{accessContext.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "WF"}</div>
          <div className="min-w-0"><h2 className="truncate font-display text-2xl text-[var(--foreground)]">{accessContext.fullName}</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">{role.label} · {accessContext.conceptName}</p></div>
        </div>
        <dl className="mt-7 space-y-4 border-t border-border pt-5">
          <div className="flex items-start gap-3"><Mail size={16} className="mt-0.5 text-[var(--accent-strong)]" /><div><dt className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">Work email</dt><dd className="mt-1 text-sm font-semibold text-[var(--secondary-foreground)]">{accessContext.email || "No email on file"}</dd></div></div>
          <div className="flex items-start gap-3"><UserRound size={16} className="mt-0.5 text-[var(--accent-strong)]" /><div><dt className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">Username</dt><dd className="mt-1 text-sm font-semibold text-[var(--secondary-foreground)]">@{accessContext.username || "Not assigned"}</dd></div></div>
          <div className="flex items-start gap-3"><ShieldCheck size={16} className="mt-0.5 text-[var(--accent-strong)]" /><div><dt className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">Access scope</dt><dd className="mt-1 text-sm font-semibold text-[var(--secondary-foreground)]">{role.scope}</dd></div></div>
        </dl>
        <div className="mt-6 rounded-lg bg-[var(--primary-soft)] p-4 text-xs leading-5 text-[var(--muted-foreground)]"><ShieldCheck size={16} className="mr-2 inline text-[var(--primary)]" />Superadmin reset links return users to the secure password page inside this app.</div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]"><KeyRound size={19} /></div><div><h2 className="font-display text-2xl text-[var(--foreground)]">Change your password</h2><p className="mt-1 text-sm leading-5 text-[var(--muted-foreground)]">Confirm your current password before choosing a new one.</p></div></div>
        <form action={action} className="mt-7 space-y-4">
          <PasswordField id="profile-current-password" name="currentPassword" label="Current password" autoComplete="current-password" value={visible.current} onToggle={() => setVisible((current) => ({ ...current, current: !current.current }))} />
          <PasswordField id="profile-new-password" name="password" label="New password" autoComplete="new-password" value={visible.next} onToggle={() => setVisible((current) => ({ ...current, next: !current.next }))} />
          <PasswordField id="profile-confirm-password" name="confirmation" label="Confirm new password" autoComplete="new-password" value={visible.confirmation} onToggle={() => setVisible((current) => ({ ...current, confirmation: !current.confirmation }))} />
          {state?.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">{state.error}</p> : null}
          {state?.message ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">{state.message}</p> : null}
          <button disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary-strong)] text-sm font-bold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-60">{pending ? "Saving password…" : "Save new password"}</button>
        </form>
      </section>
    </div>
  </div>;
}
