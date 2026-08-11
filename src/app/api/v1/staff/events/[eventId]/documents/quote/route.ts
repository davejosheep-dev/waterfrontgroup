import { NextRequest, NextResponse } from "next/server";
import { buildEventQuotationPdf, eventStoragePath, safeDocumentFileName, sha256Hex } from "@/lib/event-documents.server";
import { eventErrorResponse, requireEventAuth } from "@/lib/event-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable(message = "Quotation documents are temporarily unavailable.") {
  return NextResponse.json({ error: message, code: "EVENT_DOCUMENTS_UNAVAILABLE" }, { status: 503 });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { eventId } = await params;
  const { data: event, error: eventError } = await auth.supabase
    .from("events")
    .select("id,organization_id,venue_id,inquiry_id,name,starts_at,ends_at,expected_headcount,currency,quoted_total,balance_due")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) return unavailable();
  if (!event) return NextResponse.json({ error: "Event not found.", code: "EVENT_NOT_FOUND" }, { status: 404 });

  const [{ data: inquiry }, { data: proposal }, { data: existingDocuments, error: documentQueryError }] = await Promise.all([
    event.inquiry_id
      ? auth.supabase.from("event_inquiries").select("contact_name,contact_email").eq("id", event.inquiry_id).maybeSingle()
      : Promise.resolve({ data: null }),
    auth.supabase.from("event_proposals").select("id,version,currency,total,deposit_due").eq("event_id", event.id).order("version", { ascending: false }).limit(1).maybeSingle(),
    auth.supabase.from("event_documents").select("document_version").eq("event_id", event.id).eq("document_type", "quotation").order("document_version", { ascending: false }).limit(1),
  ]);
  if (documentQueryError) return unavailable();

  const { data: lineItems, error: lineItemsError } = proposal
    ? await auth.supabase.from("event_proposal_line_items").select("description,quantity,unit_price,line_total").eq("proposal_id", proposal.id).order("created_at")
    : { data: [], error: null };
  if (lineItemsError) return unavailable();

  const currency = proposal?.currency || event.currency || "PHP";
  const quotedTotal = Number(proposal?.total ?? event.quoted_total ?? 0);
  const balanceDue = Number(event.balance_due ?? quotedTotal);
  const pdf = buildEventQuotationPdf({
    name: event.name,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    guests: event.expected_headcount,
    currency,
    quotedTotal,
    balanceDue,
    contactName: inquiry?.contact_name,
    contactEmail: inquiry?.contact_email,
    lineItems: (lineItems ?? []).map((item) => ({ description: item.description, quantity: Number(item.quantity), unitPrice: Number(item.unit_price), lineTotal: Number(item.line_total) })),
  });
  const version = Number(existingDocuments?.[0]?.document_version ?? 0) + 1;
  const baseName = safeDocumentFileName(event.name || "event") || "event";
  const fileName = `${baseName}-quotation-v${version}.pdf`;
  const bytes = new Uint8Array(pdf);
  const storagePath = eventStoragePath(event.organization_id, event.id, fileName);
  const storage = auth.supabase.storage.from("event-files");
  const upload = await storage.upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) return unavailable("The event-files storage bucket is not ready yet. Apply the Events document migration before generating files.");

  const { data: document, error: documentError } = await auth.supabase
    .from("event_documents")
    .insert({
      organization_id: event.organization_id,
      venue_id: event.venue_id,
      event_id: event.id,
      proposal_id: proposal?.id ?? null,
      file_name: fileName,
      storage_path: storagePath,
      document_type: "quotation",
      checksum: sha256Hex(bytes),
      scan_status: "clean",
      visibility: "client",
      source_type: "generated",
      mime_type: "application/pdf",
      byte_size: bytes.byteLength,
      document_version: version,
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (documentError) {
    await storage.remove([storagePath]);
    return eventErrorResponse(documentError, "The quotation could not be saved as an event document.");
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Event-Document-Id": document.id,
    },
  });
}
