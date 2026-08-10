"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, Mail, MessageCircle, ShieldCheck, XCircle } from "lucide-react";
import { PublicShell } from "./public-booking-flow";
import type { PublicMarketingPreferences } from "@/lib/marketing-preference-store";

function idempotencyKey() {
  return `preference-${crypto.randomUUID()}`;
}

export function PublicPreferenceCenter({ token }: { token: string }) {
  const [preferences, setPreferences] = useState<PublicMarketingPreferences | null>(null);
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [whatsappMarketing, setWhatsappMarketing] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/public/preferences/${encodeURIComponent(token)}`, { cache: "no-store", referrerPolicy: "no-referrer" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() }))
      .then(({ ok, payload }) => {
        if (!active) return;
        if (!ok) { setError(payload.error || "This preference link is unavailable."); return; }
        const next = payload.preferences as PublicMarketingPreferences;
        setPreferences(next);
        setEmailMarketing(next.email.status === "granted");
        setWhatsappMarketing(next.whatsapp.status === "granted");
      })
      .catch(() => setError("This preference link is unavailable."));
    return () => { active = false; };
  }, [token]);

  async function update(body: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/public/preferences/${encodeURIComponent(token)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), referrerPolicy: "no-referrer",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "This request could not be completed.");
      const next = payload.preferences as PublicMarketingPreferences;
      setPreferences(next);
      setEmailMarketing(next.email.status === "granted");
      setWhatsappMarketing(next.whatsapp.status === "granted");
      setNoticeAccepted(false);
      setMessage(success);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This request could not be completed."); }
    finally { setBusy(false); }
  }

  if (!preferences && !error) return <PublicShell><main className="flex min-h-[70vh] items-center justify-center"><LoaderCircle className="animate-spin text-[var(--primary)]" aria-label="Loading preferences" /></main></PublicShell>;
  if (!preferences) return <PublicShell><main className="mx-auto max-w-xl px-5 py-16"><div className="rounded-lg border border-rose-200 bg-card p-8 text-center"><XCircle className="mx-auto text-rose-600" /><h1 className="mt-4 font-display text-3xl">Preference link unavailable</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{error}</p><Link href="/reserve/waterfront-seafood" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"><ArrowLeft size={16} />Waterfront reservations</Link></div></main></PublicShell>;

  return <PublicShell><main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
    <Link href="/reserve/waterfront-seafood" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]"><ArrowLeft size={16} />Waterfront reservations</Link>
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="border-b border-border px-6 py-8 sm:px-9"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]"><ShieldCheck size={22} /></div><p className="mt-6 text-[12px] font-semibold text-[var(--accent-strong)]">Your marketing choices</p><h1 className="mt-2 font-display text-[36px] leading-tight text-[var(--foreground)]">Hello, {preferences.guestDisplayName}</h1><p className="mt-3 max-w-xl text-[16px] leading-7 text-[var(--muted-foreground)]">Choose whether {preferences.scopeLabel} may send occasional marketing. Reservation and payment updates are managed separately.</p></header>
      <div className="space-y-4 px-6 py-7 sm:px-9">
        <PreferenceRow icon={<Mail size={20} />} title="Email marketing" masked={preferences.email.masked} status={preferences.email.status} checked={emailMarketing} onChange={setEmailMarketing} />
        <PreferenceRow icon={<MessageCircle size={20} />} title="WhatsApp marketing" masked={preferences.whatsapp.masked} status={preferences.whatsapp.status} checked={whatsappMarketing} onChange={setWhatsappMarketing} badge="Production channel disabled" />
        <label className="flex items-start gap-3 rounded-lg bg-[var(--secondary)] p-4 text-[13px] leading-5 text-[var(--muted-foreground)]"><input aria-label="Confirm marketing notice" type="checkbox" checked={noticeAccepted} onChange={(event) => setNoticeAccepted(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]" /><span>I have reviewed the Waterfront marketing notice ({preferences.noticeVersion}) and understand I can withdraw at any time. No choice here changes my reservation.</span></label>
        {message && <div role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800"><Check size={17} />{message}</div>}
        {error && <div role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
        <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
          <button disabled={busy || !noticeAccepted} onClick={() => update({ action: "save", emailMarketing, whatsappMarketing, noticeAccepted: true, idempotencyKey: idempotencyKey() }, "Your marketing choices were updated.")} className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--primary)] px-6 text-sm font-semibold text-white disabled:opacity-40">Save choices</button>
          <button disabled={busy} onClick={() => update({ action: "unsubscribe_email", idempotencyKey: idempotencyKey() }, "Email marketing is now unsubscribed.")} className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-6 text-sm font-semibold text-[var(--foreground)]">Unsubscribe from email</button>
          <button disabled={busy} onClick={() => update({ action: "withdraw_all", idempotencyKey: idempotencyKey() }, "All Waterfront marketing in this scope is withdrawn.")} className="inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-semibold text-rose-700">Withdraw all</button>
        </div>
        <p className="text-[12px] leading-5 text-[var(--muted-foreground)]">Last updated {new Date(preferences.updatedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}. This page does not show reservations, payments, private notes, or consent evidence.</p>
      </div>
    </section>
  </main></PublicShell>;
}

function PreferenceRow({ icon, title, masked, status, checked, onChange, badge }: { icon: React.ReactNode; title: string; masked: string; status: string; checked: boolean; onChange: (next: boolean) => void; badge?: string }) {
  return <label className="flex cursor-pointer items-center gap-4 rounded-lg border border-border p-4 sm:p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-strong)]">{icon}</span><span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold text-[var(--foreground)]">{title}</span><span className="mt-1 block truncate text-[13px] text-[var(--muted-foreground)]">{masked} · Current state: {status}</span>{badge && <span className="mt-1.5 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">{badge}</span>}</span><input aria-label={title} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-6 w-6 shrink-0 accent-[var(--primary)]" /></label>;
}
