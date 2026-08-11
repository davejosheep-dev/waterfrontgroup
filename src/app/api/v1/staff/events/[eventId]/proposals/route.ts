import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventErrorResponse, requireEventAuth } from "@/lib/event-api.server";

const proposalSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/).default("PHP"),
  depositDue: z.number().nonnegative().default(0),
  termsSnapshot: z.record(z.string(), z.unknown()).default({}),
  lineItems: z.array(z.object({ description: z.string().trim().min(1).max(240), quantity: z.number().positive(), unit: z.string().max(30).default("item"), unitPrice: z.number().nonnegative(), discountAmount: z.number().nonnegative().default(0), taxRate: z.number().min(0).max(100).default(0), serviceChargeRate: z.number().min(0).max(100).default(0) })).min(1).max(100),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { eventId } = await params;
  const { data, error } = await auth.supabase.from("event_proposals").select("id,event_id,version,status,currency,calculation_version,subtotal,discount_total,tax_total,service_charge_total,total,deposit_due,terms_snapshot,issued_at,accepted_at,accepted_by,created_at,event_proposal_line_items(id,description,quantity,unit,unit_price,discount_amount,tax_rate,service_charge_rate,line_total,snapshot)").eq("event_id", eventId).order("version", { ascending: false });
  if (error) return NextResponse.json({ error: "Proposals are temporarily unavailable.", code: "PROPOSAL_DATA_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ proposals: data ?? [] }, { headers: { "Cache-Control": "private, max-age=5" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { eventId } = await params;
  const parsed = proposalSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Add at least one valid proposal line item.", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const { data, error } = await auth.supabase.rpc("create_event_proposal_atomic", { payload: { event_id: eventId, currency: parsed.data.currency, deposit_due: parsed.data.depositDue, terms_snapshot: parsed.data.termsSnapshot, line_items: parsed.data.lineItems.map((item) => ({ description: item.description, quantity: item.quantity, unit: item.unit, unit_price: item.unitPrice, discount_amount: item.discountAmount, tax_rate: item.taxRate, service_charge_rate: item.serviceChargeRate })) } });
    if (error || !data) return eventErrorResponse(error, "The proposal draft could not be created.");
    return NextResponse.json({ proposal: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return eventErrorResponse(error, "The proposal draft could not be created."); }
}
