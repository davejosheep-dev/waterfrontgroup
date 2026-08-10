import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  nextStatus: z.enum(["draft", "temporary_hold", "pending_confirmation", "pending_deposit", "confirmed", "arrived", "seated", "completed", "expired", "cancelled", "no_show"]),
  reason: z.string().trim().max(400).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ reservationId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid reservation transition.", code: "INVALID_REQUEST" }, { status: 400 });
  const { reservationId } = await context.params;
  const { data, error } = await supabase.rpc("transition_reservation_status_v2", { target_reservation: reservationId, next_status: parsed.data.nextStatus, reason: parsed.data.reason ?? null });
  if (error) {
    if (error.message.includes("Not authorized")) return NextResponse.json({ error: "Your role cannot change this reservation.", code: "FORBIDDEN" }, { status: 403 });
    if (error.message.includes("Invalid reservation status transition")) return NextResponse.json({ error: "That status change is not allowed from the current state.", code: "INVALID_TRANSITION" }, { status: 409 });
    return NextResponse.json({ error: "The reservation status could not be updated.", code: "TRANSITION_FAILED" }, { status: 400 });
  }
  return NextResponse.json({ reservation: { id: data.id, confirmationCode: data.code, status: data.status, updatedAt: data.updated_at } }, { headers: { "Cache-Control": "no-store" } });
}
