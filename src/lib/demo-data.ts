import type { Reservation } from "./domain";

export const demoReservations: Reservation[] = [
  { id: "1", code: "WF-260807-014", guestName: "Camille Santos", guestCount: 4, mobile: "+63 917 555 0124", bookingType: "regular_table", area: "Main Dining", date: "2026-08-07", start: "11:30", durationMinutes: 120, status: "confirmed", source: "Instagram", table: "M4 · Window", occasion: "Birthday", deposit: "not_required", owner: "Mika" },
  { id: "2", code: "WF-260807-015", guestName: "Adrian Lim", guestCount: 12, mobile: "+63 918 322 4410", bookingType: "large_party", area: "Main Dining", date: "2026-08-07", start: "13:00", durationMinutes: 150, status: "pending_deposit", source: "Facebook Messenger", table: "M1 + M2", occasion: "Team lunch", deposit: "pending", confirmationDueAt: "2026-08-06T13:00:00+08:00", owner: "Paolo" },
  { id: "3", code: "WF-260807-016", guestName: "Isabel Villanueva", guestCount: 6, mobile: "+63 917 810 9098", bookingType: "vip_room", area: "VIP Room", date: "2026-08-07", start: "18:00", durationMinutes: 240, status: "confirmed", source: "Phone", occasion: "Anniversary", deposit: "paid", owner: "Mika" },
  { id: "4", code: "WF-260807-017", guestName: "Luis & Mara Robles", guestCount: 2, mobile: "+63 905 221 8819", bookingType: "regular_table", area: "Main Dining", date: "2026-08-07", start: "18:30", durationMinutes: 120, status: "temporary_hold", source: "WhatsApp", occasion: "Date night", deposit: "not_required", confirmationDueAt: "2026-08-07T12:00:00+08:00", owner: "Paolo" },
  { id: "5", code: "WF-260807-018", guestName: "Grace Ong", guestCount: 8, mobile: "+63 920 448 1299", bookingType: "regular_table", area: "Main Dining", date: "2026-08-07", start: "19:30", durationMinutes: 120, status: "confirmed", source: "Viber", deposit: "not_required", owner: "Mika" },
];

export const inquirySources = ["Website", "Facebook Messenger", "Instagram", "WhatsApp", "Viber", "Phone", "Landline", "Email", "Walk-in", "Referral", "Corporate account", "Other"];

export const statusLabel: Record<string, string> = {
  draft: "Draft", temporary_hold: "Temporary hold", pending_confirmation: "Pending confirmation",
  pending_deposit: "Pending deposit", confirmed: "Confirmed", arrived: "Arrived", seated: "Seated",
  completed: "Completed", expired: "Expired", cancelled: "Cancelled", no_show: "No-show",
};
