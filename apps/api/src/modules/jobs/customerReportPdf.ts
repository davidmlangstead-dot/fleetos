import { inflateSync, deflateSync } from "node:zlib";

export type ReportField = { key: string; label: string; type: string; required?: boolean };
export type ReportImage = { name: string; createdAt: Date; data: Buffer; mimeType: string | null };

export type CustomerJobReport = {
  id: string;
  reference: string | null;
  title: string | null;
  description: string | null;
  status: string;
  priority: string;
  customerName: string;
  contactName: string | null;
  contactEmail: string | null;
  siteName: string | null;
  siteAddress: string | null;
  sitePostcode: string | null;
  accessNotes: string | null;
  assetName: string | null;
  assetReference: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  purchaseOrderNumber: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  completedAt: Date | null;
  issuedToDriverAt: Date | null;
  submittedByDriverAt: Date | null;
  officeApprovedAt: Date | null;
  reportGeneratedAt: Date | null;
  reportEmailedAt: Date | null;
  worksheetSchema: ReportField[];
  worksheetResponses: Record<string, unknown>;
  riskAssessment: Record<string, unknown>;
  customerSignature: Record<string, unknown>;
  registration: string | null;
  companyName: string;
  companyAddress: string | null;
  companyPostcode: string | null;
  companyPhone: string | null;
  companyVatNumber: string | null;
  companyOperatorLicenceNumber: string | null;
  assignments: Array<{ firstName: string; lastName: string; personType: string }>;
  visits: Array<{ title: string; status: string; scheduledStart: Date | null; scheduledEnd: Date | null; actualStart: Date | null; actualEnd: Date | null; notes: string | null }>;
  costs: Array<{ category: string; description: string; quantity: number }>;
  attachments: Array<{ name: string; mimeType: string | null; createdAt: Date; fileUrl?: string }>;
};

type PdfImage = { name: string; width: number; height: number; colourSpace: "/DeviceRGB" | "/DeviceGray"; filter: "/DCTDecode" | "/FlateDecode"; data: Buffer; caption: string; createdAt: Date };
type Page = { commands: string[] };

const A4 = { width: 595, height: 842 };
const colours = { ink: "0.12 0.16 0.19", muted: "0.38 0.43 0.47", green: "0.08 0.42 0.31", pale: "0.93 0.97 0.95", line: "0.82 0.86 0.84", white: "1 1 1", amber: "0.78 0.43 0.06" };

function ascii(value: unknown) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00a3/g, "GBP ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

function escapePdf(value: unknown) {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function dateTime(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
}

function dateOnly(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "Europe/London" });
}

function valueText(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${valueText(item)}`).join("; ");
  return String(value);
}

function firstAnswer(responses: Record<string, unknown>, keys: string[], fallback = "Not recorded") {
  for (const key of keys) {
    const value = responses[key];
    if (value !== undefined && value !== null && value !== "") return valueText(value);
  }
  return fallback;
}

function jpeg(data: Buffer, caption: string, createdAt: Date): PdfImage | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let index = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (index + 9 < data.length) {
    if (data[index] !== 0xff) { index += 1; continue; }
    const marker = data[index + 1];
    index += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (index + 2 > data.length) break;
    const length = data.readUInt16BE(index);
    if (length < 2 || index + length > data.length) break;
    if (sof.has(marker)) {
      const components = data[index + 7];
      return { name: "", width: data.readUInt16BE(index + 5), height: data.readUInt16BE(index + 3), colourSpace: components === 1 ? "/DeviceGray" : "/DeviceRGB", filter: "/DCTDecode", data, caption, createdAt };
    }
    index += length;
  }
  return null;
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function png(data: Buffer, caption: string, createdAt: Date): PdfImage | null {
  const signature = "89504e470d0a1a0a";
  if (data.length < 33 || data.subarray(0, 8).toString("hex") !== signature) return null;
  let index = 8, width = 0, height = 0, depth = 0, colourType = -1, interlace = 0;
  const chunks: Buffer[] = [];
  while (index + 12 <= data.length) {
    const length = data.readUInt32BE(index), type = data.subarray(index + 4, index + 8).toString("ascii"), body = data.subarray(index + 8, index + 8 + length);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; colourType = body[9]; interlace = body[12]; }
    if (type === "IDAT") chunks.push(body);
    index += 12 + length;
    if (type === "IEND") break;
  }
  if (!width || !height || depth !== 8 || interlace !== 0 || ![0, 2, 6].includes(colourType)) return null;
  const channels = colourType === 0 ? 1 : colourType === 2 ? 3 : 4;
  const stride = width * channels, inflated = inflateSync(Buffer.concat(chunks));
  if (inflated.length < (stride + 1) * height) return null;
  const pixels = Buffer.alloc(stride * height);
  let source = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[source++];
    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[source++], left = column >= channels ? pixels[row * stride + column - channels] : 0, up = row ? pixels[(row - 1) * stride + column] : 0, upperLeft = row && column >= channels ? pixels[(row - 1) * stride + column - channels] : 0;
      const value = filter === 0 ? raw : filter === 1 ? raw + left : filter === 2 ? raw + up : filter === 3 ? raw + Math.floor((left + up) / 2) : filter === 4 ? raw + paeth(left, up, upperLeft) : NaN;
      if (!Number.isFinite(value)) return null;
      pixels[row * stride + column] = value & 255;
    }
  }
  let output = pixels;
  if (colourType === 6) {
    output = Buffer.alloc(width * height * 3);
    for (let sourceIndex = 0, targetIndex = 0; sourceIndex < pixels.length; sourceIndex += 4) {
      const alpha = pixels[sourceIndex + 3] / 255;
      output[targetIndex++] = Math.round(pixels[sourceIndex] * alpha + 255 * (1 - alpha));
      output[targetIndex++] = Math.round(pixels[sourceIndex + 1] * alpha + 255 * (1 - alpha));
      output[targetIndex++] = Math.round(pixels[sourceIndex + 2] * alpha + 255 * (1 - alpha));
    }
  }
  return { name: "", width, height, colourSpace: colourType === 0 ? "/DeviceGray" : "/DeviceRGB", filter: "/FlateDecode", data: deflateSync(output), caption, createdAt };
}

export function prepareReportImage(image: ReportImage): PdfImage | null {
  return jpeg(image.data, image.name, image.createdAt) ?? png(image.data, image.name, image.createdAt);
}

class ReportLayout {
  pages: Page[] = [];
  page!: Page;
  y = 0;
  constructor(private readonly report: CustomerJobReport, private readonly images: PdfImage[], private readonly logo: PdfImage | null) { this.addPage(); }

  private addPage() {
    this.page = { commands: [] };
    this.pages.push(this.page);
    this.y = 774;
    if (this.pages.length > 1) this.header();
  }

  private command(value: string) { this.page.commands.push(value); }
  private rect(x: number, y: number, width: number, height: number, fill: string, stroke?: string) {
    this.command(`${fill} rg${stroke ? ` ${stroke} RG` : ""} ${x} ${y} ${width} ${height} re ${stroke ? "B" : "f"}`);
  }
  private line(x1: number, y1: number, x2: number, y2: number, colour = colours.line) { this.command(`${colour} RG 0.7 w ${x1} ${y1} m ${x2} ${y2} l S`); }
  private text(value: unknown, x: number, y: number, size = 10, bold = false, colour = colours.ink) {
    this.command(`BT ${colour} rg /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`);
  }
  private wrap(value: unknown, width: number, size = 10) {
    const max = Math.max(10, Math.floor(width / (size * 0.52))), paragraphs = ascii(value || "Not recorded").split(/\r?\n/), lines: string[] = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(""); continue; }
      let current = "";
      for (const word of words) {
        if (word.length > max) {
          if (current) { lines.push(current); current = ""; }
          for (let index = 0; index < word.length; index += max) lines.push(word.slice(index, index + max));
        } else if (!current || `${current} ${word}`.length <= max) current = current ? `${current} ${word}` : word;
        else { lines.push(current); current = word; }
      }
      if (current) lines.push(current);
    }
    return lines;
  }
  private paragraph(value: unknown, x: number, width: number, size = 10, colour = colours.ink) {
    const lines = this.wrap(value, width, size);
    for (const line of lines) { this.ensure(size + 8); this.text(line || " ", x, this.y, size, false, colour); this.y -= size + 4; }
    this.y -= 3;
  }
  private ensure(height: number) { if (this.y - height < 58) this.addPage(); }
  private header() {
    this.text(this.report.companyName, 42, 806, 10, true, colours.green);
    this.text(`Service report ${this.report.reference ?? this.report.id}`, 330, 806, 9, false, colours.muted);
    this.line(42, 796, 553, 796);
  }
  private section(title: string, estimated = 60) {
    this.y -= 10;
    this.ensure(estimated + 44);
    this.rect(42, this.y - 2, 511, 24, colours.pale);
    this.text(title.toUpperCase(), 52, this.y + 6, 10, true, colours.green);
    this.y -= 35;
  }
  private labelled(label: string, value: unknown, x: number, width: number) {
    this.text(label.toUpperCase(), x, this.y, 7.5, true, colours.muted);
    this.y -= 13;
    this.paragraph(value, x, width, 10);
  }
  private twoColumn(items: Array<[string, unknown]>) {
    for (let index = 0; index < items.length; index += 2) {
      const left = items[index], right = items[index + 1];
      const leftLines = this.wrap(left[1], 224, 9.5), rightLines = right ? this.wrap(right[1], 224, 9.5) : [];
      const height = Math.max(leftLines.length, rightLines.length, 1) * 13 + 24;
      this.ensure(height);
      const top = this.y;
      this.text(left[0].toUpperCase(), 52, top, 7.5, true, colours.muted);
      leftLines.forEach((line, lineIndex) => this.text(line, 52, top - 14 - lineIndex * 13, 9.5));
      if (right) {
        this.text(right[0].toUpperCase(), 307, top, 7.5, true, colours.muted);
        rightLines.forEach((line, lineIndex) => this.text(line, 307, top - 14 - lineIndex * 13, 9.5));
      }
      this.y -= height;
      this.line(52, this.y + 9, 543, this.y + 9);
    }
  }

  build() {
    const r = this.report, answers = r.worksheetResponses ?? {};
    const summary = firstAnswer(answers, ["report_summary", "outcome_summary", "work_completed", "scope_completed", "delivery_result", "inspection_result"], r.description ?? "Not recorded");
    const work = firstAnswer(answers, ["report_work_completed", "work_completed", "scope_completed", "pod_notes"], summary);
    const findings = firstAnswer(answers, ["report_findings", "findings", "fault_found", "condition_before"], "No separate findings were recorded.");
    const recommendations = firstAnswer(answers, ["report_recommendations", "recommendations", "follow_up", "next_due"], "No further recommendations were recorded.");
    const customerNotes = firstAnswer(answers, ["report_customer_notes"], "No additional customer notes were recorded.");

    this.rect(0, 0, A4.width, A4.height, colours.white);
    this.rect(0, 690, A4.width, 152, colours.green);
    this.text(r.companyName, 42, 798, 18, true, colours.white);
    const companyLine = [r.companyAddress, r.companyPostcode, r.companyPhone].filter(Boolean).join(" | ");
    if (companyLine) this.text(companyLine, 42, 778, 8.5, false, colours.white);
    if (this.logo) {
      const maxWidth = 115, maxHeight = 48, scale = Math.min(maxWidth / this.logo.width, maxHeight / this.logo.height, 1), width = this.logo.width * scale, height = this.logo.height * scale;
      this.rect(553 - width - 10, 768 - 7, width + 20, height + 14, colours.white);
      this.command(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${(553 - width).toFixed(2)} 768 cm /${this.logo.name} Do Q`);
    }
    this.text("SERVICE COMPLETION REPORT", 42, 724, 22, true, colours.white);
    this.text(`Reference ${r.reference ?? r.id}`, 42, 703, 10, false, colours.white);
    if (!r.officeApprovedAt) {
      this.rect(402, 713, 151, 29, colours.amber);
      this.text("DRAFT - NOT APPROVED", 417, 723, 9, true, colours.white);
    } else {
      this.rect(424, 713, 129, 29, "0.05 0.29 0.22");
      this.text("OFFICE APPROVED", 438, 723, 9, true, colours.white);
    }
    this.y = 648;
    this.twoColumn([
      ["Customer", r.customerName], ["Report date", dateOnly(r.reportGeneratedAt)],
      ["Site", [r.siteName, r.siteAddress, r.sitePostcode].filter(Boolean).join(", ") || "Not recorded"], ["Completion date", dateTime(r.completedAt)],
      ["Job", r.title ?? "Service attendance"], ["Purchase order", r.purchaseOrderNumber ?? "Not provided"],
    ]);
    this.section("Outcome at a glance", 120);
    this.paragraph(summary, 52, 491, 11);
    this.ensure(66);
    this.rect(52, this.y - 46, 491, 54, colours.pale, colours.line);
    this.text("Customer acceptance", 64, this.y - 8, 8, true, colours.muted);
    this.text(valueText(r.customerSignature?.name), 64, this.y - 27, 12, true, colours.ink);
    this.text(`Signed ${dateTime(r.customerSignature?.signedAt as string | undefined)}`, 310, this.y - 27, 9, false, colours.muted);
    this.y -= 70;

    this.addPage();
    this.section("Service summary", 210);
    this.labelled("What happened", summary, 52, 491);
    this.labelled("Work carried out", work, 52, 491);
    this.labelled("Findings and condition", findings, 52, 491);
    this.labelled("Recommendations and next steps", recommendations, 52, 491);
    this.labelled("Additional customer notes", customerNotes, 52, 491);

    this.section("Job and site details", 150);
    const asset = [r.assetName, r.assetReference, r.manufacturer, r.model, r.serialNumber].filter(Boolean).join(" | ") || "No asset recorded";
    this.twoColumn([
      ["Status", r.status.replaceAll("_", " ")], ["Priority", r.priority],
      ["Contact", r.contactName ?? "Not recorded"], ["Contact email", r.contactEmail ?? "Not recorded"],
      ["Asset / equipment", asset], ["Allocated vehicle", r.registration ?? "Not allocated"],
      ["Scheduled", `${dateTime(r.scheduledStart)} to ${dateTime(r.scheduledEnd)}`], ["Access information", r.accessNotes ?? "None recorded"],
    ]);

    this.section("Attendance and work record", 140);
    this.twoColumn([
      ["Attending staff", r.assignments.length ? r.assignments.map(person => `${person.firstName} ${person.lastName} (${person.personType.replaceAll("_", " ").toLowerCase()})`).join(", ") : "Not recorded"],
      ["Issued to field team", dateTime(r.issuedToDriverAt)],
      ["Submitted to office", dateTime(r.submittedByDriverAt)], ["Office approved", dateTime(r.officeApprovedAt)],
    ]);
    for (const visit of r.visits) {
      this.ensure(58);
      this.text(visit.title || "Site visit", 52, this.y, 10, true);
      this.text(`${dateTime(visit.actualStart ?? visit.scheduledStart)} to ${dateTime(visit.actualEnd ?? visit.scheduledEnd)} | ${visit.status.replaceAll("_", " ")}`, 52, this.y - 16, 9, false, colours.muted);
      if (visit.notes) { this.y -= 31; this.paragraph(visit.notes, 52, 491, 9); } else this.y -= 37;
    }

    this.section("Job-specific checks and results", 140);
    const reserved = new Set(["report_summary", "report_work_completed", "report_findings", "report_recommendations", "report_customer_notes"]);
    const fields = r.worksheetSchema.filter(field => !reserved.has(field.key));
    if (!fields.length) this.paragraph("No additional job-specific checks were configured.", 52, 491, 10, colours.muted);
    else this.twoColumn(fields.map(field => [field.label, valueText(answers[field.key])]));

    this.section("Safety and materials", 120);
    this.twoColumn([
      ["Point-of-work risk check", r.riskAssessment?.safeToProceed === true ? "Completed - safe to proceed" : "Not recorded as completed"],
      ["Customer sign-off", r.customerSignature?.name ? `Accepted by ${valueText(r.customerSignature.name)}` : "Not captured"],
    ]);
    if (r.costs.length) {
      this.text("MATERIALS / RESOURCES RECORDED", 52, this.y, 7.5, true, colours.muted); this.y -= 15;
      for (const line of r.costs) { this.ensure(20); this.text(`${line.quantity} x ${line.description} (${line.category.toLowerCase()})`, 52, this.y, 9.5); this.y -= 16; }
      this.y -= 5;
    } else this.paragraph("No labour, parts or materials were itemised on this job.", 52, 491, 9.5, colours.muted);

    this.addPage();
    this.section("Photographic evidence", 100);
    if (!this.images.length) {
      this.paragraph("No compatible photographic evidence was attached to this report.", 52, 491, 10, colours.muted);
    } else {
      for (const image of this.images) {
        const maxWidth = 491, maxHeight = 540;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = image.width * scale, height = image.height * scale;
        this.ensure(height + 56);
        const x = 52 + (maxWidth - width) / 2, y = this.y - height;
        this.rect(50, y - 2, 495, height + 4, colours.white, colours.line);
        this.command(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${image.name} Do Q`);
        this.y = y - 18;
        this.text(image.caption, 52, this.y, 9, true);
        this.text(dateTime(image.createdAt), 390, this.y, 8, false, colours.muted);
        this.y -= 28;
      }
    }

    const nonImages = r.attachments.filter(item => !item.mimeType?.toLowerCase().startsWith("image/") || !this.images.some(image => image.caption === item.name && image.createdAt.getTime() === item.createdAt.getTime()));
    if (nonImages.length) {
      this.section("Supporting attachments", 80);
      for (const item of nonImages) { this.ensure(22); this.text(`${item.name} | ${item.mimeType ?? "document"} | ${dateTime(item.createdAt)}`, 52, this.y, 9); this.y -= 18; }
    }

    this.section("Approval and report record", 120);
    this.twoColumn([
      ["Customer acceptance", r.customerSignature?.name ? `${valueText(r.customerSignature.name)} at ${dateTime(r.customerSignature.signedAt as string | undefined)}` : "Not captured"],
      ["Office approval", dateTime(r.officeApprovedAt)],
      ["Field submission", dateTime(r.submittedByDriverAt)], ["Report generated", dateTime(r.reportGeneratedAt)],
    ]);
    this.paragraph("This report records the work and evidence entered against the job at the time shown. Any quotation or invoice is issued separately and takes precedence for commercial terms.", 52, 491, 8.5, colours.muted);

    this.pages.forEach((page, index) => {
      page.commands.push(`${colours.line} RG 0.7 w 42 38 m 553 38 l S`);
      page.commands.push(`BT ${colours.muted} rg /F1 8 Tf 42 23 Td (${escapePdf(`${r.companyName} | ${r.reference ?? r.id}`)}) Tj ET`);
      page.commands.push(`BT ${colours.muted} rg /F1 8 Tf 498 23 Td (Page ${index + 1} of ${this.pages.length}) Tj ET`);
    });
    return this.pages;
  }
}

export function createCustomerJobReportPdf(report: CustomerJobReport, sourceImages: ReportImage[], logoSource?: ReportImage | null) {
  const images = sourceImages.map(prepareReportImage).filter((image): image is PdfImage => Boolean(image)).slice(0, 20);
  images.forEach((image, index) => { image.name = `Im${index + 1}`; });
  const logo = logoSource ? prepareReportImage(logoSource) : null;
  if (logo) logo.name = "Logo";
  const pages = new ReportLayout(report, images, logo).build();
  const objects = new Map<number, Buffer>();
  objects.set(1, Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.set(3, Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  objects.set(4, Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  let next = 5;
  const imageRefs = [...images, ...(logo ? [logo] : [])].map(image => {
    const ref = next++;
    const header = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${image.colourSpace} /BitsPerComponent 8 /Filter ${image.filter} /Length ${image.data.length} >>\nstream\n`;
    objects.set(ref, Buffer.concat([Buffer.from(header), image.data, Buffer.from("\nendstream")]));
    return { name: image.name, ref };
  });
  const pageRefs: number[] = [];
  for (const page of pages) {
    const pageRef = next++, contentRef = next++;
    pageRefs.push(pageRef);
    const content = Buffer.from(page.commands.join("\n"));
    const xObjects = imageRefs.length ? ` /XObject << ${imageRefs.map(item => `/${item.name} ${item.ref} 0 R`).join(" ")} >>` : "";
    objects.set(pageRef, Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjects} >> /Contents ${contentRef} 0 R >>`));
    objects.set(contentRef, Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]));
  }
  objects.set(2, Buffer.from(`<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`));
  const maxObject = next - 1, parts: Buffer[] = [Buffer.from("%PDF-1.4\n%FleetOS\n")], offsets = [0];
  let size = parts[0].length;
  for (let ref = 1; ref <= maxObject; ref += 1) {
    offsets[ref] = size;
    const part = Buffer.concat([Buffer.from(`${ref} 0 obj\n`), objects.get(ref) ?? Buffer.from("<< >>"), Buffer.from("\nendobj\n")]);
    parts.push(part); size += part.length;
  }
  const xref = size;
  let tail = `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let ref = 1; ref <= maxObject; ref += 1) tail += `${String(offsets[ref]).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  parts.push(Buffer.from(tail));
  return Buffer.concat(parts);
}

