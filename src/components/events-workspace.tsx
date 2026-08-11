"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Check, ChevronRight, CircleDollarSign, Clock3, Download, FileText, Filter, Inbox, MapPin, Paperclip, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Upload, Users, X } from "lucide-react";
import { eventPipelineStages, eventStageLabels, stageProgress, type EventStage } from "@/lib/event-domain";
import { PageHeader, SectionCard, Button, cx } from "@/components/ui/baseline";
import type { AccessContext } from "@/lib/access-control";

type Inquiry = {
  id: string;
  venue_id: string;
  contact_name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  event_name?: string | null;
  source: string;
  requested_starts_at: string;
  requested_ends_at: string;
  expected_guests: number;
  budget?: number | null;
  currency: string;
  stage: EventStage;
  next_action_at?: string | null;
  estimated_value: number;
  probability: number;
  converted_event_id?: string | null;
  created_at: string;
};

type EventRecord = {
  id: string;
  inquiry_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  expected_headcount: number;
  status: EventStage;
  quoted_total: number;
  balance_due: number;
};

type EventDocumentView = {
  id: string;
  event_id: string;
  file_name: string;
  document_type: string;
  scan_status: string;
  visibility: string;
  source_type?: string | null;
  byte_size?: number | null;
  document_version?: number | null;
  created_at: string;
  signed_url?: string | null;
};

type Hold = { id: string; inquiry_id?: string | null; event_id?: string | null; starts_at: string; ends_at: string; expires_at: string; state: string; priority: number };
type Space = { id: string; code: string; name: string; location?: string | null; min_capacity: number; max_capacity: number; features: string[]; available?: boolean };

const demoInquiries: Inquiry[] = [
  { id: "inq-001", venue_id: "demo", contact_name: "Maya Santos", contact_email: "maya@northstar.ph", event_name: "Northstar leadership dinner", source: "Website", requested_starts_at: "2026-08-22T10:00:00+08:00", requested_ends_at: "2026-08-22T14:00:00+08:00", expected_guests: 36, budget: 90000, currency: "PHP", stage: "new_inquiry", next_action_at: "2026-08-12T09:00:00+08:00", estimated_value: 90000, probability: 20, created_at: "2026-08-11T01:00:00Z" },
  { id: "inq-002", venue_id: "demo", contact_name: "Carlos Dela Cruz", contact_email: "carlos@islandworks.ph", event_name: "Island Works year-end celebration", source: "Partner", requested_starts_at: "2026-09-04T09:00:00+08:00", requested_ends_at: "2026-09-04T15:00:00+08:00", expected_guests: 80, budget: 180000, currency: "PHP", stage: "qualified", next_action_at: "2026-08-13T06:30:00+08:00", estimated_value: 180000, probability: 35, created_at: "2026-08-10T03:00:00Z" },
  { id: "inq-003", venue_id: "demo", contact_name: "Lea Villanueva", contact_email: "lea@example.com", event_name: "Lea & Tomas engagement", source: "Instagram", requested_starts_at: "2026-08-29T08:00:00+08:00", requested_ends_at: "2026-08-29T13:00:00+08:00", expected_guests: 48, budget: 120000, currency: "PHP", stage: "pencil_booking", next_action_at: "2026-08-12T03:00:00+08:00", estimated_value: 120000, probability: 60, created_at: "2026-08-09T01:00:00Z" },
  { id: "inq-004", venue_id: "demo", contact_name: "Armand Lim", contact_email: "armand@coastline.com", event_name: "Coastline client reception", source: "Email", requested_starts_at: "2026-08-18T10:00:00+08:00", requested_ends_at: "2026-08-18T14:00:00+08:00", expected_guests: 24, budget: 65000, currency: "PHP", stage: "proposal_sent", next_action_at: "2026-08-14T08:00:00+08:00", estimated_value: 65000, probability: 70, created_at: "2026-08-07T03:00:00Z" },
  { id: "inq-005", venue_id: "demo", contact_name: "Priya Menon", contact_email: "priya@harbourgroup.com", event_name: "Harbour Group planning offsite", source: "Phone", requested_starts_at: "2026-08-25T09:00:00+08:00", requested_ends_at: "2026-08-25T17:00:00+08:00", expected_guests: 100, budget: 250000, currency: "PHP", stage: "deposit_pending", next_action_at: "2026-08-12T10:00:00+08:00", estimated_value: 250000, probability: 85, created_at: "2026-08-05T03:00:00Z" },
  { id: "inq-006", venue_id: "demo", contact_name: "Jon Bell", contact_email: "jon@blueharbor.ph", event_name: "Blue Harbor anniversary", source: "Facebook", requested_starts_at: "2026-08-16T11:00:00+08:00", requested_ends_at: "2026-08-16T15:00:00+08:00", expected_guests: 32, budget: 78000, currency: "PHP", stage: "planning", next_action_at: "2026-08-13T03:00:00+08:00", estimated_value: 78000, probability: 100, converted_event_id: "evt-006", created_at: "2026-08-01T03:00:00Z" },
];

const demoEvents: EventRecord[] = [{ id: "evt-006", inquiry_id: "inq-006", name: "Blue Harbor anniversary", starts_at: "2026-08-16T11:00:00+08:00", ends_at: "2026-08-16T15:00:00+08:00", expected_headcount: 32, status: "planning", quoted_total: 78000, balance_due: 78000 }];

function nowMs() { return Date.now(); }

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(new Date(value));
}

function formatMoney(value: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);
}

function stageTone(stage: EventStage) {
  if (["confirmed", "planning", "event_day"].includes(stage)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["deposit_pending", "pencil_booking", "proposal_sent", "negotiation"].includes(stage)) return "border-amber-200 bg-amber-50 text-amber-800";
  if (["lost", "cancelled"].includes(stage)) return "border-red-200 bg-red-50 text-red-800";
  return "border-border bg-secondary text-muted-foreground";
}

function toManilaIso(date: string, time: string) {
  return `${date}T${time}:00+08:00`;
}

export function EventsWorkspace({ accessContext, venueId, notify }: { accessContext: AccessContext; venueId: string; notify: (message: string) => void }) {
  const [inquiries, setInquiries] = useState<Inquiry[]>(accessContext.isDemo ? demoInquiries : []);
  const [events, setEvents] = useState<EventRecord[]>(accessContext.isDemo ? demoEvents : []);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [view, setView] = useState<"pipeline" | "calendar">("pipeline");
  const [stageFilter, setStageFilter] = useState<"all" | EventStage>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(!accessContext.isDemo);
  const [now] = useState(() => nowMs());

  const refresh = useCallback(async () => {
    if (accessContext.isDemo) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/staff/events?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Event data is unavailable.");
      setInquiries(data.inquiries ?? []);
      setEvents(data.events ?? []);
      setHolds(data.holds ?? []);
      setSpaces(data.spaces ?? []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Event data is unavailable.");
    } finally { setLoading(false); }
  }, [accessContext.isDemo, notify, venueId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const visibleInquiries = useMemo(() => inquiries.filter((inquiry) => {
    const matchesStage = stageFilter === "all" || inquiry.stage === stageFilter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [inquiry.contact_name, inquiry.event_name, inquiry.source].some((value) => value?.toLowerCase().includes(query));
    return matchesStage && matchesSearch;
  }), [inquiries, search, stageFilter]);
  const selected = inquiries.find((inquiry) => inquiry.id === selectedId) ?? null;
  const selectedHold = selected ? holds.find((hold) => hold.inquiry_id === selected.id || hold.event_id === selected.converted_event_id) : undefined;
  const selectedEvent = selected?.converted_event_id ? events.find((event) => event.id === selected.converted_event_id) : undefined;
  const openCount = inquiries.filter((inquiry) => !["closed", "lost", "cancelled"].includes(inquiry.stage)).length;
  const pipelineValue = inquiries.filter((inquiry) => !["closed", "lost", "cancelled"].includes(inquiry.stage)).reduce((sum, inquiry) => sum + (inquiry.estimated_value || 0) * (inquiry.probability / 100), 0);
  const expiringCount = holds.filter((hold) => new Date(hold.expires_at).getTime() - now < 24 * 60 * 60 * 1000).length;

  async function moveInquiry(inquiry: Inquiry, nextStage: EventStage) {
    if (accessContext.isDemo) {
      setInquiries((current) => current.map((item) => item.id === inquiry.id ? { ...item, stage: nextStage } : item));
      notify(`${inquiry.contact_name} moved to ${eventStageLabels[nextStage]}.`);
      return;
    }
    const reason = ["lost", "cancelled"].includes(nextStage) ? (window.prompt("Add a reason for this change") ?? "") : "";
    if (["lost", "cancelled"].includes(nextStage) && reason.trim().length < 3) return;
    const response = await fetch(`/api/v1/staff/event-inquiries/${inquiry.id}/transitions`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ stage: nextStage, reason }) });
    const data = await response.json();
    if (!response.ok) return notify(data.error || "The inquiry stage could not be updated.");
    setInquiries((current) => current.map((item) => item.id === inquiry.id ? data.inquiry : item));
    notify(`${inquiry.contact_name} moved to ${eventStageLabels[nextStage]}.`);
  }

  async function createHold() {
    if (!selected) return;
    const space = spaces.find((item) => item.available !== false) ?? spaces[0];
    if (!space) return notify("No event spaces are configured for this venue yet.");
    const expiresAt = new Date(nowMs() + 24 * 60 * 60 * 1000).toISOString();
    if (accessContext.isDemo) {
      setHolds((current) => [...current, { id: `hold-${nowMs()}`, inquiry_id: selected.id, starts_at: selected.requested_starts_at, ends_at: selected.requested_ends_at, expires_at: expiresAt, state: "active", priority: 1 }]);
      setInquiries((current) => current.map((item) => item.id === selected.id ? { ...item, stage: "pencil_booking" } : item));
      notify(`${space.name} held until ${formatDate(expiresAt)}.`);
      return;
    }
    const response = await fetch("/api/v1/staff/event-space-holds", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ venueId, inquiryId: selected.id, startsAt: selected.requested_starts_at, endsAt: selected.requested_ends_at, expiresAt, spaceIds: [space.id] }) });
    const data = await response.json();
    if (!response.ok) return notify(data.error || "The event space could not be held.");
    setHolds((current) => [...current, data.hold]);
    await refresh();
    notify(`${space.name} held for 24 hours.`);
  }

  async function convertSelected() {
    if (!selected) return;
    if (accessContext.isDemo) {
      const eventId = `evt-${nowMs()}`;
      setEvents((current) => [...current, { id: eventId, inquiry_id: selected.id, name: selected.event_name || `${selected.contact_name} event`, starts_at: selected.requested_starts_at, ends_at: selected.requested_ends_at, expected_headcount: selected.expected_guests, status: "planning", quoted_total: selected.estimated_value, balance_due: selected.estimated_value }]);
      setInquiries((current) => current.map((item) => item.id === selected.id ? { ...item, converted_event_id: eventId, stage: "planning" } : item));
      notify("Inquiry converted into a planning event.");
      return;
    }
    const response = await fetch(`/api/v1/staff/event-inquiries/${selected.id}/convert`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
    const data = await response.json();
    if (!response.ok) return notify(data.error || "The inquiry could not be converted.");
    await refresh();
    notify("Inquiry converted into a planning event.");
  }

  return <div className="animate-rise">
    <PageHeader eyebrow="Event sales & operations" title="Events" description="Capture inquiries, protect space inventory, and move every opportunity from first contact to a confirmed event." className="border-b-0">
      <Button variant="secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={cx(loading && "animate-spin")} />Refresh</Button>
      <Button onClick={() => setShowNew(true)}><Plus size={16} />New inquiry</Button>
    </PageHeader>
    <div className="border-y border-border bg-card px-5 py-3 md:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1"><button onClick={() => setView("pipeline")} className={cx("rounded px-3 py-2 text-xs font-semibold", view === "pipeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>Pipeline</button><button onClick={() => setView("calendar")} className={cx("rounded px-3 py-2 text-xs font-semibold", view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>Calendar</button></div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2"><label className="relative min-w-[190px] flex-1 sm:flex-none"><Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" /><input aria-label="Search events" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events" className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary" /></label><label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs"><Filter size={14} className="text-muted-foreground" /><select aria-label="Filter event stage" value={stageFilter} onChange={(event) => setStageFilter(event.target.value as "all" | EventStage)} className="bg-transparent font-medium outline-none"><option value="all">All stages</option>{eventPipelineStages.map((stage) => <option key={stage} value={stage}>{eventStageLabels[stage]}</option>)}</select></label></div>
      </div>
    </div>
    <div className="grid gap-3 border-b border-border bg-background px-5 py-4 sm:grid-cols-2 xl:grid-cols-4 md:px-6"><Metric icon={<Inbox size={16} />} label="Open pipeline" value={String(openCount)} detail="inquiries & events" /><Metric icon={<CircleDollarSign size={16} />} label="Weighted value" value={formatMoney(pipelineValue)} detail="probability weighted" /><Metric icon={<Clock3 size={16} />} label="Expiring holds" value={String(expiringCount)} detail="within 24 hours" tone={expiringCount ? "amber" : "default"} /><Metric icon={<ShieldCheck size={16} />} label="Stage progress" value={`${selected ? stageProgress(selected.stage) : 0}%`} detail={selected ? eventStageLabels[selected.stage] : "select an inquiry"} /></div>
    {view === "pipeline" ? <div className="overflow-x-auto px-5 py-5 md:px-6"><div className="grid min-w-[2500px] grid-cols-12 gap-3">{eventPipelineStages.map((stage) => { const items = visibleInquiries.filter((inquiry) => inquiry.stage === stage); return <section key={stage} className="min-h-[360px] rounded-lg border border-border bg-secondary/45"><div className="flex items-center justify-between border-b border-border px-3 py-3"><div><h2 className="text-xs font-semibold text-foreground">{eventStageLabels[stage]}</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{items.length} {items.length === 1 ? "record" : "records"}</p></div><span className={cx("rounded-full border px-2 py-1 text-[10px] font-semibold", stageTone(stage))}>{stageProgress(stage)}%</span></div><div className="space-y-2 p-2">{items.map((inquiry) => <InquiryCard key={inquiry.id} inquiry={inquiry} hold={holds.find((hold) => hold.inquiry_id === inquiry.id)} selected={selectedId === inquiry.id} onSelect={() => setSelectedId(inquiry.id)} now={now} />)}{items.length === 0 ? <p className="px-2 py-8 text-center text-[11px] text-muted-foreground">No inquiries here</p> : null}</div></section>; })}</div></div> : <CalendarView inquiries={visibleInquiries} events={events} holds={holds} onSelect={setSelectedId} />}
    {selected ? <EventDetail inquiry={selected} event={selectedEvent} hold={selectedHold} spaces={spaces} isDemo={accessContext.isDemo} canManage={accessContext.role === "superadmin" || accessContext.role === "manager"} notify={notify} onClose={() => setSelectedId(null)} onHold={() => void createHold()} onConvert={() => void convertSelected()} onMove={(stage) => void moveInquiry(selected, stage)} /> : null}
    {showNew ? <NewInquiryModal venueId={venueId} isDemo={accessContext.isDemo} onClose={() => setShowNew(false)} onCreated={(inquiry) => { setInquiries((current) => [inquiry, ...current]); setShowNew(false); notify("Event inquiry captured and added to the new inquiry stage."); }} notify={notify} /> : null}
  </div>;
}

function Metric({ icon, label, value, detail, tone = "default" }: { icon: ReactNode; label: string; value: string; detail: string; tone?: "default" | "amber" }) {
  return <div className="rounded-lg border border-border bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div><div className={cx("mt-2 text-xl font-semibold tracking-tight", tone === "amber" && "text-amber-700")}>{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{detail}</div></div>;
}

function InquiryCard({ inquiry, hold, selected, onSelect, now }: { inquiry: Inquiry; hold?: Hold; selected: boolean; onSelect: () => void; now: number }) {
  const overdue = inquiry.next_action_at ? new Date(inquiry.next_action_at).getTime() < now : false;
  return <button onClick={onSelect} className={cx("w-full rounded-md border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", selected ? "border-primary ring-2 ring-primary/15" : "border-border")}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-semibold text-foreground">{inquiry.event_name || `${inquiry.contact_name} event`}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{inquiry.contact_name} · {inquiry.source}</p></div><span className="shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium">{inquiry.probability}%</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays size={12} />{formatShortDate(inquiry.requested_starts_at)}</span><span className="flex items-center gap-1"><Users size={12} />{inquiry.expected_guests} pax</span></div><div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2"><span className="truncate font-semibold text-foreground">{formatMoney(inquiry.estimated_value, inquiry.currency)}</span>{hold ? <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-medium", new Date(hold.expires_at).getTime() - now < 24 * 60 * 60 * 1000 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>Hold {formatShortDate(hold.expires_at)}</span> : overdue ? <span className="text-[10px] font-semibold text-red-700">Follow-up overdue</span> : <ChevronRight size={14} className="text-muted-foreground" />}</div></button>;
}

function CalendarView({ inquiries, events, holds, onSelect }: { inquiries: Inquiry[]; events: EventRecord[]; holds: Hold[]; onSelect: (id: string) => void }) {
  const rows = [...events.map((event) => ({ id: event.inquiry_id, kind: "Confirmed event", label: event.name, startsAt: event.starts_at, guests: event.expected_headcount, tone: "bg-emerald-50 border-emerald-200" })), ...holds.map((hold) => { const inquiry = inquiries.find((item) => item.id === hold.inquiry_id); return { id: hold.inquiry_id || hold.event_id || hold.id, kind: "Pencil hold", label: inquiry?.event_name || inquiry?.contact_name || "Held space", startsAt: hold.starts_at, guests: inquiry?.expected_guests ?? 0, tone: "bg-amber-50 border-amber-200" }; }), ...inquiries.filter((inquiry) => !inquiry.converted_event_id && !holds.some((hold) => hold.inquiry_id === inquiry.id)).map((inquiry) => ({ id: inquiry.id, kind: "Soft inquiry", label: inquiry.event_name || `${inquiry.contact_name} event`, startsAt: inquiry.requested_starts_at, guests: inquiry.expected_guests, tone: "bg-card border-border" }))].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return <div className="px-5 py-5 md:px-6"><SectionCard><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Event calendar</h2><p className="mt-1 text-xs text-muted-foreground">Confirmed bookings, blocking holds, and soft inquiries share one operational timeline.</p></div><CalendarDays size={18} className="text-primary" /></div><div className="divide-y divide-border">{rows.length ? rows.map((row) => <button key={`${row.kind}-${row.id}`} onClick={() => onSelect(row.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-secondary/50"><div className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">{formatDate(row.startsAt)}</div><div className={cx("min-w-0 flex-1 rounded-md border px-3 py-2", row.tone)}><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{row.kind}</span><span className="truncate text-sm font-semibold text-foreground">{row.label}</span></div><div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock3 size={12} />{new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(new Date(row.startsAt))}</span><span className="flex items-center gap-1"><Users size={12} />{row.guests} pax</span></div></div><ChevronRight size={16} className="text-muted-foreground" /></button>) : <p className="px-5 py-12 text-center text-sm text-muted-foreground">No event records match this view.</p>}</div></SectionCard></div>;
}

function EventDetail({ inquiry, event, hold, spaces, isDemo, canManage, notify, onClose, onHold, onConvert, onMove }: { inquiry: Inquiry; event?: EventRecord; hold?: Hold; spaces: Space[]; isDemo: boolean; canManage: boolean; notify: (message: string) => void; onClose: () => void; onHold: () => void; onConvert: () => void; onMove: (stage: EventStage) => void }) {
  const nextStage = eventPipelineStages[eventPipelineStages.indexOf(inquiry.stage) + 1];
  return <div className="fixed inset-0 z-[70] flex justify-end bg-foreground/20 backdrop-blur-[1px]"><button aria-label="Close event detail" className="absolute inset-0" onClick={onClose} /><aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-card px-5 py-5"><div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-accent-strong">Event record</p><h2 className="mt-1 text-xl font-semibold text-foreground">{inquiry.event_name || `${inquiry.contact_name} event`}</h2><p className="mt-1 text-xs text-muted-foreground">{inquiry.contact_name} · {inquiry.source}</p></div><button aria-label="Close" onClick={onClose} className="rounded-full border border-border p-2 text-muted-foreground hover:bg-secondary"><X size={16} /></button></div><div className="space-y-5 p-5"><div className={cx("rounded-lg border p-4", stageTone(inquiry.stage))}><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{eventStageLabels[inquiry.stage]}</span><span className="text-xs font-medium">{stageProgress(inquiry.stage)}% through pipeline</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-current" style={{ width: `${stageProgress(inquiry.stage)}%` }} /></div></div><div className="grid grid-cols-2 gap-3"><Detail label="Requested date" value={formatDate(inquiry.requested_starts_at)} icon={<CalendarDays size={14} />} /><Detail label="Expected guests" value={`${inquiry.expected_guests} people`} icon={<Users size={14} />} /><Detail label="Estimated value" value={formatMoney(inquiry.estimated_value, inquiry.currency)} icon={<CircleDollarSign size={14} />} /><Detail label="Next action" value={inquiry.next_action_at ? formatDate(inquiry.next_action_at) : "Not scheduled"} icon={<Clock3 size={14} />} /></div><SectionCard className="p-4"><h3 className="text-xs font-semibold">Contact & requirements</h3><div className="mt-3 space-y-2 text-xs text-muted-foreground"><p>{inquiry.contact_email || "No email captured"}</p><p>{inquiry.contact_phone || "No phone captured"}</p><p className="rounded-md bg-secondary p-3">Add decision-maker, accessibility, menu, vendor access, and timing requirements to keep the operational record complete.</p></div></SectionCard><SectionCard className="p-4"><div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold">Space inventory</h3><p className="mt-1 text-[11px] text-muted-foreground">Occupancy includes setup and teardown buffers.</p></div><MapPin size={16} className="text-primary" /></div>{hold ? <div className="mt-3 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs"><span><b>Pencil hold active</b><br /><span className="text-amber-800">Expires {formatDate(hold.expires_at)}</span></span><span className="font-semibold text-amber-800">Priority {hold.priority}</span></div> : <div className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">No blocking hold yet. Select an active space to protect this date.</div>}{canManage && !hold && <Button className="mt-3 w-full" variant="secondary" onClick={onHold}><MapPin size={15} />Create 24-hour pencil hold</Button>}{spaces.length > 0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{spaces.slice(0, 4).map((space) => <div key={space.id} className="rounded-md border border-border bg-background p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold">{space.name}</span><span className={cx("h-2 w-2 rounded-full", space.available === false ? "bg-amber-500" : "bg-emerald-500")} /></div><p className="mt-1 text-[10px] text-muted-foreground">{space.code} · up to {space.max_capacity} guests</p></div>)}</div> : null}</SectionCard>{event ? <><SectionCard className="p-4"><div className="flex items-center gap-2 text-xs font-semibold"><Sparkles size={15} className="text-primary" />Planning event</div><p className="mt-2 text-xs text-muted-foreground">{event.expected_headcount} guests · quoted {formatMoney(event.quoted_total)} · balance {formatMoney(event.balance_due)}</p></SectionCard><EventFilesPanel eventId={event.id} isDemo={isDemo} canManage={canManage} notify={notify} /></> : null}<div className="flex flex-wrap gap-2">{canManage && nextStage && <Button onClick={() => onMove(nextStage)}><ChevronRight size={15} />Move to {eventStageLabels[nextStage]}</Button>}{canManage && !event && ["pencil_booking", "proposal_sent", "negotiation", "deposit_pending"].includes(inquiry.stage) && <Button variant="secondary" onClick={onConvert}><Check size={15} />Convert to event</Button>}{canManage && !["lost", "cancelled", "closed"].includes(inquiry.stage) && <Button variant="ghost" onClick={() => onMove("cancelled")}>Cancel inquiry</Button>}</div></div></aside></div>;
}

const documentTypeLabels: Record<string, string> = {
  quotation: "Quotation",
  agreement: "Agreement",
  beo: "BEO",
  invoice: "Invoice",
  attachment: "Attachment",
  other: "Other",
};

function EventFilesPanel({ eventId, isDemo, canManage, notify }: { eventId: string; isDemo: boolean; canManage: boolean; notify: (message: string) => void }) {
  const [documents, setDocuments] = useState<EventDocumentView[]>(isDemo ? [{ id: "demo-doc", event_id: eventId, file_name: "blue-harbor-brief.pdf", document_type: "attachment", scan_status: "clean", visibility: "staff", source_type: "upload", byte_size: 184320, document_version: 1, created_at: "2026-08-10T06:00:00Z", signed_url: null }] : []);
  const [documentType, setDocumentType] = useState("attachment");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(!isDemo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isDemo) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/staff/events/${eventId}/documents`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Event documents are unavailable.");
      setDocuments(data.documents ?? []);
      setError(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Event documents are unavailable.";
      setError(message);
    } finally { setLoading(false); }
  }, [eventId, isDemo]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function uploadFile(event: FormEvent) {
    event.preventDefault();
    if (isDemo) return notify("Attachments will be stored after this event is connected to Supabase.");
    if (!file) return notify("Choose a file first.");
    setSaving(true);
    const form = new FormData();
    form.append("file", file);
    form.append("documentType", documentType);
    const response = await fetch(`/api/v1/staff/events/${eventId}/documents`, { method: "POST", body: form });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return notify(data.error || "The attachment could not be saved.");
    setFile(null);
    setError(null);
    await refresh();
    notify("Attachment added to the event record.");
  }

  async function generateQuotation() {
    if (isDemo) return notify("Quotation preview is available once a real planning event is connected.");
    setSaving(true);
    const response = await fetch(`/api/v1/staff/events/${eventId}/documents/quote`, { method: "POST" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setSaving(false);
      return notify(data.error || "The quotation could not be generated.");
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || "waterfront-event-quotation.pdf";
    anchor.click();
    window.URL.revokeObjectURL(url);
    setSaving(false);
    await refresh();
    notify("Branded quotation PDF generated and attached.");
  }

  function formatBytes(bytes?: number | null) {
    if (!bytes) return "";
    return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return <SectionCard className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-semibold"><Paperclip size={15} className="text-primary" />Files & documents</div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Keep briefs, agreements, BEOs, and generated quotations with the event record.</p></div><FileText size={17} className="text-muted-foreground" /></div><div className="mt-3 space-y-2">{loading ? <p className="rounded-md bg-secondary px-3 py-3 text-xs text-muted-foreground">Loading event files…</p> : documents.length ? documents.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><FileText size={15} /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{item.file_name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{documentTypeLabels[item.document_type] || "Document"} · v{item.document_version || 1} {item.byte_size ? `· ${formatBytes(item.byte_size)}` : ""}</p></div>{item.signed_url ? <a aria-label={`Download ${item.file_name}`} href={item.signed_url} target="_blank" rel="noreferrer" className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><Download size={15} /></a> : <span className="text-[10px] text-muted-foreground">Private</span>}</div>) : <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No files attached yet.</p>}</div>{error ? <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{error}</p> : null}{canManage ? <><form onSubmit={(event) => void uploadFile(event)} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><select aria-label="Document type" value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-xs"><option value="attachment">Attachment</option><option value="agreement">Agreement</option><option value="beo">BEO</option><option value="invoice">Invoice</option><option value="other">Other</option></select><label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-secondary"><Upload size={14} />{file ? file.name.slice(0, 18) : "Choose file"}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><Button type="submit" variant="secondary" disabled={saving || !file}>{saving ? "Saving…" : "Attach"}</Button></form><Button type="button" className="mt-2 w-full" variant="secondary" onClick={() => void generateQuotation()} disabled={saving}><Sparkles size={15} />Generate quotation PDF</Button></> : null}<p className="mt-2 text-[10px] text-muted-foreground">Private files are permission-checked. New versions are added as immutable records.</p></SectionCard>;
}

function Detail({ label, value, icon }: { label: string; value: string; icon: ReactNode }) { return <div className="rounded-md border border-border bg-background p-3"><div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">{icon}{label}</div><p className="mt-1 text-xs font-semibold text-foreground">{value}</p></div>; }

function NewInquiryModal({ venueId, isDemo, onClose, onCreated, notify }: { venueId: string; isDemo: boolean; onClose: () => void; onCreated: (inquiry: Inquiry) => void; notify: (message: string) => void }) {
  const today = new Date();
  const [form, setForm] = useState({ contactName: "", eventName: "", email: "", source: "Website", date: today.toISOString().slice(0, 10), start: "18:00", end: "22:00", guests: "30", budget: "" });
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const starts = toManilaIso(form.date, form.start);
    const ends = toManilaIso(form.date, form.end);
    if (isDemo) {
      onCreated({ id: `inq-${nowMs()}`, venue_id: venueId, contact_name: form.contactName, contact_email: form.email, event_name: form.eventName, source: form.source, requested_starts_at: starts, requested_ends_at: ends, expected_guests: Number(form.guests), budget: form.budget ? Number(form.budget) : null, currency: "PHP", stage: "new_inquiry", next_action_at: null, estimated_value: form.budget ? Number(form.budget) : 0, probability: 20, created_at: new Date().toISOString() });
      setSaving(false); return;
    }
    const response = await fetch("/api/v1/staff/events", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ venueId, contactName: form.contactName, contactEmail: form.email, eventName: form.eventName, source: form.source, requestedStartsAt: starts, requestedEndsAt: ends, expectedGuests: Number(form.guests), budget: form.budget ? Number(form.budget) : undefined }) });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return notify(data.error || "The event inquiry could not be created.");
    onCreated(data.inquiry);
  }
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-sm"><button aria-label="Close new inquiry" className="absolute inset-0" onClick={onClose} /><form onSubmit={submit} className="relative w-full max-w-xl rounded-lg border border-border bg-card shadow-2xl"><div className="flex items-start justify-between border-b border-border px-5 py-5"><div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-accent-strong">Sales intake</p><h2 className="mt-1 text-xl font-semibold">New event inquiry</h2><p className="mt-1 text-xs text-muted-foreground">Capture the lead first; inventory and proposals follow as commands.</p></div><button type="button" aria-label="Close" onClick={onClose} className="rounded-full border border-border p-2 text-muted-foreground hover:bg-secondary"><X size={16} /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Contact name" required><input required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} placeholder="Decision maker" /></Field><Field label="Event name"><input value={form.eventName} onChange={(event) => setForm({ ...form, eventName: event.target.value })} placeholder="Company dinner" /></Field><Field label="Email"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@company.com" /></Field><Field label="Source"><select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}>{["Website", "Facebook", "Instagram", "WhatsApp", "Viber", "Phone", "Email", "Walk-in", "Staff Entry", "Partner"].map((source) => <option key={source}>{source}</option>)}</select></Field><Field label="Event date" required><input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field><Field label="Guests" required><input required type="number" min="1" max="1000" value={form.guests} onChange={(event) => setForm({ ...form, guests: event.target.value })} /></Field><Field label="Start" required><input required type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></Field><Field label="End" required><input required type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></Field><Field label="Estimated budget (PHP)"><input type="number" min="0" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} placeholder="Optional" /></Field></div><div className="flex justify-end gap-2 border-t border-border bg-secondary/40 px-5 py-4"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Capture inquiry"}<ChevronRight size={16} /></Button></div></form></div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) { return <label className="block text-xs font-semibold text-foreground">{label}{required ? <span className="ml-1 text-accent-strong">*</span> : null}<span className="mt-1.5 block [&_input]:h-10 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-sm [&_input]:font-normal [&_input]:outline-none [&_input]:focus:border-primary [&_select]:h-10 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-sm [&_select]:font-normal [&_select]:outline-none">{children}</span></label>; }
