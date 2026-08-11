export const floorPresentationStates = [
  "inactive",
  "blocked",
  "seated",
  "needs_clearing",
  "arrived",
  "soon",
  "available",
] as const;

export type FloorPresentationState = (typeof floorPresentationStates)[number];
export type FloorInventoryState = "free" | "occupied" | "held" | "blocked" | "inactive";
export type FloorSessionState = "planned" | "active" | "clearing" | "cleared" | "voided";

export type FloorProjectionInput = {
  active: boolean;
  inventoryState?: FloorInventoryState;
  hasActiveOverride?: boolean;
  sessionState?: FloorSessionState | null;
  arrivedCount?: number;
  reservationStartsAt?: string | null;
  now?: Date | string;
  soonMinutes?: number;
};

/**
 * Table colour is derived from the operational facts, never persisted as a
 * second source of truth.  The ordering intentionally mirrors the host's
 * mental model: safety/availability wins over the next booking.
 */
export function deriveTablePresentationState(input: FloorProjectionInput): FloorPresentationState {
  if (!input.active || input.inventoryState === "inactive") return "inactive";
  if (input.hasActiveOverride || input.inventoryState === "blocked") return "blocked";
  if (input.sessionState === "active") return "seated";
  if (input.sessionState === "clearing") return "needs_clearing";
  if ((input.arrivedCount ?? 0) > 0) return "arrived";
  if (input.reservationStartsAt) {
    const now = input.now ? new Date(input.now).getTime() : Date.now();
    const starts = new Date(input.reservationStartsAt).getTime();
    const soon = (input.soonMinutes ?? 45) * 60_000;
    if (Number.isFinite(starts) && starts >= now && starts - now <= soon) return "soon";
  }
  return "available";
}

export function validateArrivalCount(arrivedCount: number, partySize: number) {
  if (!Number.isInteger(arrivedCount) || arrivedCount < 0) return { valid: false, reason: "Arrival count cannot be negative." } as const;
  if (!Number.isInteger(partySize) || partySize < 1) return { valid: false, reason: "Party size must be at least one." } as const;
  if (arrivedCount > partySize) return { valid: false, reason: "Arrival count cannot exceed the party size." } as const;
  return { valid: true } as const;
}

export function validateTableAssignment(tableIds: string[], capacity: number, partySize: number) {
  const uniqueIds = [...new Set(tableIds.filter(Boolean))];
  if (!uniqueIds.length) return { valid: false, reason: "Choose at least one active table." } as const;
  if (uniqueIds.length !== tableIds.length) return { valid: false, reason: "A table cannot be assigned twice." } as const;
  if (capacity < partySize) return { valid: false, reason: "The selected tables do not have enough seats." } as const;
  return { valid: true, tableIds: uniqueIds } as const;
}

export type AssignmentWindow = { tableId: string; startsAt: string; endsAt: string };

/** Returns the physical tables that would overlap a proposed assignment. */
export function findAssignmentConflicts(existing: AssignmentWindow[], proposed: AssignmentWindow[]) {
  const conflicts = new Set<string>();
  for (const candidate of proposed) {
    const candidateStart = new Date(candidate.startsAt).getTime();
    const candidateEnd = new Date(candidate.endsAt).getTime();
    for (const current of existing) {
      if (current.tableId !== candidate.tableId) continue;
      const currentStart = new Date(current.startsAt).getTime();
      const currentEnd = new Date(current.endsAt).getTime();
      if (candidateStart < currentEnd && currentStart < candidateEnd) conflicts.add(candidate.tableId);
    }
  }
  return [...conflicts];
}

export function formatFloorStateLabel(state: FloorPresentationState) {
  return {
    inactive: "Unavailable",
    blocked: "Blocked",
    seated: "Seated",
    needs_clearing: "Needs clearing",
    arrived: "Arrived",
    soon: "Reserved soon",
    available: "Available",
  }[state];
}

