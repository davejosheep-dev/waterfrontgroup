"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRightLeft, Ban, Check, CheckCheck, Clock3, RefreshCw, ShieldCheck, UsersRound, WifiOff } from "lucide-react";
import type { AccessContext } from "@/lib/access-control";
import type { Reservation } from "@/lib/domain";
import { deriveTablePresentationState } from "@/lib/floor-projection";

type FloorReservation = { id: string; code: string; guestName: string; guestId: string | null; partySize: number; status: string; startsAt: string; endsAt: string; arrivedCount: number; tableIds: string[]; sessionId: string | null; sessionState: string | null; source: string; specialRequests: string | null; depositStatus: string | null };
type FloorTable = { id: string; label: string; tableType: string; capacity: number; x: number; y: number; width: number; height: number; rotation: number; sectionId: string | null; active: boolean; presentationState: string; reservationId: string | null; guestName: string | null; sessionId: string | null; sessionState: string | null; arrivedCount: number; expectedClearAt: string | null; override: { id: string; type: string; reason: string; expiresAt: string | null } | null };
type FloorSnapshot = { serviceRun: { id: string; venueId: string; serviceDate: string; servicePeriodId: string | null; floorPlanVersionId: string; status: string; version: number; openedAt: string; lastEventAt: string | null }; plan: { id: string; name: string; versionId: string; versionNumber: number; status: string; canvasWidth: number; canvasHeight: number }; sections: Array<{ id: string; code: string; name: string; color: string; sortOrder: number }>; objects: Array<Record<string, unknown>>; tables: FloorTable[]; reservations: FloorReservation[]; sessions: Array<Record<string, unknown>>; fetchedAt: string };

function cx(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(" "); }

const stateStyle: Record<string, string> = {
  inactive: "bg-slate-100 text-slate-600",
  blocked: "bg-rose-50 text-rose-700",
  seated: "bg-emerald-50 text-emerald-700",
  needs_clearing: "bg-amber-50 text-amber-800",
  arrived: "bg-sky-50 text-sky-700",
  soon: "bg-violet-50 text-violet-700",
  available: "bg-[#edf4ef] text-[#24584f]",
};

function demoSnapshot(reservations: Reservation[]): FloorSnapshot {
  const now = new Date();
  const models = reservations.filter((reservation) => !["cancelled", "no_show", "completed"].includes(reservation.status)).map((reservation, index) => ({
    id: reservation.id,
    code: reservation.code,
    guestName: reservation.guestName,
    guestId: null,
    partySize: reservation.guestCount,
    status: reservation.status,
    startsAt: new Date(`${reservation.date}T${reservation.start}:00+08:00`).toISOString(),
    endsAt: new Date(new Date(`${reservation.date}T${reservation.start}:00+08:00`).getTime() + reservation.durationMinutes * 60_000).toISOString(),
    arrivedCount: reservation.status === "arrived" || reservation.status === "seated" ? reservation.guestCount : 0,
    tableIds: reservation.table ? [reservation.table] : index < 3 ? [`T${index + 1}`] : [],
    sessionId: reservation.status === "seated" ? `demo-session-${reservation.id}` : null,
    sessionState: reservation.status === "seated" ? "active" : null,
    source: reservation.source,
    specialRequests: reservation.notes ?? null,
    depositStatus: reservation.deposit,
  }));
  const tables = Array.from({ length: 31 }, (_, index) => {
    const tableId = `T${index < 9 ? "1" : index < 27 ? "2" : "3"}-${String(index < 9 ? index + 1 : index < 27 ? index - 8 : index - 26).padStart(2, "0")}`;
    const assigned = models.find((reservation) => reservation.tableIds.includes(tableId));
    const sessionState = assigned?.sessionState ?? null;
    const presentationState = deriveTablePresentationState({ active: true, sessionState: sessionState as "active" | null, arrivedCount: assigned?.arrivedCount ?? 0, reservationStartsAt: assigned?.startsAt, now });
    return {
      id: tableId, label: tableId, tableType: tableId.startsWith("T1") ? "T1" : tableId.startsWith("T2") ? "T2" : "T3", capacity: tableId.startsWith("T1") ? 2 : 4,
      x: 8 + (index % 8) * 11, y: 12 + Math.floor(index / 8) * 16, width: 7, height: 9, rotation: 0, sectionId: "demo-main", active: true,
      presentationState, reservationId: assigned?.id ?? null, guestName: assigned?.guestName ?? null, sessionId: assigned?.sessionId ?? null, sessionState,
      arrivedCount: assigned?.arrivedCount ?? 0, expectedClearAt: assigned?.endsAt ?? null, override: null,
    };
  });
  return {
    serviceRun: { id: "demo-service-run", venueId: "waterfront-iloilo", serviceDate: reservations[0]?.date ?? "2026-08-07", servicePeriodId: "demo-dinner", floorPlanVersionId: "demo-floor-v1", status: "open", version: 1, openedAt: now.toISOString(), lastEventAt: now.toISOString() },
    plan: { id: "demo-floor", name: "Waterfront Main Dining", versionId: "demo-floor-v1", versionNumber: 1, status: "published", canvasWidth: 1200, canvasHeight: 760 },
    sections: [{ id: "demo-main", code: "main", name: "Main Dining", color: "#2b766c", sortOrder: 0 }], objects: [], tables, reservations: models, sessions: [], fetchedAt: now.toISOString(),
  };
}

export function FloorOperationsWorkspace({ reservations, accessContext, canOperate, notify }: { reservations: Reservation[]; accessContext: AccessContext; canOperate: boolean; notify: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<FloorSnapshot>(() => demoSnapshot(reservations));
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(() => new Date());
  const [filter, setFilter] = useState<"attention" | "all" | "seated">("attention");

  const venueId = accessContext.conceptId ?? accessContext.accessibleConcepts?.[0]?.id ?? "";
  const serviceDate = snapshot.serviceRun.serviceDate;
  const live = !accessContext.isDemo;

  const sync = useCallback(async () => {
    if (!live || !venueId) { setLastSync(new Date()); return; }
    setLoading(true);
    try {
      const runResponse = await fetch(`/api/v1/staff/service-runs?venueId=${encodeURIComponent(venueId)}&serviceDate=${encodeURIComponent(serviceDate)}`, { cache: "no-store" });
      if (!runResponse.ok) throw new Error("RUN_UNAVAILABLE");
      const runData = await runResponse.json() as { serviceRuns?: Array<{ id: string }> };
      let runId = runData.serviceRuns?.[0]?.id;
      if (!runId) {
        const openResponse = await fetch("/api/v1/staff/service-runs", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `floor-open-${venueId}-${serviceDate}` }, body: JSON.stringify({ venueId, serviceDate }) });
        if (!openResponse.ok) throw new Error("RUN_OPEN_FAILED");
        const openData = await openResponse.json() as { serviceRun?: { serviceRunId?: string; id?: string } };
        runId = openData.serviceRun?.serviceRunId ?? openData.serviceRun?.id;
      }
      if (!runId) throw new Error("RUN_ID_MISSING");
      const snapshotResponse = await fetch(`/api/v1/staff/service-runs/${runId}/snapshot`, { cache: "no-store" });
      if (!snapshotResponse.ok) throw new Error("SNAPSHOT_UNAVAILABLE");
      const data = await snapshotResponse.json() as { snapshot: FloorSnapshot };
      setSnapshot(data.snapshot);
      setOffline(false);
      setLastSync(new Date());
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [live, serviceDate, venueId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void sync(); }, 0);
    return () => window.clearTimeout(timer);
  }, [sync]);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => { void sync(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [live, sync]);

  const attention = useMemo(() => snapshot.reservations.filter((reservation) => ["confirmed", "arrived"].includes(reservation.status) || reservation.sessionState === "clearing"), [snapshot.reservations]);
  const visibleReservations = useMemo(() => {
    if (filter === "seated") return snapshot.reservations.filter((reservation) => reservation.status === "seated");
    if (filter === "all") return snapshot.reservations;
    return attention;
  }, [attention, filter, snapshot.reservations]);
  const seatedTables = snapshot.tables.filter((table) => table.presentationState === "seated").length;
  const clearingTables = snapshot.tables.filter((table) => table.presentationState === "needs_clearing").length;
  const availableTables = snapshot.tables.filter((table) => table.presentationState === "available").length;

  async function command(action: "arrivals" | "seat" | "complete" | "clear", reservation: FloorSnapshot["reservations"][number]) {
    if (!canOperate) return notify("Your role can view the floor but cannot run service commands.");
    if (!live) {
      notify(action === "arrivals" ? `${reservation.guestName} checked in.` : action === "seat" ? `${reservation.guestName} marked seated.` : action === "complete" ? `${reservation.guestName} marked complete; table needs clearing.` : `${reservation.guestName}'s table cleared.`);
      setSnapshot((current) => ({ ...current, reservations: current.reservations.map((item) => item.id === reservation.id ? { ...item, status: action === "arrivals" ? "arrived" : action === "seat" ? "seated" : action === "complete" ? "completed" : "completed", arrivedCount: action === "arrivals" ? item.partySize : item.arrivedCount, sessionState: action === "seat" ? "active" : action === "complete" ? "clearing" : action === "clear" ? "cleared" : item.sessionState } : item) }));
      return;
    }
    const endpoint = action === "arrivals" ? "arrivals" : action === "seat" ? "seat" : action === "complete" ? "complete" : "clear";
    const body = action === "arrivals" ? { reservationId: reservation.id, arrivedCount: reservation.partySize } : { reservationId: reservation.id, tableSessionId: reservation.sessionId };
    if (action !== "arrivals" && !reservation.sessionId) return notify("Seat the reservation before using this action.");
    const response = await fetch(`/api/v1/staff/service-runs/${snapshot.serviceRun.id}/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) });
    if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; notify(data.error ?? "The server rejected that floor action."); return; }
    notify(action === "arrivals" ? `${reservation.guestName} checked in.` : `${reservation.guestName} updated.`);
    await sync();
  }

  return <section className="mb-5 overflow-hidden rounded-2xl border border-[#dce4de] bg-white shadow-[0_8px_28px_rgba(35,61,55,.07)]" aria-label="Live floor operations">
    <div className="flex flex-col gap-4 border-b border-[#e6ebe7] bg-[#fbfcfa] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3"><div className="mt-0.5 rounded-xl bg-[#e9f3ef] p-2.5 text-[#14675a]"><CheckCheck size={19} /></div><div><div className="flex items-center gap-2"><h2 className="font-display text-xl text-[#1e3b36]">Live service board</h2><span className={cx("rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide", snapshot.serviceRun.status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>{snapshot.serviceRun.status}</span></div><p className="mt-1 text-[11px] text-[#71817b]">{snapshot.plan.name} Â· {serviceDate} Â· updates are server-authoritative</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><div className={cx("flex items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-semibold", offline ? "border-amber-200 bg-amber-50 text-amber-800" : "border-[#d9e8df] bg-white text-[#5d706a]")} >{offline ? <WifiOff size={13} /> : <Clock3 size={13} />} {offline ? "Refresh fallback" : `Synced ${lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}</div><button aria-label="Refresh live floor" onClick={() => void sync()} disabled={loading} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#d7e0da] bg-white px-3 text-[10px] font-bold text-[#315b50] transition hover:border-[#8ab5a6] disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />{loading ? "Syncing" : "Sync floor"}</button></div>
    </div>
    <div className="grid grid-cols-3 divide-x border-b border-[#e6ebe7] lg:grid-cols-5"><Metric label="Arrivals" value={String(attention.length)} tone="text-[#8a5a1c]" /><Metric label="Seated tables" value={String(seatedTables)} tone="text-[#1d7462]" /><Metric label="Needs clearing" value={String(clearingTables)} tone="text-[#a16017]" /><Metric label="Available" value={String(availableTables)} tone="text-[#506f66]" /><Metric label="Plan version" value={`v${snapshot.plan.versionNumber}`} tone="text-[#4e5a74]" /></div>
    <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><div className="mr-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#7b8983]"><UsersRound size={14} /> Queue</div>{(["attention", "all", "seated"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={cx("rounded-full border px-3 py-1.5 text-[10px] font-bold capitalize", filter === value ? "border-[#2f796d] bg-[#e9f4ef] text-[#1d6558]" : "border-[#e0e7e2] bg-white text-[#78857f]")}>{value === "attention" ? "Needs attention" : value}</button>)}<span className="ml-auto hidden items-center gap-1 text-[10px] text-[#86928d] md:flex"><ShieldCheck size={13} /> Venue-scoped commands</span></div><div className="flex items-center gap-2 text-[10px] text-[#83908b]"><span className="h-2 w-2 rounded-full bg-[#2c8a75]" /> Text + color states</div></div>
    <div className="grid gap-2 border-t border-[#edf0ed] bg-[#fcfdfb] p-3 md:grid-cols-2 xl:grid-cols-4">{!accessContext.isDemo && visibleReservations.slice(0, 8).map((reservation) => <div key={reservation.id} className="rounded-xl border border-[#e0e8e2] bg-white p-3 shadow-[0_2px_10px_rgba(35,61,55,.04)]"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs font-bold text-[#29443e]">{reservation.guestName}</div><div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#7b8983]"><span>{reservation.partySize} guests</span><span>Â·</span><span>{new Date(reservation.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div></div><span className={cx("shrink-0 rounded-full px-2 py-1 text-[9px] font-bold", stateStyle[reservation.status === "seated" ? "seated" : reservation.sessionState === "clearing" ? "needs_clearing" : reservation.arrivedCount ? "arrived" : "soon"] ?? "bg-slate-100 text-slate-700")}>{reservation.sessionState === "clearing" ? "Needs clearing" : reservation.status === "arrived" && reservation.arrivedCount < reservation.partySize ? `Partial ${reservation.arrivedCount}/${reservation.partySize}` : reservation.status.replaceAll("_", " ")}</span></div><div className="mt-3 flex flex-wrap gap-1.5">{reservation.tableIds.length ? reservation.tableIds.map((tableId) => <span key={tableId} className="rounded-md bg-[#f3f6f3] px-2 py-1 text-[9px] font-semibold text-[#567068]">{tableId}</span>) : <span className="rounded-md bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-800">Unassigned</span>}</div><div className="mt-3 flex gap-1.5">{reservation.status === "confirmed" && <ActionButton onClick={() => void command("arrivals", reservation)} icon={<Check size={12} />}>Arrive</ActionButton>}{reservation.status === "arrived" && <ActionButton onClick={() => void command("seat", reservation)} icon={<UsersRound size={12} />}>Seat</ActionButton>}{reservation.status === "seated" && <ActionButton onClick={() => void command("complete", reservation)} icon={<ArrowRightLeft size={12} />}>Complete</ActionButton>}{reservation.sessionState === "clearing" && reservation.sessionId && <ActionButton onClick={() => void command("clear", reservation)} icon={<CheckCheck size={12} />}>Clear</ActionButton>}{reservation.status !== "seated" && reservation.sessionState !== "clearing" && reservation.status !== "completed" && reservation.tableIds.length === 0 && <span className="inline-flex items-center gap-1 text-[9px] text-amber-700"><Ban size={12} /> Assign before seating</span>}</div></div>)}{visibleReservations.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-[#d8e2dc] bg-white px-4 py-6 text-center text-xs text-[#7c8b84]">No reservations match this service filter.</div>}</div>
  </section>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="px-4 py-3"><div className={cx("font-display text-xl", tone)}>{value}</div><div className="mt-0.5 text-[9px] font-bold uppercase tracking-[.11em] text-[#8a9690]">{label}</div></div>; }
function ActionButton({ children, icon, onClick }: { children: string; icon: ReactNode; onClick: () => void }) { return <button onClick={onClick} className="inline-flex min-h-7 items-center gap-1.5 rounded-md bg-[#174f45] px-2.5 text-[9px] font-bold text-white transition hover:bg-[#0f3c35]">{icon}{children}</button>; }

