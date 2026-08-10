"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { PublicShell } from "@/components/public-booking-flow";

type Slot = { localTime: string; startsAt: string; endsAt: string };
type Hold = { holdToken: string; expiresAt: string; slot: Slot };
type Confirmation = { confirmationCode: string; status: string; startsAt: string; endsAt: string; manageToken: string };

function tomorrowInManila() { return new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
function formatTime(value: string) { return new Date(`2000-01-01T${value}:00`).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }); }

export function PublicTableBookingFlow() {
  const [date, setDate] = useState(tomorrowInManila);
  const [partySize, setPartySize] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [hold, setHold] = useState<Hold | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ fullName: "", mobile: "", email: "", occasion: "", specialRequests: "", termsAccepted: false });
  const [nowMs, setNowMs] = useState(0);
  const holdSeconds = hold ? Math.max(0, Math.ceil((new Date(hold.expiresAt).getTime() - nowMs) / 1000)) : 0;

  useEffect(() => {
    if (!hold) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hold]);

  async function search() {
    setLoading(true); setError(""); setHold(null); setSelectedTime("");
    try {
      const query = new URLSearchParams({ date, partySize: String(partySize), duration: String(durationMinutes) });
      const response = await fetch(`/api/v1/public/venues/waterfront-seafood-cocktails/availability?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Availability is unavailable.");
      setSlots(payload.slots ?? []);
      if (!payload.slots?.length) setError("No table-aware times are available for this request. Try another date or party size.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Availability is unavailable."); }
    finally { setLoading(false); }
  }

  async function chooseTime(time: string) {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/v1/public/venues/waterfront-seafood-cocktails/holds", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ date, time, partySize, durationMinutes }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "That time is no longer available.");
      setHold(payload); setSelectedTime(time); setStep(2);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "That time is no longer available."); }
    finally { setLoading(false); }
  }

  async function submit() {
    if (!hold || !form.termsAccepted) return;
    if (holdSeconds <= 0) { setError("Your table hold expired. Search again to choose a new time."); setStep(1); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/v1/public/venues/waterfront-seafood-cocktails/reservations", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ holdToken: hold.holdToken, fullName: form.fullName, mobile: form.mobile, email: form.email, occasion: form.occasion, specialRequests: form.specialRequests, termsAccepted: true, termsVersion: "phase2-preview" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "We could not complete the reservation.");
      setConfirmation(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not complete the reservation."); }
    finally { setLoading(false); }
  }

  if (confirmation) return <PublicShell><main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16"><section className="rounded-2xl border border-[var(--border)] bg-card p-6 shadow-soft sm:p-10"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={28} /></div><div className="mt-6 text-[11px] font-bold uppercase tracking-[.16em] text-[var(--accent-strong)]">Reservation confirmed</div><h1 className="mt-3 font-display text-4xl leading-tight">Your table is waiting.</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Waterfront Seafood & Cocktails · Iloilo City</p><div className="my-7 rounded-xl bg-[var(--primary-strong)] p-5 text-white sm:flex sm:items-center sm:justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-white/55">Confirmation code</div><div className="mt-1 font-display text-3xl tracking-wide">{confirmation.confirmationCode}</div></div><div className="mt-4 text-sm sm:mt-0">{new Date(confirmation.startsAt).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" })} · {new Date(confirmation.startsAt).toLocaleTimeString("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" })}</div></div><div className="grid gap-3 sm:grid-cols-2"><Link href={`/reserve/manage-booking/${confirmation.manageToken}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-5 text-sm font-bold text-white">Manage reservation <ArrowRight size={16} /></Link><button onClick={() => window.print()} className="min-h-12 rounded-lg border border-[var(--input)] bg-card px-5 text-sm font-bold text-[var(--secondary-foreground)]">Print details</button></div><div className="mt-6 flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-4 text-xs leading-5 text-[var(--muted-foreground)]"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--primary)]" />This secure manage link is the only way to view or cancel the reservation online.</div></section></main></PublicShell>;

  return <PublicShell><main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[1fr_340px]"><section className="rounded-2xl border border-[var(--border)] bg-card p-5 shadow-soft sm:p-8"><div className="mb-8 flex items-start justify-between gap-4"><div><div className="text-[11px] font-bold uppercase tracking-[.16em] text-[var(--accent-strong)]">Waterfront · Iloilo</div><h1 className="mt-3 font-display text-4xl leading-tight">Reserve your table.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">Live table-aware availability, a 10-minute hold, and an instant confirmation when the details are complete.</p></div><Link href="/reserve/waterfront-seafood" className="hidden items-center gap-1.5 text-xs font-bold text-[var(--primary)] sm:inline-flex"><ArrowLeft size={15} />Request an event</Link></div><div className="flex gap-2" aria-label="Reservation steps"><div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} /><div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} /></div>{step === 1 ? <div className="mt-8 space-y-7"><div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">Date<input aria-label="Reservation date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2 h-12 w-full rounded-lg border border-[var(--input)] bg-card px-3.5 text-sm" /></label><label className="text-sm font-semibold">Party size<input aria-label="Reservation party size" type="number" min={1} max={40} value={partySize} onChange={(event) => setPartySize(Number(event.target.value))} className="mt-2 h-12 w-full rounded-lg border border-[var(--input)] bg-card px-3.5 text-sm" /></label><label className="text-sm font-semibold">Dining time<select aria-label="Reservation duration" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-2 h-12 w-full rounded-lg border border-[var(--input)] bg-card px-3.5 text-sm"><option value={120}>2 hours</option><option value={150}>2.5 hours</option><option value={180}>3 hours</option></select></label></div><button onClick={search} disabled={loading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-5 text-sm font-bold text-white disabled:opacity-50">{loading ? "Checking tables…" : "Check live availability"}<CalendarDays size={16} /></button>{error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}{slots.length > 0 && <div><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl">Choose a time</h2><span className="text-xs text-[var(--muted-foreground)]">{slots.length} table-aware options</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{slots.map((slot) => <button key={slot.localTime} onClick={() => void chooseTime(slot.localTime)} disabled={loading} className={`min-h-12 rounded-lg border px-3 text-sm font-bold transition ${selectedTime === slot.localTime ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "border-[var(--border)] bg-card text-[var(--secondary-foreground)] hover:border-[var(--primary)]"}`}>{formatTime(slot.localTime)}<span className="mt-1 block text-[10px] font-normal text-[var(--muted-foreground)]">Available</span></button>)}</div></div>}</div> : <div className="mt-8 space-y-6"><div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><span><Check size={16} className="mr-2 inline" />{formatTime(selectedTime)} held for you</span><span className="font-bold tabular-nums">{Math.floor(holdSeconds / 60)}:{String(holdSeconds % 60).padStart(2, "0")}</span></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold sm:col-span-2">Full name<input aria-label="Booking full name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="mt-2 h-12 w-full rounded-lg border border-[var(--input)] bg-card px-3.5 text-sm" /></label><label className="text-sm font-semibold">Mobile number<input aria-label="Booking mobile number" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} placeholder="09xx xxx xxxx" className="mt-2 h-12 w-full rounded-lg border border-[var(--input)] bg-card px-3.5 text-sm" /></label><label className="text-sm font-semibold">Email <span className="font-normal text-[var(--muted-foreground)]">optional</span><input aria-label="Booking email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 h-12 w-full rounded-lg border border-[var(--input)] bg-card px-3.5 text-sm" /></label><label className="text-sm font-semibold">Occasion <span className="font-normal text-[var(--muted-foreground)]">optional</span><input aria-label="Booking occasion" value={form.occasion} onChange={(event) => setForm({ ...form, occasion: event.target.value })} className="mt-2 h-12 w-full rounded-lg border border-[var(--input)] bg-card px-3.5 text-sm" /></label><label className="text-sm font-semibold sm:col-span-2">Special request <span className="font-normal text-[var(--muted-foreground)]">optional</span><textarea aria-label="Booking special request" rows={3} value={form.specialRequests} onChange={(event) => setForm({ ...form, specialRequests: event.target.value })} className="mt-2 w-full rounded-lg border border-[var(--input)] bg-card p-3.5 text-sm" /></label></div><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] bg-card p-4 text-xs leading-5 text-[var(--muted-foreground)]"><input aria-label="Accept live reservation terms" type="checkbox" checked={form.termsAccepted} onChange={(event) => setForm({ ...form, termsAccepted: event.target.checked })} className="mt-1 h-4 w-4 accent-[var(--primary)]" /><span>I accept the reservation terms and privacy notice. Waterfront will use my details to manage this booking.</span></label>{error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button onClick={() => { setStep(1); setHold(null); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[var(--input)] bg-card px-5 text-sm font-bold text-[var(--secondary-foreground)]"><ArrowLeft size={16} />Choose another time</button><button onClick={() => void submit()} disabled={loading || !form.fullName.trim() || !form.mobile.trim() || !form.termsAccepted || holdSeconds <= 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-5 text-sm font-bold text-white disabled:opacity-40">{loading ? "Confirming…" : "Confirm reservation"}<CheckCircle2 size={16} /></button></div></div>}</section><aside className="space-y-4 lg:sticky lg:top-6 lg:self-start"><div className="rounded-2xl bg-[var(--primary-strong)] p-6 text-white"><Users size={22} className="text-[var(--accent)]" /><h2 className="mt-4 font-display text-2xl">Your time, protected.</h2><p className="mt-3 text-xs leading-5 text-white/70">The engine checks actual tables and approved combinations. It never exposes table IDs or other guest details.</p><div className="mt-5 space-y-3 border-t border-white/10 pt-5 text-xs"><div className="flex gap-3"><Clock3 size={16} className="shrink-0 text-[var(--accent)]" />Live slots use Asia/Manila time</div><div className="flex gap-3"><LockKeyhole size={16} className="shrink-0 text-[var(--accent)]" />Your selected inventory is held briefly</div><div className="flex gap-3"><ShieldCheck size={16} className="shrink-0 text-[var(--accent)]" />Secure manage link after confirmation</div></div></div><p className="rounded-lg border border-amber-200 bg-[var(--status-warning-soft)] p-4 text-xs leading-5 text-[var(--status-warning)]">Large parties, VIP rooms, and private events should use the <Link href="/reserve/waterfront-seafood" className="font-bold underline">request flow</Link> for staff review.</p></aside></main></PublicShell>;
}
