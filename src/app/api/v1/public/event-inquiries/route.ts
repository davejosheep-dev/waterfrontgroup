import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readEventCommandId } from "@/lib/event-api.server";

const publicSchema = z.object({
  organizationId: z.uuid(),
  venueId: z.uuid(),
  contactName: z.string().trim().min(2).max(160),
  contactEmail: z.string().email().max(160).optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
  eventName: z.string().max(160).optional(),
  requestedStartsAt: z.iso.datetime({ offset: true }),
  requestedEndsAt: z.iso.datetime({ offset: true }),
  expectedGuests: z.number().int().min(1).max(1000),
  preferredSpaceIds: z.array(z.uuid()).max(12).default([]),
  budget: z.number().nonnegative().optional(),
  requirements: z.record(z.string(), z.unknown()).default({}),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const parsed = publicSchema.safeParse(await request.json());
  if (!parsed.success || new Date(parsed.data.requestedEndsAt) <= new Date(parsed.data.requestedStartsAt)) return NextResponse.json({ error: "Please review the event date, time, and contact details.", code: "INVALID_REQUEST" }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_event_inquiry_atomic", { payload: {
    organization_id: parsed.data.organizationId,
    venue_id: parsed.data.venueId,
    contact_name: parsed.data.contactName,
    contact_email: parsed.data.contactEmail || null,
    contact_phone: parsed.data.contactPhone || null,
    event_name: parsed.data.eventName || null,
    source: "website",
    requested_starts_at: parsed.data.requestedStartsAt,
    requested_ends_at: parsed.data.requestedEndsAt,
    expected_guests: parsed.data.expectedGuests,
    preferred_space_ids: parsed.data.preferredSpaceIds,
    budget: parsed.data.budget ?? null,
    currency: "PHP",
    requirements: parsed.data.requirements,
    idempotency_key: readEventCommandId(request),
  } });
  if (error || !data) return NextResponse.json({ error: "We could not submit your event inquiry. Please contact Waterfront directly.", code: "EVENT_INQUIRY_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ inquiry: { id: data.id, stage: data.stage, receivedAt: data.created_at } }, { status: 201, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
