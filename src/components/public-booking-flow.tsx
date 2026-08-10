"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Check, CheckCircle2, Clock3, Copy, Info, LockKeyhole, Mail, ShieldCheck, Sparkles, Users } from "lucide-react";
import { generatePublicSlots, previewPublicPolicy, publicAvailabilityFor, requestTypeLabel, type PublicAvailability, type PublicRequestInput, type PublicRequestRecord, type PublicRequestType } from "@/lib/public-booking";

const policy = previewPublicPolicy;
const notice = "Your request is not confirmed until Waterfront staff approves it and sends confirmation.";

const choices: Array<{ type: PublicRequestType; title: string; summary: string; meta: string; icon: typeof Users }> = [
  { type: "main_dining", title: "Main Dining", summary: "For relaxed lunches, dinners, and celebrations in our dining room.", meta: "1–60 guests · usually 2 hours", icon: Users },
  { type: "vip_room", title: "VIP Room", summary: "A private space for meetings, family occasions, and intimate events.", meta: "Up to 24 guests · 4-hour minimum · deposit", icon: LockKeyhole },
  { type: "private_event", title: "Private Event", summary: "A whole-restaurant inquiry for larger celebrations and corporate events.", meta: "Custom schedule · event review · deposit", icon: Building2 },
];

function tomorrowInManila() {
  const tomorrow = new Date(Date.now() + 86_400_000);
  return tomorrow.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function PublicShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[var(--background)] text-foreground">
    <header className="border-b border-[var(--border)] bg-[var(--card)]/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/reserve/waterfront-seafood" aria-label="Waterfront booking requests"><Image src="/waterfront-logo.png" width={172} height={108} alt="Waterfront Seafood & Cocktails" className="h-auto w-[138px] sm:w-[158px]" priority /></Link>
        <div className="text-right"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--accent-strong)]">Staff preview</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Asia/Manila · English</div></div>
      </div>
    </header>
    {children}
    <footer className="border-t border-[var(--border)] bg-[var(--card)] px-5 py-7 text-center text-xs leading-5 text-[var(--muted-foreground)]">Waterfront Seafood & Cocktails · One Riverside Complex, Gen. Luna St., Iloilo City<br />Public policy values shown here are development placeholders pending management approval.</footer>
  </div>;
}

function Progress({ step }: { step: number }) {
  const labels = ["Experience", "Schedule", "Your details", "Review"];
  return <div aria-label={`Step ${step} of 4`} className="mb-8">
    <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted-foreground)]"><span>Step {step} of 4</span><span>{labels[step - 1]}</span></div>
    <div className="flex gap-2">{labels.map((label, index) => <span key={label} className={`h-1.5 flex-1 rounded-full ${index < step ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />)}</div>
  </div>;
}

function Disclaimer() {
  return <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-[var(--status-warning-soft)] p-4 text-xs leading-5 text-[var(--status-warning)]"><Info className="mt-0.5 shrink-0" size={17} /><strong>{notice}</strong></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-[var(--secondary-foreground)]">{label}{hint && <span className="ml-1 font-normal text-[var(--muted-foreground)]">{hint}</span>}<div className="mt-2 [&_input]:h-12 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[var(--input)] [&_input]:bg-card [&_input]:px-3.5 [&_input]:text-sm [&_select]:h-12 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-[var(--input)] [&_select]:bg-card [&_select]:px-3.5 [&_select]:text-sm">{children}</div></label>;
}

function PrimaryButton({ children, onClick, disabled, type = "button", secondary }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; secondary?: boolean }) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${secondary ? "border border-[var(--input)] bg-card text-[var(--secondary-foreground)] hover:border-[var(--primary)]" : "bg-[var(--primary)] text-white shadow-sm hover:bg-[var(--primary-strong)]"}`}>{children}</button>;
}

export function PublicBookingFlow() {
  const [startedAt, setStartedAt] = useState(0);
  const [step, setStep] = useState(1);
  const [requestType, setRequestType] = useState<PublicRequestType | null>(null);
  const [date, setDate] = useState(tomorrowInManila);
  const [time, setTime] = useState("18:00");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [guestCount, setGuestCount] = useState(2);
  const [availability, setAvailability] = useState<PublicAvailability | null>(null);
  const [form, setForm] = useState({ fullName: "", mobile: "", email: "", company: "", occasion: "", seatingPreference: "", specialRequest: "", termsAccepted: false, marketingConsent: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<{ request: PublicRequestRecord; token: string } | null>(null);
  const slots = useMemo(() => generatePublicSlots(date, policy), [date]);

  function selectType(type: PublicRequestType, interactionTimestamp: number) {
    if (!startedAt) setStartedAt(Math.max(1, Math.round(interactionTimestamp)));
    setRequestType(type);
    setDurationMinutes(type === "vip_room" ? 240 : type === "private_event" ? 300 : 120);
    setGuestCount(type === "private_event" ? 50 : 2);
    setAvailability(null);
  }

  function checkSchedule() {
    if (!requestType) return;
    const result = publicAvailabilityFor({ requestType, date, time, guestCount, durationMinutes });
    setAvailability(result);
    if (result.state !== "unavailable") setStep(3);
  }

  const requestInput: PublicRequestInput | null = requestType ? {
    requestType, date, time, durationMinutes, guestCount, ...form, termsAccepted: form.termsAccepted,
    startedAt, website: "",
  } : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!requestInput || !form.termsAccepted) return;
    setSubmitting(true); setError("");
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/public/requests", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(requestInput) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request could not be submitted.");
      setSubmitted(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request could not be submitted.");
    } finally { setSubmitting(false); }
  }

  if (submitted) {
    const manageUrl = `/reserve/manage/${submitted.token}`;
    return <PublicShell><main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="rounded-lg border border-[var(--border)] bg-card p-6 shadow-soft sm:p-10">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={28} /></div>
        <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[var(--accent-strong)]">Request received</div>
        <h1 className="mt-3 font-display text-4xl leading-tight text-[var(--foreground)]">Thank you, {submitted.request.fullName.split(" ")[0]}.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">Our reservations team will review your request and contact you using the details provided. Availability will be checked again before any reservation is created.</p>
        <div className="my-7 rounded-lg bg-[var(--primary-strong)] p-5 text-white sm:flex sm:items-center sm:justify-between">
          <div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-white/55">Request reference</div><div className="mt-1 font-display text-3xl">{submitted.request.reference}</div></div>
          <button onClick={() => navigator.clipboard?.writeText(submitted.request.reference)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-card/10 px-3 py-2 text-xs font-semibold sm:mt-0"><Copy size={14} />Copy</button>
        </div>
        <Disclaimer />
        <div className="mt-7 grid gap-3 sm:grid-cols-2"><Link href={manageUrl} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-5 text-sm font-bold text-white">View request status <ArrowRight size={16} /></Link><button onClick={() => window.print()} className="min-h-12 rounded-lg border border-[var(--input)] bg-card px-5 text-sm font-bold text-[var(--secondary-foreground)]">Print details</button></div>
        {submitted.request.email ? <p className="mt-5 flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><Mail size={15} />A local-preview acknowledgement was prepared for {submitted.request.email}. External email sending remains disabled.</p> : null}
      </div>
    </main></PublicShell>;
  }

  return <PublicShell><main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[1fr_340px]">
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-soft sm:p-8">
      <Progress step={step} />
      {step === 1 && <div className="animate-rise"><div className="mb-7"><div className="text-[11px] font-bold uppercase tracking-[.16em] text-[var(--accent-strong)]">Plan your Waterfront visit</div><h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">What are you celebrating?</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">Choose the experience that fits your group. You’ll send a request for our team to review—no account needed.</p></div>
        <div className="grid gap-3">{choices.map((choice) => <button key={choice.type} onClick={(event) => selectType(choice.type, event.timeStamp)} aria-pressed={requestType === choice.type} className={`group flex min-h-32 items-start gap-4 rounded-lg border p-5 text-left transition ${requestType === choice.type ? "border-[var(--primary)] bg-[var(--accent-soft)] shadow-sm" : "border-[var(--border)] bg-card hover:border-[var(--accent)]"}`}><span className={`rounded-lg p-3 ${requestType === choice.type ? "bg-[var(--primary)] text-white" : "bg-[var(--primary-soft)] text-[var(--primary)]"}`}><choice.icon size={22} /></span><span className="flex-1"><span className="block font-display text-xl font-bold">{choice.title}</span><span className="mt-1 block text-sm leading-5 text-[var(--muted-foreground)]">{choice.summary}</span><span className="mt-3 block text-[10px] font-bold uppercase tracking-[.1em] text-[var(--accent-strong)]">{choice.meta}</span></span>{requestType === choice.type && <Check size={19} className="text-[var(--accent-strong)]" />}</button>)}</div>
        <div className="mt-7 flex justify-end"><PrimaryButton disabled={!requestType} onClick={() => setStep(2)}>Choose schedule <ArrowRight size={16} /></PrimaryButton></div>
      </div>}

      {step === 2 && requestType && <div className="animate-rise"><div className="mb-7"><div className="text-[11px] font-bold uppercase tracking-[.16em] text-[var(--accent-strong)]">{requestTypeLabel(requestType)}</div><h1 className="mt-3 font-display text-4xl">Choose a preferred schedule</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Times are indicative and shown in Philippine time. Staff will recheck availability before approval.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Preferred date"><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setAvailability(null); }} /></Field><Field label="Preferred time"><select value={time} onChange={(event) => setTime(event.target.value)}>{slots.length ? slots.map((slot) => <option key={slot} value={slot}>{new Date(`2000-01-01T${slot}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</option>) : <option value={time}>No public slots</option>}</select></Field><Field label="Party size"><input aria-label="Party size" type="number" min="1" max={requestType === "vip_room" ? 24 : requestType === "main_dining" ? 60 : 300} value={guestCount} onChange={(event) => setGuestCount(Number(event.target.value))} /></Field><Field label="Duration"><select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} disabled={requestType === "vip_room"}>{requestType === "main_dining" && <><option value="120">2 hours</option><option value="150">2.5 hours</option><option value="180">3 hours</option></>}{requestType === "vip_room" && <option value="240">4 hours minimum</option>}{requestType === "private_event" && <><option value="240">4 hours</option><option value="300">5 hours</option><option value="360">6 hours</option></>}</select></Field></div>
        {requestType !== "main_dining" && <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-4 text-xs leading-5 text-[var(--muted-foreground)]"><ShieldCheck size={16} className="mr-2 inline text-[var(--primary)]" />{requestType === "vip_room" ? "VIP Room requests require staff approval, a four-hour minimum, and a deposit after approval." : "Private-event inquiries do not create a restaurant closure or promise pricing, packages, or availability."}</div>}
        {availability && <div role="status" className={`mt-5 rounded-lg border p-4 text-sm ${availability.state === "unavailable" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{availability.message}</div>}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><PrimaryButton secondary onClick={() => setStep(1)}><ArrowLeft size={16} />Back</PrimaryButton><PrimaryButton onClick={checkSchedule}>Continue with this time <ArrowRight size={16} /></PrimaryButton></div>
      </div>}

      {step === 3 && requestType && <div className="animate-rise"><div className="mb-7"><div className="text-[11px] font-bold uppercase tracking-[.16em] text-[var(--accent-strong)]">Contact details</div><h1 className="mt-3 font-display text-4xl">How should we reach you?</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">We only use these details to handle this request. A permanent guest profile is not created unless staff converts it.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Full name"><input aria-label="Full name" required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" /></Field></div><Field label="Mobile number"><input aria-label="Mobile number" required placeholder="09xx xxx xxxx" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} inputMode="tel" autoComplete="tel" /></Field><Field label="Email" hint="optional"><input aria-label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value, marketingConsent: event.target.value.trim() ? form.marketingConsent : false })} autoComplete="email" /></Field>{requestType === "private_event" && <Field label="Company" hint="optional"><input aria-label="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></Field>}<Field label="Occasion" hint="optional"><input aria-label="Occasion" value={form.occasion} onChange={(event) => setForm({ ...form, occasion: event.target.value })} /></Field>{requestType === "main_dining" && <Field label="Seating preference" hint="not guaranteed"><select aria-label="Seating preference" value={form.seatingPreference} onChange={(event) => setForm({ ...form, seatingPreference: event.target.value })}><option value="">No preference</option><option>Window if available</option><option>Quiet area</option><option>Accessible seating</option></select></Field>}<div className="sm:col-span-2"><Field label="Dietary, accessibility, or special request" hint="optional"><textarea aria-label="Special request" maxLength={500} rows={4} value={form.specialRequest} onChange={(event) => setForm({ ...form, specialRequest: event.target.value })} className="w-full rounded-lg border border-[var(--input)] bg-card p-3.5 text-sm" /></Field></div></div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><PrimaryButton secondary onClick={() => setStep(2)}><ArrowLeft size={16} />Back</PrimaryButton><PrimaryButton disabled={!form.fullName.trim() || !form.mobile.trim()} onClick={() => setStep(4)}>Review request <ArrowRight size={16} /></PrimaryButton></div>
      </div>}

      {step === 4 && requestInput && <form onSubmit={submit} className="animate-rise"><div className="mb-7"><div className="text-[11px] font-bold uppercase tracking-[.16em] text-[var(--accent-strong)]">Review before sending</div><h1 className="mt-3 font-display text-4xl">Does everything look right?</h1></div>
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-card"><div className="grid gap-px bg-[var(--border)] sm:grid-cols-2">{[["Experience", requestTypeLabel(requestInput.requestType)], ["Preferred schedule", `${requestInput.date} · ${requestInput.time}`], ["Party", `${requestInput.guestCount} guests · ${requestInput.durationMinutes / 60} hours`], ["Guest", requestInput.fullName], ["Mobile", requestInput.mobile], ["Deposit expectation", availability?.depositExpected ? "Required after staff approval" : "No current trigger"]].map(([label, value]) => <div key={label} className="bg-card p-4"><div className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">{label}</div><div className="mt-1.5 text-sm font-semibold text-[var(--secondary-foreground)]">{value}</div></div>)}</div></div>
        <div className="mt-5"><Disclaimer /></div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] bg-card p-4 text-xs leading-5 text-[var(--muted-foreground)]"><input aria-label="Accept reservation terms and privacy notice" type="checkbox" checked={form.termsAccepted} onChange={(event) => setForm({ ...form, termsAccepted: event.target.checked })} className="mt-1 h-4 w-4 accent-[var(--primary)]" /><span>I accept the reservation terms and privacy notice (preview versions {policy.termsVersion} / {policy.privacyVersion}) and understand Waterfront may contact me operationally about this request.</span></label>
        <label className="mt-3 flex cursor-pointer items-start gap-3 px-4 text-xs leading-5 text-[var(--muted-foreground)]"><input aria-label="Email marketing consent" type="checkbox" disabled={!form.email.trim()} checked={form.marketingConsent} onChange={(event) => setForm({ ...form, marketingConsent: event.target.checked })} className="mt-1 h-4 w-4 accent-[var(--primary)] disabled:opacity-40" /><span>Optional: I agree to receive occasional email news and offers from Waterfront Seafood & Cocktails in Iloilo. This is not required to submit, does not authorize WhatsApp marketing, and can be withdrawn at any time.{!form.email.trim() ? " Add an email address to make this choice." : ""}</span></label>
        {error && <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><PrimaryButton secondary onClick={() => setStep(3)}><ArrowLeft size={16} />Back</PrimaryButton><PrimaryButton type="submit" disabled={!form.termsAccepted || submitting}>{submitting ? "Sending request…" : "Submit request"}<Check size={16} /></PrimaryButton></div>
      </form>}
    </section>

    <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start"><div className="rounded-lg bg-[var(--primary-strong)] p-6 text-white"><Sparkles size={22} className="text-[var(--accent)]" /><h2 className="mt-4 font-display text-2xl">A request, thoughtfully reviewed.</h2><p className="mt-3 text-xs leading-5 text-white/70">Our team checks the latest availability, seating needs, and deposit policies before creating a reservation.</p><div className="mt-5 space-y-3 border-t border-white/10 pt-5 text-xs"><div className="flex gap-3"><CalendarDays size={16} className="shrink-0 text-[var(--accent)]" />Indicative availability, never private booking details</div><div className="flex gap-3"><Clock3 size={16} className="shrink-0 text-[var(--accent)]" />Preferred times shown in Asia/Manila</div><div className="flex gap-3"><ShieldCheck size={16} className="shrink-0 text-[var(--accent)]" />Secure manage link—no account or password</div></div></div><Disclaimer /></aside>
  </main></PublicShell>;
}

export { PublicShell, notice };
