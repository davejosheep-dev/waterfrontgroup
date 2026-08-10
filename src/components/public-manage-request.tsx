"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, LoaderCircle, MessageSquare, RotateCcw, Users, XCircle } from "lucide-react";
import { PublicShell, notice } from "./public-booking-flow";
import { requestTypeLabel, type PublicRequestRecord } from "@/lib/public-booking";
import { StatusBadge } from "@/components/ui/status-badge";

type EventItem = { type: string; actor: string; message?: string; createdAt: string };

export function PublicManageRequest({ token }: { token: string }) {
  const [data, setData] = useState<{ request: PublicRequestRecord; events: EventItem[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState("");

  async function load() {
    const response = await fetch(`/api/public/manage/${encodeURIComponent(token)}`, { cache: "no-store", referrerPolicy: "no-referrer" });
    const payload = await response.json();
    if (!response.ok) setError(payload.error || "This manage link is unavailable."); else setData(payload);
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/public/manage/${encodeURIComponent(token)}`, { cache: "no-store", referrerPolicy: "no-referrer" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() }))
      .then(({ ok, payload }) => {
        if (!active) return;
        if (!ok) setError(payload.error || "This manage link is unavailable.");
        else setData(payload);
      });
    return () => { active = false; };
  }, [token]);

  async function action(name: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/public/manage/${encodeURIComponent(token)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, details }), referrerPolicy: "no-referrer" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await load(); setDetails("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That action was not completed."); }
    finally { setBusy(false); }
  }

  if (!data && !error) return <PublicShell><main className="flex min-h-[60vh] items-center justify-center"><LoaderCircle className="animate-spin text-[var(--primary)]" aria-label="Loading request" /></main></PublicShell>;
  if (!data) return <PublicShell><main className="mx-auto max-w-xl px-5 py-16"><div className="rounded-lg border border-rose-200 bg-card p-7 text-center"><XCircle className="mx-auto text-rose-600" /><h1 className="mt-4 font-display text-3xl">Manage link unavailable</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">{error}</p><Link href="/reserve/waterfront-seafood" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#bc6500]"><ArrowLeft size={16} />Start a new request</Link></div></main></PublicShell>;

  const request = data.request;
  const pending = !["approved_converted", "declined", "withdrawn_by_guest", "closed_duplicate", "expired_unresolved"].includes(request.status);
  return <PublicShell><main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
    <Link href="/reserve/waterfront-seafood" className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-[var(--muted-foreground)]"><ArrowLeft size={15} />Waterfront booking requests</Link>
    <div className="grid gap-6 md:grid-cols-[1fr_300px]"><section className="rounded-lg border border-border bg-card p-6 shadow-soft sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-accent-strong">Request {request.reference}</div><h1 className="mt-2 font-display text-4xl">{requestTypeLabel(request.requestType)}</h1></div><StatusBadge status={request.status} /></div>
      <div className="mt-7 grid gap-3 sm:grid-cols-3"><ManageDetail icon={<CalendarDays size={16} />} label="Preferred date" value={request.date} /><ManageDetail icon={<Clock3 size={16} />} label="Preferred time" value={request.time} /><ManageDetail icon={<Users size={16} />} label="Party size" value={`${request.guestCount} guests`} /></div>
      {request.depositExpected && <GuestPaymentStatus request={request} />}
      {request.guestMessage && <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4"><div className="flex items-center gap-2 text-xs font-bold text-blue-800"><MessageSquare size={15} />Message on your request</div><p className="mt-2 text-sm leading-6 text-blue-900">{request.guestMessage}</p></div>}
      {request.proposedAlternative && <div className="mt-5 rounded-lg border border-[#f1c58c] bg-[var(--accent-soft)] p-5"><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#b15e00]">Alternative proposed</div><div className="mt-2 font-display text-xl">{request.proposedAlternative}</div><button disabled={busy} onClick={() => action("accept_alternative")} className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white">Accept for final staff review</button></div>}
      {request.status === "more_information_required" && <div className="mt-5"><label className="text-xs font-bold text-[var(--muted-foreground)]">Your response<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={500} rows={4} className="mt-2 w-full rounded-lg border border-[var(--input)] p-3 text-sm font-normal" /></label><button disabled={!details.trim() || busy} onClick={() => action("provide_information")} className="mt-3 rounded-lg bg-[var(--primary-strong)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Send information</button></div>}
      {request.status === "approved_converted" && <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 font-bold text-emerald-800"><CheckCircle2 size={18} />Reservation created</div><p className="mt-2 text-sm text-emerald-900">Reservation {request.linkedReservationCode} is linked to this request. Contact staff for any operational changes.</p><div className="mt-4"><textarea aria-label="Cancellation or reschedule details" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Tell us your preferred change…" rows={3} className="w-full rounded-lg border border-emerald-200 bg-card p-3 text-sm" /><div className="mt-2 flex gap-2"><button disabled={busy} onClick={() => action("reschedule")} className="rounded-lg bg-card px-3 py-2 text-xs font-bold text-emerald-800"><RotateCcw size={13} className="mr-1 inline" />Request reschedule</button><button disabled={busy} onClick={() => action("cancel")} className="rounded-lg bg-card px-3 py-2 text-xs font-bold text-rose-700">Request cancellation</button></div></div></div>}
      {pending && request.status !== "alternative_proposed" && <button disabled={busy} onClick={() => action("withdraw")} className="mt-7 text-xs font-bold text-rose-700 underline decoration-rose-200 underline-offset-4">Withdraw this pending request</button>}
      {error && <div role="alert" className="mt-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    </section>
    <aside className="space-y-4"><div className="rounded-lg bg-[var(--primary-strong)] p-5 text-white"><div className="text-[10px] font-bold uppercase tracking-[.13em] text-[var(--accent)]">Important</div><p className="mt-3 text-sm font-semibold leading-6">{request.status === "approved_converted" ? `Your linked reservation is ${request.linkedReservationCode}. Change requests still need staff approval.` : notice}</p></div><div className="rounded-lg border border-[var(--border)] bg-card p-5"><h2 className="text-xs font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">Request timeline</h2><div className="mt-4 space-y-4">{data.events.map((event, index) => <div key={`${event.createdAt}-${index}`} className="flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--primary)]" /><div><div className="text-xs font-bold capitalize text-[var(--secondary-foreground)]">{event.type.replaceAll("_", " ")}</div><div className="mt-1 text-[10px] text-[var(--muted-foreground)]">{new Date(event.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</div></div></div>)}</div></div></aside>
    </div>
  </main></PublicShell>;
}

function ManageDetail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-3"><div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]">{icon}{label}</div><div className="mt-1.5 text-sm font-semibold text-[var(--secondary-foreground)]">{value}</div></div>;
}

function GuestPaymentStatus({ request }: { request: PublicRequestRecord }) {
  const required = request.requestType === "vip_room" ? "₱8,000.00" : request.requestType === "private_event" ? "To be confirmed by staff" : "₱10,000.00";
  const hasReservation = request.status === "approved_converted";
  return <section className="mt-5 rounded-lg border border-border bg-[var(--secondary)] p-5" aria-labelledby="guest-payment-status"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-semibold text-[var(--accent-strong)]">Deposit status</div><h2 id="guest-payment-status" className="mt-1 text-[19px] font-semibold tracking-[-.015em] text-[var(--foreground)]">{hasReservation ? "Payment review" : "Expected after approval"}</h2></div><span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-800">{hasReservation ? "Pending verification" : "Not yet requested"}</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><ManageDetail icon={<span>₱</span>} label="Required" value={required} /><ManageDetail icon={<CheckCircle2 size={14} />} label="Verified" value="₱0.00" /><ManageDetail icon={<Clock3 size={14} />} label="Outstanding" value={required} /><ManageDetail icon={<CalendarDays size={14} />} label="Due date" value="Set by staff" /></div><p className="mt-4 text-[11px] leading-5 text-[var(--muted-foreground)]">Guests cannot upload proof here. Send proof through your existing Waterfront conversation; a payment counts only after staff reviews and verifies it. No proof files or internal verification notes are shown on this page.</p></section>;
}
