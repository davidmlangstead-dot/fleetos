import { Router, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { config } from "../../config.js";
import { requireRoles } from "../../middleware/auth.js";

export const brandedDocumentsRouter = Router();
const office = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");

type CompanyHeader = { name: string; address: string | null; postcode: string | null; phone: string | null; vatNumber: string | null };
type Jpeg = { data: Buffer; width: number; height: number };

function escapePdf(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replace(/[^\x20-\x7E]/g, "?");
}
function money(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((pence || 0) / 100);
}
function date(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "-";
}
function textValue(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "Not completed";
  return String(value);
}

function jpegSize(data: Buffer) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let index = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (index + 9 < data.length) {
    if (data[index] !== 0xff) { index += 1; continue; }
    const marker = data[index + 1];
    index += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (index + 2 > data.length) break;
    const length = data.readUInt16BE(index);
    if (length < 2 || index + length > data.length) break;
    if (sofMarkers.has(marker)) return { height: data.readUInt16BE(index + 3), width: data.readUInt16BE(index + 5) };
    index += length;
  }
  return null;
}

async function companyHeader(companyId: string) {
  return (await prisma.$queryRaw<CompanyHeader[]>`
    SELECT name,address,postcode,phone,"vatNumber" FROM "Company" WHERE id=${companyId} LIMIT 1
  `)[0];
}

async function companyLogo(companyId: string): Promise<Jpeg | null> {
  if (!config.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.storage.from("fleet-documents").download(companyId + "/branding/document-logo.jpg");
    if (error || !data) return null;
    const buffer = Buffer.from(await data.arrayBuffer());
    const size = jpegSize(buffer);
    return size ? { data: buffer, width: size.width, height: size.height } : null;
  } catch {
    return null;
  }
}

function buildPdf(args: { title: string; company: CompanyHeader; reference: string; lines: string[]; logo: Jpeg | null }) {
  const header = [
    args.company.name,
    [args.company.address, args.company.postcode].filter(Boolean).join(", "),
    args.company.phone ? "Tel: " + args.company.phone : "",
    args.company.vatNumber ? "VAT: " + args.company.vatNumber : "",
    "",
    args.title,
    "Reference: " + args.reference,
    "",
  ];
  const sourceLines = [...header, ...args.lines].filter((value) => value !== "");
  const wrapped = sourceLines.flatMap((line) => {
    const value = String(line);
    if (value.length <= 88) return [value];
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += 88) chunks.push(value.slice(i, i + 88));
    return chunks;
  }).slice(0, 62);

  const hasLogo = Boolean(args.logo);
  const imageObjectNumber = hasLogo ? 5 : 0;
  const contentObjectNumber = hasLogo ? 6 : 5;
  const commands: string[] = [];

  if (args.logo) {
    const maxWidth = 150;
    const maxHeight = 65;
    const scale = Math.min(maxWidth / args.logo.width, maxHeight / args.logo.height);
    const width = Math.max(1, args.logo.width * scale);
    const height = Math.max(1, args.logo.height * scale);
    commands.push("q");
    commands.push(width.toFixed(2) + " 0 0 " + height.toFixed(2) + " 50 " + (790 - height).toFixed(2) + " cm");
    commands.push("/Im1 Do");
    commands.push("Q");
  }

  commands.push("BT");
  commands.push("/F1 10 Tf");
  commands.push("50 " + (hasLogo ? 715 : 790) + " Td");
  commands.push("14 TL");
  wrapped.forEach((line, index) => {
    commands.push((index === 0 ? "" : "T* ") + "(" + escapePdf(line) + ") Tj");
  });
  commands.push("ET");

  const content = Buffer.from(commands.join("\n"));
  const resources = hasLogo
    ? "<< /Font << /F1 4 0 R >> /XObject << /Im1 " + imageObjectNumber + " 0 R >> >>"
    : "<< /Font << /F1 4 0 R >> >>";
  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources " + resources + " /Contents " + contentObjectNumber + " 0 R >>"),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];

  if (args.logo) {
    const imageHeader = "<< /Type /XObject /Subtype /Image /Width " + args.logo.width + " /Height " + args.logo.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + args.logo.data.length + " >>\nstream\n";
    objects.push(Buffer.concat([Buffer.from(imageHeader), args.logo.data, Buffer.from("\nendstream")]));
  }
  objects.push(Buffer.concat([Buffer.from("<< /Length " + content.length + " >>\nstream\n"), content, Buffer.from("\nendstream")]));

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  let currentSize = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(currentSize);
    const part = Buffer.concat([Buffer.from(String(index + 1) + " 0 obj\n"), object, Buffer.from("\nendobj\n")]);
    parts.push(part);
    currentSize += part.length;
  });
  const xref = currentSize;
  let tail = "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => { tail += String(offset).padStart(10, "0") + " 00000 n \n"; });
  tail += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  parts.push(Buffer.from(tail));
  return Buffer.concat(parts);
}

function sendPdf(res: Response, pdf: Buffer, filename: string) {
  const safe = filename.replace(/[^a-z0-9_.-]/gi, "-");
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", "attachment; filename=\"" + safe + "\"");
  res.send(pdf);
}

brandedDocumentsRouter.get("/jobs/:id/report.pdf", office, asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = req.params.id;
  const job = (await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT j.id,j."jobNumber" AS reference,j.title,j.status::text,j."scheduledStart",j."completedAt",j."worksheetSchema",j."worksheetResponses",j."customerSignature",
      COALESCE(cu.name,j."customerName") AS "customerName",s.name AS "siteName",COALESCE(s.address,j."collectionAddress") AS "siteAddress",COALESCE(s.postcode,j."collectionPostcode") AS "sitePostcode",v.registration
    FROM "Job" j LEFT JOIN "Customer" cu ON cu.id=j."customerId" LEFT JOIN "CustomerSite" s ON s.id=j."siteId" LEFT JOIN "Vehicle" v ON v.id=j."vehicleId"
    WHERE j.id=${id} AND j."companyId"=${companyId} LIMIT 1
  `)[0];
  if (!job) return res.status(404).json({ error: "Job not found" });
  const company = await companyHeader(companyId);
  if (!company) return res.status(404).json({ error: "Company not found" });
  const logo = await companyLogo(companyId);
  const schema = (job.worksheetSchema ?? []) as Array<{ key: string; label: string }>;
  const answers = (job.worksheetResponses ?? {}) as Record<string, unknown>;
  const signature = (job.customerSignature ?? {}) as Record<string, unknown>;
  const lines = [
    "Job: " + textValue(job.title),
    "Customer: " + textValue(job.customerName),
    "Site: " + [job.siteName, job.siteAddress, job.sitePostcode].filter(Boolean).join(", "),
    "Vehicle: " + textValue(job.registration ?? "Not allocated"),
    "Status: " + textValue(job.status),
    "Scheduled: " + date(job.scheduledStart as string | null),
    "Completed: " + date(job.completedAt as string | null),
    "",
    "Work completed",
    ...schema.map((field) => field.label + ": " + textValue(answers[field.key])),
    "Customer signature: " + textValue(signature.name ?? "Not captured"),
  ];
  const reference = String(job.reference ?? job.id);
  sendPdf(res, buildPdf({ title: "Job Report", company, reference, lines, logo }), reference + "-job-report.pdf");
}));

brandedDocumentsRouter.get("/field-service/quotes/:id/pdf", office, asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = req.params.id;
  const quote = (await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT q.*,cu.name AS "customerName",s.name AS "siteName",s.address AS "siteAddress",s.postcode AS "sitePostcode"
    FROM "Quote" q JOIN "Customer" cu ON cu.id=q."customerId" LEFT JOIN "CustomerSite" s ON s.id=q."siteId"
    WHERE q.id=${id}::uuid AND q."companyId"=${companyId} LIMIT 1
  `)[0];
  if (!quote) return res.status(404).json({ error: "Quote not found" });
  const rows = await prisma.$queryRaw<Array<{ description: string; quantity: number; unitPricePence: number; vatRate: number }>>`
    SELECT description,quantity::float8 AS quantity,"unitPricePence","vatRate"::float8 AS "vatRate"
    FROM "QuoteLine" WHERE "companyId"=${companyId} AND "quoteId"=${id}::uuid ORDER BY "sortOrder"
  `;
  const company = await companyHeader(companyId);
  if (!company) return res.status(404).json({ error: "Company not found" });
  const logo = await companyLogo(companyId);
  const lines = [
    "Customer: " + textValue(quote.customerName),
    "Site: " + [quote.siteName, quote.siteAddress, quote.sitePostcode].filter(Boolean).join(", "),
    "Title: " + textValue(quote.title),
    "Valid until: " + date(quote.validUntil as string | null),
    "",
    "Items",
    ...rows.map((row) => row.description + " | " + row.quantity + " x " + money(row.unitPricePence) + " | VAT " + row.vatRate + "%"),
    "",
    "Subtotal: " + money(Number(quote.subtotalPence ?? 0)),
    "VAT: " + money(Number(quote.vatPence ?? 0)),
    "Total: " + money(Number(quote.totalPence ?? 0)),
  ];
  const reference = String(quote.reference);
  sendPdf(res, buildPdf({ title: "Quote", company, reference, lines, logo }), reference + "-quote.pdf");
}));

brandedDocumentsRouter.get("/field-service/invoices/:id/pdf", office, asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const id = req.params.id;
  const invoice = (await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT i.*,cu.name AS "customerName",j."jobNumber" AS "jobReference"
    FROM "Invoice" i JOIN "Customer" cu ON cu.id=i."customerId" LEFT JOIN "Job" j ON j.id=i."jobId"
    WHERE i.id=${id}::uuid AND i."companyId"=${companyId} LIMIT 1
  `)[0];
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  const rows = await prisma.$queryRaw<Array<{ description: string; quantity: number; unitPricePence: number; vatRate: number }>>`
    SELECT description,quantity::float8 AS quantity,"unitPricePence","vatRate"::float8 AS "vatRate"
    FROM "InvoiceLine" WHERE "companyId"=${companyId} AND "invoiceId"=${id}::uuid ORDER BY "sortOrder"
  `;
  const company = await companyHeader(companyId);
  if (!company) return res.status(404).json({ error: "Company not found" });
  const logo = await companyLogo(companyId);
  const total = Number(invoice.totalPence ?? 0);
  const paid = Number(invoice.paidPence ?? 0);
  const lines = [
    "Customer: " + textValue(invoice.customerName),
    "Job: " + textValue(invoice.jobReference ?? "-"),
    "Issue date: " + date(invoice.issueDate as string | null),
    "Due date: " + date(invoice.dueDate as string | null),
    "",
    "Items",
    ...rows.map((row) => row.description + " | " + row.quantity + " x " + money(row.unitPricePence) + " | VAT " + row.vatRate + "%"),
    "",
    "Subtotal: " + money(Number(invoice.subtotalPence ?? 0)),
    "VAT: " + money(Number(invoice.vatPence ?? 0)),
    "Total: " + money(total),
    "Paid: " + money(paid),
    "Balance: " + money(total - paid),
  ];
  const reference = String(invoice.reference);
  sendPdf(res, buildPdf({ title: "Invoice", company, reference, lines, logo }), reference + "-invoice.pdf");
}));
