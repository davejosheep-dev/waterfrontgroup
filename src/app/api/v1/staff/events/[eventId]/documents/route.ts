import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eventDocumentTypes, eventFileLimitBytes, allowedEventFileTypes, eventStoragePath, safeDocumentFileName, sha256Hex } from "@/lib/event-documents.server";
import { eventErrorResponse, requireEventAuth } from "@/lib/event-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const documentTypeSchema = z.enum(eventDocumentTypes).default("attachment");
const visibilitySchema = z.enum(["staff", "finance", "client"]).default("staff");

function unavailable(message = "Event documents are temporarily unavailable.") {
  return NextResponse.json({ error: message, code: "EVENT_DOCUMENTS_UNAVAILABLE" }, { status: 503 });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { eventId } = await params;
  const { data, error } = await auth.supabase
    .from("event_documents")
    .select("id,event_id,proposal_id,file_name,storage_path,document_type,checksum,scan_status,visibility,source_type,mime_type,byte_size,document_version,created_by,created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) return unavailable();

  const documents = await Promise.all((data ?? []).map(async (document) => {
    const signed = await auth.supabase.storage.from("event-files").createSignedUrl(document.storage_path, 60 * 60);
    return { ...document, signed_url: signed.data?.signedUrl ?? null };
  }));
  return NextResponse.json({ documents }, { headers: { "Cache-Control": "private, max-age=5" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireEventAuth();
  if ("response" in auth) return auth.response;
  const { eventId } = await params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to attach.", code: "FILE_REQUIRED" }, { status: 400 });
  if (!allowedEventFileTypes.includes(file.type as (typeof allowedEventFileTypes)[number])) {
    return NextResponse.json({ error: "Use a PDF, JPEG, PNG, WebP, or DOCX file.", code: "FILE_TYPE_NOT_ALLOWED" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > eventFileLimitBytes) {
    return NextResponse.json({ error: "Files must be smaller than 10 MB.", code: "FILE_TOO_LARGE" }, { status: 400 });
  }

  const { data: event, error: eventError } = await auth.supabase
    .from("events")
    .select("id,organization_id,venue_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) return unavailable();
  if (!event) return NextResponse.json({ error: "Event not found.", code: "EVENT_NOT_FOUND" }, { status: 404 });

  const documentType = documentTypeSchema.safeParse(String(form.get("documentType") || "attachment")).data ?? "attachment";
  const visibility = visibilitySchema.safeParse(String(form.get("visibility") || "staff")).data ?? "staff";
  const fileName = safeDocumentFileName(file.name, "event-attachment");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const storagePath = eventStoragePath(event.organization_id, event.id, fileName);
  const storage = auth.supabase.storage.from("event-files");
  const upload = await storage.upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (upload.error) return eventErrorResponse(upload.error, "The attachment could not be uploaded.");

  const { data: latest } = await auth.supabase
    .from("event_documents")
    .select("document_version")
    .eq("event_id", event.id)
    .eq("document_type", documentType)
    .order("document_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const documentVersion = Number(latest?.document_version ?? 0) + 1;
  const { data: document, error: documentError } = await auth.supabase
    .from("event_documents")
    .insert({
      organization_id: event.organization_id,
      venue_id: event.venue_id,
      event_id: event.id,
      proposal_id: String(form.get("proposalId") || "") || null,
      file_name: fileName,
      storage_path: storagePath,
      document_type: documentType,
      checksum: sha256Hex(bytes),
      scan_status: "pending",
      visibility,
      source_type: "upload",
      mime_type: file.type,
      byte_size: file.size,
      document_version: documentVersion,
      created_by: auth.user.id,
    })
    .select("id,event_id,proposal_id,file_name,storage_path,document_type,checksum,scan_status,visibility,source_type,mime_type,byte_size,document_version,created_by,created_at")
    .single();
  if (documentError) {
    await storage.remove([storagePath]);
    return eventErrorResponse(documentError, "The attachment metadata could not be saved.");
  }
  const signed = await storage.createSignedUrl(storagePath, 60 * 60);
  return NextResponse.json({ document: { ...document, signed_url: signed.data?.signedUrl ?? null } }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
