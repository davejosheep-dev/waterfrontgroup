import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveTablePresentationState, type FloorPresentationState } from "@/lib/floor-projection";

type DynamicClient = SupabaseClient;
type Row = Record<string, unknown>;
type FloorRunRow = { id: string; venue_id: string; service_date: string; service_period_id: string | null; floor_plan_version_id: string; status: string; version: number; opened_at: string; last_event_at: string | null };
type FloorVersionRow = { id: string; floor_plan_id: string; version_number: number; status: string; canvas_width: number; canvas_height: number };

// Supabase's generated database types are intentionally not checked into this
// preview repository. These narrow helpers keep the server boundary typed while
// allowing the migrations to remain the source of truth for row shapes.
function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

export type FloorSnapshotTable = {
  id: string;
  label: string;
  tableType: string;
  capacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  sectionId: string | null;
  active: boolean;
  presentationState: FloorPresentationState;
  reservationId: string | null;
  guestName: string | null;
  sessionId: string | null;
  sessionState: string | null;
  arrivedCount: number;
  expectedClearAt: string | null;
  override: { id: string; type: string; reason: string; expiresAt: string | null } | null;
};

export type FloorSnapshotReservation = {
  id: string;
  code: string;
  guestName: string;
  guestId: string | null;
  partySize: number;
  status: string;
  startsAt: string;
  endsAt: string;
  arrivedCount: number;
  tableIds: string[];
  sessionId: string | null;
  sessionState: string | null;
  source: string;
  specialRequests: string | null;
  depositStatus: string | null;
};

export type FloorSnapshot = {
  serviceRun: {
    id: string;
    venueId: string;
    serviceDate: string;
    servicePeriodId: string | null;
    floorPlanVersionId: string;
    status: string;
    version: number;
    openedAt: string;
    lastEventAt: string | null;
  };
  plan: { id: string; name: string; versionId: string; versionNumber: number; status: string; canvasWidth: number; canvasHeight: number };
  sections: Array<{ id: string; code: string; name: string; color: string; sortOrder: number }>;
  objects: Array<Record<string, unknown>>;
  tables: FloorSnapshotTable[];
  reservations: FloorSnapshotReservation[];
  sessions: Array<Record<string, unknown>>;
  fetchedAt: string;
};

export class FloorServiceError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

async function query<T>(result: PromiseLike<{ data: T | null; error: { message: string } | null }>, fallback: T): Promise<T> {
  const { data, error } = await result;
  if (error) throw new FloorServiceError("FLOOR_DATA_UNAVAILABLE", error.message, 503);
  return data ?? fallback;
}

export async function loadFloorSnapshot(supabase: DynamicClient, serviceRunId: string): Promise<FloorSnapshot> {
  const run = await query<FloorRunRow | null>(supabase.from("service_runs").select("id,venue_id,service_date,service_period_id,floor_plan_version_id,status,version,opened_at,last_event_at").eq("id", serviceRunId).maybeSingle(), null);
  if (!run) throw new FloorServiceError("SERVICE_RUN_NOT_FOUND", "That service run is not available to this account.", 404);

  const [version, sections, objects, sessions, reservations, overrides, periods] = await Promise.all([
    query<FloorVersionRow | null>(supabase.from("floor_plan_versions").select("id,floor_plan_id,version_number,status,canvas_width,canvas_height").eq("id", run.floor_plan_version_id).maybeSingle(), null),
    query<Row[]>(supabase.from("floor_sections").select("id,code,name,color,sort_order").eq("floor_plan_version_id", run.floor_plan_version_id).order("sort_order"), []),
    query<Row[]>(supabase.from("floor_objects").select("id,section_id,object_type,table_id,label,x,y,width,height,rotation,z_index,style,accessible_label").eq("floor_plan_version_id", run.floor_plan_version_id).order("z_index").order("id"), []),
    query<Row[]>(supabase.from("table_sessions").select("id,reservation_id,walk_in_id,state,party_size,actual_arrived_at,actual_seated_at,actual_completed_at,actual_cleared_at,expected_clear_at,version").eq("service_run_id", serviceRunId).order("created_at"), []),
    query<Row[]>(supabase.from("reservations").select("id,code,guest_id,guest_count,status,starts_at,ends_at,source,special_requests").eq("outlet_id", run.venue_id).eq("local_date", run.service_date).in("status", ["confirmed", "arrived", "seated", "completed"]).order("starts_at"), []),
    query<Row[]>(supabase.from("table_state_overrides").select("id,table_id,override_type,reason,expires_at,cleared_at").eq("service_run_id", serviceRunId).is("cleared_at", null), []),
    run.service_period_id ? query<Row | null>(supabase.from("service_periods").select("id,name").eq("id", run.service_period_id).maybeSingle(), null) : Promise.resolve(null),
  ]);

  if (!version) throw new FloorServiceError("FLOOR_VERSION_NOT_FOUND", "The published floor version could not be loaded.", 409);
  const objectRows = list(objects);
  const tableIds = objectRows.map((row) => stringValue(row.table_id)).filter((id): id is string => Boolean(id));
  const sessionRows = list(sessions);
  const reservationRows = list(reservations);
  const reservationIds = reservationRows.map((row) => stringValue(row.id)).filter((id): id is string => Boolean(id));
  const guestIds = reservationRows.map((row) => stringValue(row.guest_id)).filter((id): id is string => Boolean(id));

  const [tableRows, assignments, arrivalRows, guestRows, plan] = await Promise.all([
    tableIds.length ? query<Row[]>(supabase.from("dining_tables").select("id,code,table_type,maximum_capacity,active").in("id", tableIds), []) : Promise.resolve([]),
    reservationIds.length ? query<Row[]>(supabase.from("reservation_table_assignments").select("reservation_id,table_id,table_combination_id").in("reservation_id", reservationIds), []) : Promise.resolve([]),
    reservationIds.length ? query<Row[]>(supabase.from("arrival_events").select("reservation_id,arrived_count,created_at").in("reservation_id", reservationIds).order("created_at", { ascending: false }), []) : Promise.resolve([]),
    guestIds.length ? query<Row[]>(supabase.from("guests").select("id,full_name").in("id", guestIds), []) : Promise.resolve([]),
    query<Row | null>(supabase.from("floor_plans").select("id,name").eq("current_version_id", version.id).maybeSingle(), null),
  ]);

  const tableById = new Map(list(tableRows).map((row) => [stringValue(row.id) ?? "", row]));
  const guestById = new Map(list(guestRows).map((row) => [stringValue(row.id) ?? "", stringValue(row.full_name) ?? "Guest"]));
  const sessionByReservation = new Map<string, Record<string, unknown>>();
  for (const row of sessionRows) if (stringValue(row.reservation_id)) sessionByReservation.set(String(row.reservation_id), row);
  const assignmentByReservation = new Map<string, string[]>();
  for (const row of list(assignments)) {
    const reservationId = stringValue(row.reservation_id);
    const tableId = stringValue(row.table_id);
    if (reservationId && tableId) assignmentByReservation.set(reservationId, [...(assignmentByReservation.get(reservationId) ?? []), tableId]);
  }
  const arrivalsByReservation = new Map<string, number>();
  for (const row of list(arrivalRows)) {
    const reservationId = stringValue(row.reservation_id);
    if (reservationId && !arrivalsByReservation.has(reservationId)) arrivalsByReservation.set(reservationId, Number(row.arrived_count ?? 0));
  }
  const overrideByTable = new Map<string, Record<string, unknown>>();
  for (const row of list(overrides)) {
    const tableId = stringValue(row.table_id);
    if (tableId) overrideByTable.set(tableId, row);
  }
  const reservationByTable = new Map<string, FloorSnapshotReservation>();
  const reservationModels: FloorSnapshotReservation[] = reservationRows.map((row) => {
    const id = stringValue(row.id) ?? "";
    const session = sessionByReservation.get(id);
    const model: FloorSnapshotReservation = {
      id,
      code: stringValue(row.code) ?? id.slice(0, 8).toUpperCase(),
      guestName: guestById.get(stringValue(row.guest_id) ?? "") ?? "Guest",
      guestId: stringValue(row.guest_id),
      partySize: Number(row.guest_count ?? 0),
      status: stringValue(row.status) ?? "confirmed",
      startsAt: stringValue(row.starts_at) ?? "",
      endsAt: stringValue(row.ends_at) ?? "",
      arrivedCount: arrivalsByReservation.get(id) ?? 0,
      tableIds: assignmentByReservation.get(id) ?? [],
      sessionId: stringValue(session?.id),
      sessionState: stringValue(session?.state),
      source: stringValue(row.source) ?? "Staff",
      specialRequests: stringValue(row.special_requests),
      depositStatus: null,
    };
    for (const tableId of model.tableIds) reservationByTable.set(tableId, model);
    return model;
  });

  const tableModels: FloorSnapshotTable[] = objectRows.filter((row) => stringValue(row.object_type) === "table").map((object) => {
    const id = stringValue(object.table_id) ?? stringValue(object.id) ?? "";
    const table = tableById.get(id);
    const reservation = reservationByTable.get(id);
    const session = reservation?.sessionId ? sessionRows.find((row) => stringValue(row.id) === reservation.sessionId) : undefined;
    const override = overrideByTable.get(id);
    const sessionState = stringValue(session?.state);
    const presentationState = deriveTablePresentationState({
      active: table?.active !== false,
      hasActiveOverride: Boolean(override),
      inventoryState: table?.active === false ? "inactive" : override ? "blocked" : sessionState === "active" ? "occupied" : "free",
      sessionState: sessionState as "planned" | "active" | "clearing" | "cleared" | "voided" | null,
      arrivedCount: reservation?.arrivedCount ?? 0,
      reservationStartsAt: reservation?.startsAt,
    });
    return {
      id,
      label: stringValue(object.label) ?? stringValue(table?.code) ?? id.slice(0, 8),
      tableType: stringValue(table?.table_type) ?? "custom",
      capacity: Number(table?.maximum_capacity ?? 0),
      x: Number(object.x ?? 0), y: Number(object.y ?? 0), width: Number(object.width ?? 8), height: Number(object.height ?? 10), rotation: Number(object.rotation ?? 0),
      sectionId: stringValue(object.section_id), active: table?.active !== false, presentationState,
      reservationId: reservation?.id ?? null, guestName: reservation?.guestName ?? null,
      sessionId: reservation?.sessionId ?? null, sessionState: sessionState ?? null,
      arrivedCount: reservation?.arrivedCount ?? 0, expectedClearAt: stringValue(session?.expected_clear_at),
      override: override ? { id: stringValue(override.id) ?? "", type: stringValue(override.override_type) ?? "blocked", reason: stringValue(override.reason) ?? "", expiresAt: stringValue(override.expires_at) } : null,
    };
  });

  return {
    serviceRun: { id: String(run.id), venueId: String(run.venue_id), serviceDate: String(run.service_date), servicePeriodId: stringValue(run.service_period_id), floorPlanVersionId: String(run.floor_plan_version_id), status: String(run.status), version: Number(run.version ?? 1), openedAt: String(run.opened_at), lastEventAt: stringValue(run.last_event_at) },
    plan: { id: String(plan?.id ?? version.floor_plan_id), name: String(plan?.name ?? periods?.name ?? "Waterfront floor"), versionId: String(version.id), versionNumber: Number(version.version_number ?? 1), status: String(version.status), canvasWidth: Number(version.canvas_width ?? 1200), canvasHeight: Number(version.canvas_height ?? 760) },
    sections: list(sections).map((row) => ({ id: String(row.id), code: String(row.code), name: String(row.name), color: String(row.color), sortOrder: Number(row.sort_order ?? 0) })),
    objects: objectRows,
    tables: tableModels,
    reservations: reservationModels,
    sessions: sessionRows,
    fetchedAt: new Date().toISOString(),
  };
}

export async function callFloorCommand(supabase: DynamicClient, rpcName: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(rpcName, { payload });
  if (!error) return data;
  const message = error.message ?? "The floor command could not be completed.";
  const code = message.includes("Not authorized") ? "FORBIDDEN" : message.includes("TABLE_CONFLICT") ? "TABLE_CONFLICT" : message.includes("FLOOR_PLAN_INVALID") ? "FLOOR_PLAN_INVALID" : message.includes("RECONCILIATION") ? "RECONCILIATION_REQUIRED" : "FLOOR_COMMAND_FAILED";
  throw new FloorServiceError(code, message, code === "FORBIDDEN" ? 403 : code === "TABLE_CONFLICT" ? 409 : 400);
}

