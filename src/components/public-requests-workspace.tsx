"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Copy, Filter, Inbox, Mail, MessageSquare, RefreshCw, Search, Send, ShieldCheck, UserCheck, Users, X } from "lucide-react";
import type { Reservation } from "@/lib/domain";
import { requestAge, requestTypeLabel, type PublicRequestRecord, type PublicRequestStatus } from "@/lib/public-booking";
import { Button, PageHeader } from "@/components/ui/baseline";
import { StatusBadge } from "@/components/ui/status-badge";

type Props = { onConverted: (reservation: Reservation) => void; notify: (message: string) => void };
type StaffAction = "start_review" | "request_information" | "propose_alternative" | "decline" | "mark_duplicate" | "convert" | "assign";

function maskedContact(request: PublicRequestRecord) {
  return `${request.mobileNormalized.slice(0, 5)}•••${request.mobileNormalized.slice(-3)}`;
}

function StatusPill({ status }: { status: PublicRequestStatus }) {
  return <StatusBadge status={status} />;
}

export function PublicRequestsWorkspace({ onConverted, notify }: Props) {
  const [requests, setRequests] = useState<PublicRequestRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [type, setType] = useState("all");
  const [message, setMessage] = useState("");
  const [alternative, setAlternative] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function refresh() {
    const response = await fetch("/api/staff/public-requests", { cache: "no-store" });
    const payload = await response.json();
    setRequests(payload.requests ?? []);
    setSelectedId((current) => current ?? payload.requests?.[0]?.id ?? null);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/staff/public-requests", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        setRequests(payload.requests ?? []);
        setSelectedId(payload.requests?.[0]?.id ?? null);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => requests.filter((request) => {
    const terminal = ["approved_converted", "declined", "withdrawn_by_guest", "closed_duplicate", "expired_unresolved"].includes(request.status);
    const matchesStatus = status === "all" || (status === "active" ? !terminal : request.status === status);
    const matchesType = type === "all" || request.requestType === type;
    const haystack = `${request.reference} ${request.fullName} ${request.mobileNormalized}`.toLowerCase();
    return matchesStatus && matchesType && haystack.includes(search.toLowerCase());
  }), [requests, search, status, type]);
  const selected = requests.find((request) => request.id === selectedId) ?? filtered[0] ?? null;
  const unread = requests.filter((request) => request.status === "submitted").length;
  const overdue = requests.filter((request) => !request.firstReviewedAt && /[hd]$/.test(requestAge(request.submittedAt))).length;
  const conversions = requests.filter((request) => request.status === "approved_converted").length;

  async function perform(action: StaffAction, details?: Record<string, string>) {
    if (!selected) return;
    setBusy(true); setActionError("");
    try {
      const response = await fetch("/api/staff/public-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: selected.id, action, details }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action could not be completed.");
      if (payload.reservation) onConverted(payload.reservation);
      await refresh();
      setMessage(""); setAlternative("");
      notify(action === "convert" ? `${payload.reservation.code} created after a fresh conflict check.` : `Request ${selected.reference} updated.`);
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Action could not be completed."); }
    finally { setBusy(false); }
  }

  return <div className="animate-rise">
    <PageHeader eyebrow="Website intake" title="Public Requests" description="Triage guest requests, recheck live availability, and convert approved requests without letting public traffic block inventory."><a href="/reserve/waterfront-seafood" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary">Preview guest flow <ArrowRight size={15} /></a><Button onClick={() => refresh()}><RefreshCw size={15} />Refresh</Button></PageHeader>
    <div className="grid gap-4 px-5 pt-5 md:grid-cols-3 md:px-8"><QueueMetric icon={<Inbox size={17} />} label="New / unread" value={String(unread)} note="Needs staff review" accent /><QueueMetric icon={<Clock3 size={17} />} label="Overdue response" value={String(overdue)} note="Over 60 minutes" /><QueueMetric icon={<CheckCircle2 size={17} />} label="Converted" value={String(conversions)} note="Real reservations created" /></div>
    <div className="px-5 py-5 md:px-8"><div className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-soft xl:grid xl:min-h-[610px] xl:grid-cols-[420px_1fr]">
      <section className="border-b border-[var(--border)] xl:border-b-0 xl:border-r"><div className="border-b border-[#e7e9e5] p-4"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-[var(--muted-foreground)]" /><input aria-label="Search public requests" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guest or reference" className="h-10 w-full rounded-lg border border-[var(--input)] bg-[var(--background)] pl-9 pr-3 text-sm" /></div><div className="mt-3 grid grid-cols-2 gap-2"><label className="relative"><Filter size={13} className="absolute left-2.5 top-3 text-[var(--muted-foreground)]" /><select aria-label="Request status filter" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 w-full rounded-lg border border-[var(--input)] bg-card pl-8 text-xs"><option value="active">Active requests</option><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="all">All statuses</option></select></label><select aria-label="Request type filter" value={type} onChange={(event) => setType(event.target.value)} className="h-9 rounded-lg border border-[var(--input)] bg-card px-2 text-xs"><option value="all">All request types</option><option value="main_dining">Main Dining</option><option value="vip_room">VIP Room</option><option value="private_event">Private event</option></select></div></div>
        <div className="max-h-[540px] overflow-y-auto scrollbar-thin">{loading ? <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading requests…</div> : filtered.length === 0 ? <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">No requests match these filters.</div> : filtered.map((request) => <button key={request.id} onClick={() => { setSelectedId(request.id); setActionError(""); }} className={`block w-full border-b border-[var(--border)] p-4 text-left transition ${selected?.id === request.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--background)]"}`}><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[.09em] text-[var(--accent-strong)]">{request.reference}</span>{request.likelyDuplicate && <span title="Likely duplicate" className="rounded bg-rose-50 p-1 text-rose-700"><Copy size={12} /></span>}</div><div className="mt-1.5 text-sm font-bold text-[var(--foreground)]">{request.fullName}</div></div><span className="text-[10px] font-bold text-[var(--muted-foreground)]">{requestAge(request.submittedAt)}</span></div><div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]"><span>{requestTypeLabel(request.requestType)}</span><span>·</span><span>{request.guestCount} guests</span><span>·</span><span>{request.date}</span></div><div className="mt-3 flex items-center justify-between"><StatusPill status={request.status} /><ChevronRight size={15} className="text-[var(--muted-foreground)]" /></div></button>)}</div>
      </section>
      {selected ? <section className="min-w-0"><div className="flex items-start justify-between border-b border-[var(--border)] p-5 md:p-6"><div><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--accent-strong)]">{selected.reference}</span><StatusPill status={selected.status} /></div><h2 className="mt-2 font-display text-3xl text-[var(--foreground)]">{selected.fullName}</h2><div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]"><span>{maskedContact(selected)}</span>{selected.email && <><span>·</span><span>{selected.email}</span></>}</div></div><button aria-label="Close request detail" onClick={() => setSelectedId(null)} className="rounded-lg p-2 text-[var(--muted-foreground)] xl:hidden"><X size={17} /></button></div>
        <div className="max-h-[540px] overflow-y-auto p-5 scrollbar-thin md:p-6"><div className="grid gap-3 sm:grid-cols-4"><RequestDetail icon={<CalendarDays size={15} />} label="Requested" value={`${selected.date} · ${selected.time}`} /><RequestDetail icon={<Users size={15} />} label="Party" value={`${selected.guestCount} guests`} /><RequestDetail icon={<CircleDollarSign size={15} />} label="Deposit" value={selected.depositExpected ? "Expected" : "Not triggered"} /><RequestDetail icon={<UserCheck size={15} />} label="Owner" value={selected.assignedOwner ?? "Unassigned"} /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className={`rounded-lg border p-4 ${selected.availabilitySnapshot === "unavailable" ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}><div className="text-[9px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">At submission</div><div className="mt-1 text-sm font-bold capitalize">{selected.availabilitySnapshot.replaceAll("_", " ")}</div></div><div className={`rounded-lg border p-4 ${selected.currentAvailability === "unavailable" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}><div className="text-[9px] font-bold uppercase tracking-[.1em] opacity-70">Current availability</div><div className="mt-1 text-sm font-bold capitalize">{selected.currentAvailability.replaceAll("_", " ")}</div></div></div>
          {selected.likelyDuplicate && <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs leading-5 text-rose-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span><b>Likely duplicate:</b> normalized contact and schedule resemble an existing request or guest. Review before conversion.</span></div>}
          <div className="mt-5 grid gap-4 md:grid-cols-2"><div><h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Guest request</h3><div className="mt-2 rounded-lg bg-[var(--secondary)] p-4 text-xs leading-6 text-[var(--muted-foreground)]"><div><b>Type:</b> {requestTypeLabel(selected.requestType)}</div>{selected.occasion && <div><b>Occasion:</b> {selected.occasion}</div>}{selected.company && <div><b>Company:</b> {selected.company}</div>}{selected.seatingPreference && <div><b>Preference:</b> {selected.seatingPreference} (not guaranteed)</div>}{selected.specialRequest && <div className="mt-2 border-t border-[var(--border)] pt-2">“{selected.specialRequest}”</div>}</div></div><div><h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Consent & provenance</h3><div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] p-4 text-xs text-[var(--muted-foreground)]"><div className="flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-700" />Terms {selected.termsVersion} accepted</div><div className="flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-700" />Privacy {selected.privacyVersion} accepted</div><div className="flex items-center gap-2"><Mail size={14} />Source: Website</div></div></div></div>
          {selected.proposedAlternative && <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900"><b>Proposed alternative:</b> {selected.proposedAlternative}</div>}
          {selected.linkedReservationCode && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Linked reservation: {selected.linkedReservationCode}</div>}
          {!["approved_converted", "declined", "withdrawn_by_guest", "closed_duplicate", "expired_unresolved"].includes(selected.status) && <div className="mt-6 border-t border-[#e5e8e3] pt-5"><h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted-foreground)]">Next action</h3>{selected.status === "submitted" ? <div className="mt-3 flex flex-wrap gap-2"><ActionButton onClick={() => perform("start_review")} disabled={busy}><UserCheck size={14} />Start review & assign to me</ActionButton><ActionButton secondary onClick={() => perform("mark_duplicate", { reason: "Duplicate request" })} disabled={busy}>Mark duplicate</ActionButton></div> : <><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]"><textarea aria-label="Guest-facing message" value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="Guest-facing message (never internal conflict details)…" className="rounded-lg border border-[var(--input)] p-3 text-sm" /><div className="space-y-2"><input aria-label="Alternative schedule" value={alternative} onChange={(event) => setAlternative(event.target.value)} placeholder="e.g. Aug 9 at 8:30 PM" className="h-10 w-full rounded-lg border border-[var(--input)] px-3 text-xs" /><ActionButton secondary disabled={busy} onClick={() => perform("propose_alternative", { message, alternative })}><Send size={13} />Propose alternative</ActionButton></div></div><div className="mt-3 flex flex-wrap gap-2"><ActionButton secondary disabled={busy} onClick={() => perform("request_information", { message })}><MessageSquare size={14} />Request information</ActionButton><ActionButton secondary disabled={busy} onClick={() => perform("decline", { reason: "No availability", message })}>Decline</ActionButton><ActionButton disabled={busy || selected.currentAvailability === "unavailable"} onClick={() => perform("convert")}><Check size={14} />Recheck & convert</ActionButton></div>{selected.currentAvailability === "unavailable" && <p className="mt-3 text-xs font-semibold text-rose-700">Conversion is blocked because current availability changed. Preserve the request and propose an alternative.</p>}</>}</div>}
          {actionError && <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{actionError}</div>}
        </div>
      </section> : <div className="hidden items-center justify-center text-sm text-[var(--muted-foreground)] xl:flex">Select a request to review it.</div>}
    </div></div>
  </div>;
}

function QueueMetric({ icon, label, value, note, accent }: { icon: ReactNode; label: string; value: string; note: string; accent?: boolean }) {
  return <div className={`rounded-lg border p-4 ${accent ? "border-[var(--primary-strong)] bg-[var(--primary-strong)] text-white" : "border-[var(--border)] bg-card"}`}><div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.1em] ${accent ? "text-white/55" : "text-[var(--muted-foreground)]"}`}>{icon}{label}</div><div className="mt-2 font-display text-3xl font-bold">{value}</div><div className={`mt-1 text-[10px] ${accent ? "text-white/55" : "text-[var(--muted-foreground)]"}`}>{note}</div></div>;
}

function RequestDetail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-card p-3"><div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]">{icon}{label}</div><div className="mt-1.5 truncate text-xs font-semibold text-[var(--secondary-foreground)]">{value}</div></div>;
}

function ActionButton({ children, onClick, disabled, secondary }: { children: ReactNode; onClick: () => void; disabled?: boolean; secondary?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${secondary ? "border border-border bg-card text-foreground hover:bg-secondary" : "border border-transparent bg-primary text-primary-foreground hover:bg-primary-strong"}`}>{children}</button>;
}
