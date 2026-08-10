import "server-only";

import { addDays } from "date-fns";
import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/admin-access";
import { hashManageToken } from "@/lib/public-security";
import { zonedDateTimeToUtc } from "@/lib/domain";
import { searchAvailability, type AvailabilityResult, type ReservationChannel, type ReservationCombination, type ReservationInventoryBlock, type ReservationResource, type ReservationRule, type ReservationServicePeriod, type ReservationTable } from "@/lib/reservation-engine";

type VenueContext = {
  organizationId: string;
  venueId: string;
  venueSlug: string;
  timezone: string;
  periods: ReservationServicePeriod[];
  tables: ReservationTable[];
  combinations: ReservationCombination[];
  rules: ReservationRule[];
  resources: ReservationResource[];
  blocks: ReservationInventoryBlock[];
};

// Supabase's ungenerated client intentionally returns dynamic row shapes here;
// the mapping immediately below narrows each field into the engine contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rows<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function idempotentToken(purpose: "hold" | "manage", idempotencyKey: string) {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SERVER_SECRET_UNAVAILABLE");
  return createHmac("sha256", secret).update(`${purpose}:${idempotencyKey}`).digest("hex");
}

export async function loadVenueReservationContext(venueSlug: string, serviceDate: string): Promise<VenueContext> {
  const admin = createSupabaseAdminClient();
  // Expired holds remain in the ledger until the release job runs. Releasing
  // them before reading inventory keeps public availability deterministic even
  // when the scheduled cleanup has not run yet.
  await admin.rpc("release_expired_inventory_holds");
  const { data: venue, error: venueError } = await admin.from("outlets").select("id,organization_id,slug,timezone,active").eq("slug", venueSlug).maybeSingle();
  if (venueError || !venue || !venue.active) throw new Error("VENUE_NOT_FOUND");

  const [{ data: periodRows, error: periodError }, { data: areaRows, error: areaError }] = await Promise.all([
    admin.from("service_periods").select("id,venue_id,code,name,default_duration_minutes,slot_interval_minutes,booking_window_days,cutoff_minutes,configuration_version,active").eq("venue_id", venue.id).eq("active", true).order("code"),
    admin.from("dining_areas").select("id,resource_type,active").eq("outlet_id", venue.id),
  ]);
  if (periodError || areaError) throw new Error("VENUE_CONFIGURATION_UNAVAILABLE");
  const periods = rows(periodRows);
  const periodIds = periods.map((period) => period.id);
  const areaIds = rows(areaRows).filter((area) => area.active && area.resource_type === "main_dining").map((area) => area.id);

  const [scheduleResult, exceptionResult, tableResult, combinationResult, ruleResult, blockResult, resourceResult, featureResult] = await Promise.all([
    periodIds.length ? admin.from("service_schedules").select("service_period_id,day_of_week,local_start,local_end,effective_from,effective_to,active").in("service_period_id", periodIds).eq("active", true) : Promise.resolve({ data: [], error: null }),
    admin.from("service_exceptions").select("service_period_id,local_date,exception_type,local_start,local_end,reason,active").eq("venue_id", venue.id).eq("active", true).eq("local_date", serviceDate),
    areaIds.length ? admin.from("dining_tables").select("id,code,dining_area_id,minimum_capacity,maximum_capacity,priority,online_eligible,staff_eligible,active,active_from,active_to").in("dining_area_id", areaIds) : Promise.resolve({ data: [], error: null }),
    areaIds.length ? admin.from("table_combinations").select("id,name,dining_area_id,minimum_capacity,maximum_capacity,priority,online_eligible,staff_eligible,active,table_combination_members(table_id)").in("dining_area_id", areaIds).eq("active", true) : Promise.resolve({ data: [], error: null }),
    admin.from("reservation_rules").select("rule_type,priority,party_min,party_max,channel,effective_from,effective_to,value,active").eq("venue_id", venue.id).eq("active", true),
    admin.from("inventory_blocks").select("starts_at,ends_at,table_id,dining_area_id,service_period_id,active").eq("venue_id", venue.id).eq("active", true).gte("ends_at", zonedDateTimeToUtc(serviceDate, "00:00", venue.timezone).toISOString()).lt("starts_at", zonedDateTimeToUtc(addDays(new Date(`${serviceDate}T12:00:00Z`), 1).toISOString().slice(0, 10), "00:00", venue.timezone).toISOString()),
    admin.from("reservation_inventory_resources").select("table_id,starts_at,ends_at,resource_state").eq("venue_id", venue.id).in("resource_state", ["held", "active"]).gte("ends_at", zonedDateTimeToUtc(serviceDate, "00:00", venue.timezone).toISOString()).lt("starts_at", zonedDateTimeToUtc(addDays(new Date(`${serviceDate}T12:00:00Z`), 1).toISOString().slice(0, 10), "00:00", venue.timezone).toISOString()),
    admin.from("dining_table_features").select("table_id,table_features(code)").limit(1000),
  ]);
  if ([scheduleResult, exceptionResult, tableResult, combinationResult, ruleResult, blockResult, resourceResult, featureResult].some((result) => result.error)) throw new Error("VENUE_CONFIGURATION_UNAVAILABLE");

  const features = new Map<string, string[]>();
  for (const row of rows(featureResult.data)) {
    const code = Array.isArray(row.table_features) ? row.table_features[0]?.code : row.table_features?.code;
    if (code) features.set(row.table_id, [...(features.get(row.table_id) ?? []), code]);
  }
  const tables = rows(tableResult.data).map((table) => ({
    id: table.id, code: table.code, areaId: table.dining_area_id, minimumCapacity: table.minimum_capacity, maximumCapacity: table.maximum_capacity,
    priority: table.priority ?? 0, onlineEligible: table.online_eligible !== false, staffEligible: table.staff_eligible !== false, active: table.active !== false,
    activeFrom: table.active_from, activeTo: table.active_to, featureCodes: features.get(table.id) ?? [],
  }));
  const combinations = rows(combinationResult.data).map((combination) => ({
    id: combination.id, name: combination.name, areaId: combination.dining_area_id, minimumCapacity: combination.minimum_capacity, maximumCapacity: combination.maximum_capacity,
    priority: combination.priority ?? 0, onlineEligible: combination.online_eligible !== false, staffEligible: combination.staff_eligible !== false, active: combination.active !== false,
    memberTableIds: rows(combination.table_combination_members).map((member) => member.table_id).sort(),
  }));
  const schedulesByPeriod = new Map<string, typeof scheduleResult.data>();
  for (const schedule of rows(scheduleResult.data)) schedulesByPeriod.set(schedule.service_period_id, [...(schedulesByPeriod.get(schedule.service_period_id) ?? []), schedule]);
  const exceptionsByPeriod = new Map<string, typeof exceptionResult.data>();
  for (const exception of rows(exceptionResult.data)) if (exception.service_period_id) exceptionsByPeriod.set(exception.service_period_id, [...(exceptionsByPeriod.get(exception.service_period_id) ?? []), exception]);
  const mappedPeriods = periods.map((period) => ({
    id: period.id, venueId: period.venue_id, code: period.code, name: period.name, timezone: venue.timezone,
    defaultDurationMinutes: period.default_duration_minutes, slotIntervalMinutes: period.slot_interval_minutes, bookingWindowDays: period.booking_window_days,
    cutoffMinutes: period.cutoff_minutes, configurationVersion: period.configuration_version, schedules: rows(schedulesByPeriod.get(period.id)).map((schedule) => ({ dayOfWeek: schedule.day_of_week, localStart: schedule.local_start, localEnd: schedule.local_end, effectiveFrom: schedule.effective_from, effectiveTo: schedule.effective_to, active: schedule.active })),
    exceptions: rows(exceptionsByPeriod.get(period.id)).map((exception) => ({ localDate: exception.local_date, exceptionType: exception.exception_type, localStart: exception.local_start, localEnd: exception.local_end, reason: exception.reason, active: exception.active })),
  }));
  return {
    organizationId: venue.organization_id, venueId: venue.id, venueSlug: venue.slug, timezone: venue.timezone,
    periods: mappedPeriods, tables, combinations,
    rules: rows(ruleResult.data).map((rule) => ({ ruleType: rule.rule_type, priority: rule.priority, partyMin: rule.party_min, partyMax: rule.party_max, channel: rule.channel, effectiveFrom: rule.effective_from, effectiveTo: rule.effective_to, value: rule.value ?? {}, active: rule.active })) as ReservationRule[],
    resources: rows(resourceResult.data).map((resource) => ({ tableId: resource.table_id, startsAt: resource.starts_at, endsAt: resource.ends_at, state: resource.resource_state })),
    blocks: rows(blockResult.data).map((block) => ({ startsAt: block.starts_at, endsAt: block.ends_at, tableId: block.table_id, areaId: block.dining_area_id, servicePeriodId: block.service_period_id, active: block.active })),
  };
}

export async function searchVenueAvailability(venueSlug: string, input: { serviceDate: string; partySize: number; channel: ReservationChannel; preferredStart?: string; preferredEnd?: string; durationMinutes?: number; requiredFeatures?: string[] }): Promise<AvailabilityResult> {
  const context = await loadVenueReservationContext(venueSlug, input.serviceDate);
  const results = context.periods.map((period) => searchAvailability(period, context.tables, context.combinations, context.rules, context.resources, context.blocks, { ...input, venueId: context.venueId, servicePeriodId: period.id }));
  const slots = results.flatMap((result) => result.slots).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const first = results.find((result) => result.slots.length) ?? results[0] ?? { state: "unavailable" as const, configurationVersion: 1, slots: [], reason: "SERVICE_CLOSED" };
  return { ...first, state: slots.length === 0 ? "unavailable" : slots.length < 3 ? "limited" : "available", slots };
}

export async function createInventoryHold(input: { venueSlug: string; serviceDate: string; localTime: string; partySize: number; durationMinutes?: number; idempotencyKey: string }) {
  const context = await loadVenueReservationContext(input.venueSlug, input.serviceDate);
  const result = await searchVenueAvailability(input.venueSlug, { serviceDate: input.serviceDate, partySize: input.partySize, channel: "public", preferredStart: input.localTime, preferredEnd: input.localTime, durationMinutes: input.durationMinutes });
  const slot = result.slots[0];
  if (!slot) throw new Error("SLOT_NO_LONGER_AVAILABLE");
  // Deriving the opaque token from the idempotency key keeps a repeated hold
  // request replayable without storing a plaintext token in the database.
  const token = idempotentToken("hold", input.idempotencyKey);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_inventory_hold_atomic", {
    payload: { organization_id: context.organizationId, venue_id: context.venueId, service_period_id: result.servicePeriod?.id, starts_at: slot.startsAt, ends_at: slot.endsAt, party_size: input.partySize, hold_token_hash: hashManageToken(token), idempotency_key: input.idempotencyKey, configuration_version: result.configurationVersion, table_ids: slot.assignment.tableIds },
  });
  if (error) throw new Error(error.message.includes("SLOT_NO_LONGER_AVAILABLE") ? "SLOT_NO_LONGER_AVAILABLE" : "HOLD_COULD_NOT_BE_CREATED");
  return { token, hold: data, slot };
}

export async function finalizePublicReservation(input: { venueSlug: string; holdToken: string; idempotencyKey: string; fullName: string; mobile: string; email?: string; occasion?: string; specialRequests?: string; source?: string; termsAccepted: boolean; termsVersion?: string }) {
  const admin = createSupabaseAdminClient();
  // A finalized hold is intentionally no longer active. Check the reservation
  // idempotency record first so a retried confirmation returns the original
  // result instead of being mistaken for an expired hold.
  const { data: existing, error: existingError } = await admin
    .from("reservations")
    .select("*,outlets!inner(slug)")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingError) throw new Error("RESERVATION_LOOKUP_UNAVAILABLE");
  if (existing) {
    const existingVenue = Array.isArray(existing.outlets) ? existing.outlets[0]?.slug : existing.outlets?.slug;
    if (existingVenue !== input.venueSlug) throw new Error("RESERVATION_COULD_NOT_BE_CREATED");
    return { reservation: existing, manageToken: idempotentToken("manage", input.idempotencyKey) };
  }
  const { data: hold, error: holdError } = await admin.from("inventory_holds").select("id,organization_id,venue_id,starts_at,ends_at,party_size,service_period_id,configuration_version,state,expires_at").eq("hold_token_hash", hashManageToken(input.holdToken)).maybeSingle();
  if (holdError || !hold || hold.state !== "active" || new Date(hold.expires_at).getTime() <= Date.now()) throw new Error("HOLD_EXPIRED");
  const { data: venue, error: venueError } = await admin.from("outlets").select("id,slug").eq("id", hold.venue_id).eq("slug", input.venueSlug).maybeSingle();
  if (venueError || !venue) throw new Error("VENUE_NOT_FOUND");
  // The manage credential is deterministic per successful idempotency key, so
  // a retried finalize returns the same private link as the original response.
  const manageToken = idempotentToken("manage", input.idempotencyKey);
  const { data: reservation, error } = await admin.rpc("finalize_reservation_atomic", {
    payload: { organization_id: hold.organization_id, venue_id: hold.venue_id, service_period_id: hold.service_period_id, hold_id: hold.id, starts_at: hold.starts_at, ends_at: hold.ends_at, party_size: hold.party_size, channel: "public", actor_type: "guest", idempotency_key: input.idempotencyKey, full_name: input.fullName, mobile_display: input.mobile, email: input.email ?? "", occasion: input.occasion ?? "", special_requests: input.specialRequests ?? "", source: input.source ?? "Website", terms_accepted: input.termsAccepted, terms_version: input.termsVersion ?? "phase2-preview", public_manage_token_hash: hashManageToken(manageToken), policy_snapshot: { termsVersion: input.termsVersion ?? "phase2-preview" } },
  });
  if (error) {
    if (error.message.includes("SLOT_NO_LONGER_AVAILABLE")) throw new Error("SLOT_NO_LONGER_AVAILABLE");
    if (error.message.includes("HOLD_EXPIRED")) throw new Error("HOLD_EXPIRED");
    throw new Error("RESERVATION_COULD_NOT_BE_CREATED");
  }
  return { reservation, manageToken };
}
