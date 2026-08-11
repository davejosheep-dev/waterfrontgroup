import "server-only";

import { createHash, randomUUID } from "node:crypto";

export type EventDocument = {
  id: string;
  event_id: string;
  proposal_id?: string | null;
  file_name: string;
  storage_path: string;
  document_type: string;
  checksum?: string | null;
  scan_status: "pending" | "clean" | "blocked";
  visibility: "staff" | "finance" | "client";
  source_type?: "upload" | "generated" | null;
  mime_type?: string | null;
  byte_size?: number | null;
  document_version?: number | null;
  created_by?: string | null;
  created_at: string;
  signed_url?: string | null;
};

export const eventDocumentTypes = ["quotation", "agreement", "beo", "invoice", "attachment", "other"] as const;
export type EventDocumentType = (typeof eventDocumentTypes)[number];

export const allowedEventFileTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const eventFileLimitBytes = 10 * 1024 * 1024;

export function safeDocumentFileName(value: string, fallback = "event-document") {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function eventStoragePath(organizationId: string, eventId: string, fileName: string) {
  return `${organizationId}/${eventId}/${randomUUID()}-${safeDocumentFileName(fileName)}`;
}

type PdfEvent = {
  name: string;
  startsAt: string;
  endsAt: string;
  guests: number;
  currency: string;
  quotedTotal: number;
  balanceDue: number;
  contactName?: string | null;
  contactEmail?: string | null;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>;
};

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

function pdfText(text: string, x: number, y: number, size: number, color = "0.12 0.20 0.20") {
  return `${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`;
}

function pdfRect(x: number, y: number, width: number, height: number, color: string) {
  return `${color} rg ${x} ${y} ${width} ${height} re f`;
}

function formatMoney(value: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(value || 0)}`;
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
}

function makePdfContent(event: PdfEvent) {
  const lines: string[] = [];
  lines.push(pdfRect(0, 692, 612, 100, "0.07 0.25 0.23"));
  lines.push(pdfText("WATERFRONT", 48, 748, 25, "1 1 1"));
  lines.push(pdfText("HOSPITALITY GROUP", 49, 730, 8, "0.93 0.65 0.25"));
  lines.push(pdfText("EVENT QUOTATION", 410, 747, 11, "1 1 1"));
  lines.push(pdfText("Prepared for planning and client review", 375, 730, 7, "0.82 0.90 0.88"));

  lines.push(pdfText(event.name || "Private event", 48, 651, 21));
  lines.push(pdfText("Quotation snapshot", 49, 632, 9, "0.35 0.43 0.42"));
  lines.push(pdfRect(48, 560, 516, 52, "0.95 0.97 0.96"));
  lines.push(pdfText("EVENT DATE", 62, 592, 7, "0.35 0.43 0.42"));
  lines.push(pdfText(formatEventDate(event.startsAt), 62, 576, 10));
  lines.push(pdfText("GUESTS", 278, 592, 7, "0.35 0.43 0.42"));
  lines.push(pdfText(`${event.guests} people`, 278, 576, 10));
  lines.push(pdfText("CONTACT", 430, 592, 7, "0.35 0.43 0.42"));
  lines.push(pdfText(event.contactName || "Event contact", 430, 576, 9));
  if (event.contactEmail) lines.push(pdfText(event.contactEmail, 430, 562, 7, "0.35 0.43 0.42"));

  let y = 516;
  lines.push(pdfText("SCOPE & PRICING", 48, y, 9, "0.07 0.25 0.23"));
  y -= 20;
  lines.push(pdfRect(48, y - 9, 516, 22, "0.07 0.25 0.23"));
  lines.push(pdfText("DESCRIPTION", 62, y, 7, "1 1 1"));
  lines.push(pdfText("QTY", 390, y, 7, "1 1 1"));
  lines.push(pdfText("AMOUNT", 478, y, 7, "1 1 1"));
  y -= 28;
  const items = event.lineItems.length ? event.lineItems : [{ description: "Event package estimate", quantity: 1, unitPrice: event.quotedTotal, lineTotal: event.quotedTotal }];
  for (const item of items.slice(0, 12)) {
    lines.push(pdfText(item.description.slice(0, 54), 62, y, 9));
    lines.push(pdfText(String(item.quantity), 398, y, 9));
    lines.push(pdfText(formatMoney(item.lineTotal || item.quantity * item.unitPrice, event.currency), 470, y, 9));
    lines.push(`0.85 0.88 0.87 RG 48 ${y - 9} m 564 ${y - 9} l S`);
    y -= 23;
  }
  y -= 4;
  lines.push(pdfText("QUOTED TOTAL", 360, y, 8, "0.35 0.43 0.42"));
  lines.push(pdfText(formatMoney(event.quotedTotal, event.currency), 470, y, 12, "0.07 0.25 0.23"));
  y -= 22;
  lines.push(pdfText("BALANCE DUE", 360, y, 8, "0.35 0.43 0.42"));
  lines.push(pdfText(formatMoney(event.balanceDue, event.currency), 470, y, 11, "0.82 0.40 0.08"));

  lines.push(pdfRect(48, 100, 516, 56, "0.98 0.95 0.89"));
  lines.push(pdfText("NEXT STEPS", 62, 136, 8, "0.50 0.28 0.08"));
  lines.push(pdfText("Confirm scope, menu, schedule, and payment terms with your Waterfront events host.", 62, 119, 8, "0.35 0.28 0.20"));
  lines.push(pdfText("This document is a planning quotation and is not a final tax invoice.", 62, 106, 7, "0.45 0.36 0.28"));
  lines.push(pdfText("Waterfront Hospitality Group | Iloilo | waterfrontiloilo.com", 48, 52, 7, "0.35 0.43 0.42"));
  lines.push(pdfText(`Generated ${formatEventDate(new Date().toISOString())}`, 419, 52, 7, "0.35 0.43 0.42"));
  return lines.join("\n");
}

function buildPdfDocument(content: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];
  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, "utf8"));
  }
  const startXref = Buffer.concat(chunks).length;
  const xref = [`xref`, `0 ${objects.length + 1}`, "0000000000 65535 f "];
  for (const offset of offsets.slice(1)) xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
  chunks.push(Buffer.from(`${xref.join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`, "utf8"));
  return Buffer.concat(chunks);
}

export function buildEventQuotationPdf(event: PdfEvent) {
  return buildPdfDocument(makePdfContent(event));
}
