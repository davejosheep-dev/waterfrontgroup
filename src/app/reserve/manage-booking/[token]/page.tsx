"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, ShieldCheck, XCircle } from "lucide-react";

type ReservationView = { confirmationCode: string; status: string; startsAt: string; endsAt: string; partySize: number; occasion?: string; venue?: string; guestFirstName?: string };

export default function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [reservation, setReservation] = useState<ReservationView | null>(null);
  const [error, setError] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [done, setDone] = useState(false);
  async function load(value: string) {
    const response = await fetch(`/api/v1/public/reservations/manage/${value}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) setError(payload.error ?? "Reservation not found."); else setReservation(payload.reservation);
  }

  useEffect(() => { void params.then(({ token: value }) => { setToken(value); void load(value); }); }, [params]);

  async function cancel() {
    if (!token || !window.confirm("Cancel this reservation?")) return;
    setCanceling(true); setError("");
    const response = await fetch(`/api/v1/public/reservations/manage/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", reason: "Guest cancelled online" }) });
    const payload = await response.json();
    if (!response.ok) setError(payload.error ?? "Cancellation was not completed."); else { setDone(true); setReservation((current) => current ? { ...current, status: "cancelled" } : current); }
    setCanceling(false);
  }

  return <main className="min-h-screen bg-[#f6f6f1] px-5 py-12 text-[#173f3a] sm:px-8 sm:py-20"><section className="mx-auto max-w-xl rounded-2xl border border-[#dce3dc] bg-white p-7 shadow-[0_24px_70px_rgba(22,61,55,.09)] sm:p-10"><div className="text-[11px] font-bold uppercase tracking-[.18em] text-[#d87c00]">Waterfront reservations</div>{error ? <><div className="mt-7 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700"><XCircle size={26} /></div><h1 className="mt-5 font-display text-3xl">Reservation unavailable</h1><p className="mt-3 text-sm leading-6 text-[#64736f]">{error}</p></> : reservation ? <><div className="mt-7 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={26} /></div><h1 className="mt-5 font-display text-3xl">{done || reservation.status === "cancelled" ? "Reservation cancelled" : `See you soon${reservation.guestFirstName ? `, ${reservation.guestFirstName}` : ""}.`}</h1><p className="mt-3 text-sm leading-6 text-[#64736f]">{reservation.venue ?? "Waterfront"} · secure reservation details</p><div className="mt-7 rounded-xl bg-[#173f3a] p-5 text-white"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-white/55">Confirmation code</div><div className="mt-2 font-display text-3xl tracking-wide">{reservation.confirmationCode}</div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-xs"><div><CalendarDays size={14} className="mr-1.5 inline text-[#e59a36]" />{new Date(reservation.startsAt).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" })}</div><div><Clock3 size={14} className="mr-1.5 inline text-[#e59a36]" />{new Date(reservation.startsAt).toLocaleTimeString("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" })}</div></div></div><div className="mt-6 flex items-start gap-3 rounded-xl border border-[#e1e8e1] bg-[#f7faf6] p-4 text-xs leading-5 text-[#64736f]"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#1f6a5f]" />This private link is the access credential. Do not forward it to anyone you do not trust.</div>{!done && reservation.status !== "cancelled" && <button onClick={cancel} disabled={canceling} className="mt-7 min-h-11 w-full rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">{canceling ? "Cancelling…" : "Cancel reservation"}</button>}</> : <p className="mt-8 text-sm text-[#64736f]">Loading your secure reservation…</p>}</section></main>;
}
