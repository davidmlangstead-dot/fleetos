import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { config } from "../../config.js";
import { requireRoles } from "../../middleware/auth.js";

export const brandedDocumentsRouter = Router();
const office = requireRoles("TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN");

type CompanyHeader={name:string;address:string|null;postcode:string|null;phone:string|null;vatNumber:string|null};
type Jpeg={data:Buffer;width:number;height:number};

function escapePdf(value:string){return value.replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)").replace(/[^\x20-\x7E]/g,"?");}
function money(pence:number){return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format((pence||0)/100);}
function date(value:Date|string|null|undefined){return value?new Date(value).toLocaleDateString("en-GB"):"—";}

function jpegSize(data:Buffer){
  if(data.length<4||data[0]!==0xff||data[1]!==0xd8)return null;
  let i=2;
  while(i+9<data.length){if(data[i]!==0xff){i++;continue;}const marker=data[i+1];i+=2;if(marker===0xd8||marker===0xd9)continue;const length=data.readUInt16BE(i);if(length<2||i+length>data.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){return {height:data.readUInt16BE(i+3),width:data.readUInt16BE(i+5)};}i+=length;}
  return null;
}

async function companyHeader(companyId:string){
  return (await prisma.$queryRaw<CompanyHeader[]>`SELECT name,address,postcode,phone,"vatNumber" FROM "Company" WHERE id=${companyId} LIMIT 1`)[0];
}

async function companyLogo(companyId:string):Promise<Jpeg|null>{
  if(!config.SUPABASE_SERVICE_ROLE_KEY)return null;
  try{
    const supabase=createClient(config.SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await supabase.storage.from("fleet-documents").download(`${companyId}/branding/document-logo.jpg`);
    if(error||!data)return null;
    const buffer=Buffer.from(await data.arrayBuffer());const size=jpegSize(buffer);return size?{data:buffer,...size}:null;
  }catch{return null;}
}

function buildPdf(args:{title:string;company:CompanyHeader;reference:string;lines:string[];logo:Jpeg|null}){
  const {title,company,reference,logo}=args;
  const lines=[company.name,[company.address,company.postcode].filter(Boolean).join(", "),company.phone?`Tel: ${company.phone}`:"",company.vatNumber?`VAT: ${company.vatNumber}`:"", "",title,`Reference: ${reference}`,"",...args.lines].filter(v=>v!=="");
  const wrapped=lines.flatMap(line=>{const s=String(line);if(s.length<=88)return[s];const out:string[]=[];for(let i=0;i<s.length;i+=88)out.push(s.slice(i,i+88));return out;}).slice(0,62);
  const imageObject=logo?5:null;const contentObject=logo?6:5;
  const startY=logo?720:790;
  const text=["BT","/F1 10 Tf",`50 ${startY} Td`,"14 TL",...wrapped.map((line,index)=>`${index?"T* ":""}(${escapePdf(line)}) Tj`),"ET"];
  if(logo){const maxW=150,maxH=65,scale=Math.min(maxW/logo.width,maxH/logo.height),w=Math.max(1,logo.width*scale),h=Math.max(1,logo.height*scale);text.unshift("q",`${w.toFixed(2)} 0 0 ${h.toFixed(2)} 50 ${(790-h).toFixed(2)} cm","/Im1 Do","Q");}
  const content=Buffer.from(text.join("\n"));
  const objects:Buffer[]=[
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> ${logo?`/XObject << /Im1 ${imageObject} 0 R >>`:""} >> /Contents ${contentObject} 0 R >>`),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];
  if(logo)objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.data.length} >>\nstream\n`),logo.data,Buffer.from("\nendstream")]));
  objects.push(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`),content,Buffer.from("\nendstream")]));
  const parts=[Buffer.from("%PDF-1.4\n")];const offsets=[0];let size=parts[0].length;
  objects.forEach((obj,index)=>{offsets.push(size);const part=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`),obj,Buffer.from("\nendobj\n")]);parts.push(part);size+=part.length;});
  const xref=size;let tail=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(const offset of offsets.slice(1))tail+=`${String(offset).padStart(10,"0")} 00000 n \n`;tail+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  parts.push(Buffer.from(tail));return Buffer.concat(parts);
}

function sendPdf(res:import("express").Response,pdf:Buffer,filename:string){res.setHeader("content-type","application/pdf");res.setHeader("content-disposition",`attachment; filename="${filename.replace(/[^a-z0-9_.-]/gi,"-")}"`);res.send(pdf);}

brandedDocumentsRouter.get("/jobs/:id/report.pdf",office,asyncHandler(async(req,res)=>{
  const c=req.user!.companyId,id=req.params.id;
  const job=(await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT j.id,j."jobNumber" AS reference,j.title,j.status::text,j."scheduledStart",j."completedAt",j."worksheetSchema",j."worksheetResponses",j."riskAssessment",j."customerSignature",COALESCE(cu.name,j."customerName") AS "customerName",s.name AS "siteName",COALESCE(s.address,j."collectionAddress") AS "siteAddress",COALESCE(s.postcode,j."collectionPostcode") AS "sitePostcode",v.registration FROM "Job" j LEFT JOIN "Customer" cu ON cu.id=j."customerId" LEFT JOIN "CustomerSite" s ON s.id=j."siteId" LEFT JOIN "Vehicle" v ON v.id=j."vehicleId" WHERE j.id=${id} AND j."companyId"=${c} LIMIT 1`)[0];
  if(!job)return res.status(404).json({error:"Job not found"});
  const company=await companyHeader(c),logo=await companyLogo(c);const schema=(job.worksheetSchema??[]) as Array<{key:string;label:string}>;const answers=(job.worksheetResponses??{}) as Record<string,unknown>;
  const lines=[`Job: ${String(job.title??"")}`,`Customer: ${String(job.customerName??"")}`,`Site: ${[job.siteName,job.siteAddress,job.sitePostcode].filter(Boolean).join(", ")}`,`Vehicle: ${String(job.registration??"Not allocated")}`,`Status: ${String(job.status)}`,`Scheduled: ${date(job.scheduledStart as string|null)}`,`Completed: ${date(job.completedAt as string|null)}`,"","Work completed",...schema.map(f=>`${f.label}: ${answers[f.key]===undefined||answers[f.key]===null||answers[f.key]===""?"Not completed":String(answers[f.key])}`),`Customer signature: ${String((job.customerSignature as Record<string,unknown>|null)?.name??"Not captured")}`];
  const pdf=buildPdf({title:"Job Report",company,reference:String(job.reference??job.id),lines,logo});sendPdf(res,pdf,`${String(job.reference??job.id)}-job-report.pdf`);
}));

brandedDocumentsRouter.get("/field-service/quotes/:id/pdf",office,asyncHandler(async(req,res)=>{
  const c=req.user!.companyId,id=req.params.id;
  const quote=(await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT q.*,cu.name AS "customerName",s.name AS "siteName",s.address AS "siteAddress",s.postcode AS "sitePostcode" FROM "Quote" q JOIN "Customer" cu ON cu.id=q."customerId" LEFT JOIN "CustomerSite" s ON s.id=q."siteId" WHERE q.id=${id}::uuid AND q."companyId"=${c} LIMIT 1`)[0];if(!quote)return res.status(404).json({error:"Quote not found"});
  const rows=await prisma.$queryRaw<Array<{description:string;quantity:number;unitPricePence:number;vatRate:number}>>`SELECT description,quantity::float8 AS quantity,"unitPricePence","vatRate"::float8 AS "vatRate" FROM "QuoteLine" WHERE "companyId"=${c} AND "quoteId"=${id}::uuid ORDER BY "sortOrder"`;
  const company=await companyHeader(c),logo=await companyLogo(c);const lines=[`Customer: ${String(quote.customerName)}`,`Site: ${[quote.siteName,quote.siteAddress,quote.sitePostcode].filter(Boolean).join(", ")}`,`Title: ${String(quote.title)}`,`Valid until: ${date(quote.validUntil as string|null)}`,"","Items",...rows.map(r=>`${r.description} | ${r.quantity} x ${money(r.unitPricePence)} | VAT ${r.vatRate}%`),"",`Subtotal: ${money(Number(quote.subtotalPence??0))}`,`VAT: ${money(Number(quote.vatPence??0))}`,`Total: ${money(Number(quote.totalPence??0))}`];
  sendPdf(res,buildPdf({title:"Quote",company,reference:String(quote.reference),lines,logo}),`${String(quote.reference)}-quote.pdf`);
}));

brandedDocumentsRouter.get("/field-service/invoices/:id/pdf",office,asyncHandler(async(req,res)=>{
  const c=req.user!.companyId,id=req.params.id;
  const invoice=(await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT i.*,cu.name AS "customerName",j."jobNumber" AS "jobReference" FROM "Invoice" i JOIN "Customer" cu ON cu.id=i."customerId" LEFT JOIN "Job" j ON j.id=i."jobId" WHERE i.id=${id}::uuid AND i."companyId"=${c} LIMIT 1`)[0];if(!invoice)return res.status(404).json({error:"Invoice not found"});
  const rows=await prisma.$queryRaw<Array<{description:string;quantity:number;unitPricePence:number;vatRate:number}>>`SELECT description,quantity::float8 AS quantity,"unitPricePence","vatRate"::float8 AS "vatRate" FROM "InvoiceLine" WHERE "companyId"=${c} AND "invoiceId"=${id}::uuid ORDER BY "sortOrder"`;
  const company=await companyHeader(c),logo=await companyLogo(c);const lines=[`Customer: ${String(invoice.customerName)}`,`Job: ${String(invoice.jobReference??"—")}`,`Issue date: ${date(invoice.issueDate as string|null)}`,`Due date: ${date(invoice.dueDate as string|null)}`,"","Items",...rows.map(r=>`${r.description} | ${r.quantity} x ${money(r.unitPricePence)} | VAT ${r.vatRate}%`),"",`Subtotal: ${money(Number(invoice.subtotalPence??0))}`,`VAT: ${money(Number(invoice.vatPence??0))}`,`Total: ${money(Number(invoice.totalPence??0))}`,`Paid: ${money(Number(invoice.paidPence??0))}`,`Balance: ${money(Number(invoice.totalPence??0)-Number(invoice.paidPence??0))}`];
  sendPdf(res,buildPdf({title:"Invoice",company,reference:String(invoice.reference),lines,logo}),`${String(invoice.reference)}-invoice.pdf`);
}));
