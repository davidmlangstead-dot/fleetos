import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Camera, CheckCircle2, ClipboardCheck, Coins, Download, ExternalLink, FileText, MapPin, MessageSquarePlus, RefreshCw, Send, UploadCloud, Users } from "lucide-react";
import { api, API_BASE_URL, ACTIVE_WORKSPACE_KEY } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import type { FormField, JobConfig } from "./types";

type Detail={id:string;reference:string;title:string;description:string|null;status:string;priority:string;source:string;jobTypeName:string;trade:string;colour:string;riskAssessmentRequired:boolean;customerSignatureRequired:boolean;customerName:string;siteName:string|null;siteAddress:string|null;sitePostcode:string|null;accessNotes:string|null;assetName:string|null;assetReference:string|null;manufacturer:string|null;model:string|null;serialNumber:string|null;registration:string|null;vehicleId:string|null;scheduledStart:string|null;scheduledEnd:string|null;dueAt:string|null;contactName:string|null;contactPhone:string|null;contactEmail:string|null;purchaseOrderNumber:string|null;quotePence:number|null;issuedToDriverAt:string|null;submittedByDriverAt:string|null;officeApprovedAt:string|null;reportGeneratedAt:string|null;reportEmailedAt:string|null;reportEmailTo:string|null;reportEmailStatus:string|null;worksheetSchema:FormField[];worksheetResponses:Record<string,unknown>;riskAssessment:{safeToProceed?:boolean};customerSignature:{name?:string};assignments:Array<{id:string;personId:string;firstName:string;lastName:string;personType:string;status:string}>;visits:Array<{id:string;title:string;status:string;scheduledStart:string|null;actualStart:string|null;actualEnd:string|null}>;timeline:Array<{id:string;type:string;summary:string;detail:string|null;createdAt:string}>;costs:Array<{id:string;category:string;description:string;quantity:number;unitCostPence:number;unitSellPence:number}>;documents:Array<{id:string;name:string;type:string;fileUrl:string;createdAt:string}>;canManage:boolean;financialAccess:boolean};

const fieldActions:Record<string,Array<[string,string]>>={
  DISPATCHED:[["TRAVELLING","Travelling"],["ON_SITE","On site"]],
  TRAVELLING:[["ON_SITE","On site"]],
  ON_SITE:[["IN_PROGRESS","Start work"]],
  IN_PROGRESS:[["PAUSED","Pause"]],
  PAUSED:[["IN_PROGRESS","Resume work"]],
};
const label=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase());
const customerReportFields=[
  {key:"report_summary",label:"What happened / outcome",optional:false},
  {key:"report_work_completed",label:"Work carried out",optional:false},
  {key:"report_findings",label:"Findings / condition",optional:false},
  {key:"report_recommendations",label:"Recommendations / further work",optional:false},
  {key:"report_customer_notes",label:"Additional customer notes",optional:true},
] as const;
const dateTime=(value:string|null)=>value?new Date(value).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"Not set";
const pounds=(pence:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(pence/100);
const localInput=(value:string|null)=>{if(!value)return "";const date=new Date(value);const offset=date.getTimezoneOffset()*60000;return new Date(date.getTime()-offset).toISOString().slice(0,16);};
const cleanFilename=(name:string)=>name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-160)||"job-evidence";

function Field({field,value,onChange}:{field:FormField;value:unknown;onChange:(value:unknown)=>void}){
  if(field.type==="TEXTAREA") return <label>{field.label}{field.required&&" *"}<textarea rows={4} required={field.required} value={String(value??"")} onChange={e=>onChange(e.target.value)}/></label>;
  if(field.type==="NUMBER") return <label>{field.label}{field.required&&" *"}<input type="number" required={field.required} value={String(value??"")} onChange={e=>onChange(e.target.value===""?"":Number(e.target.value))}/></label>;
  if(field.type==="DATE") return <label>{field.label}{field.required&&" *"}<input type="date" required={field.required} value={String(value??"")} onChange={e=>onChange(e.target.value)}/></label>;
  if(field.type==="CHECKBOX") return <label className="field-declaration"><input type="checkbox" checked={Boolean(value)} onChange={e=>onChange(e.target.checked)}/><span>{field.label}{field.required&&" *"}</span></label>;
  if(field.type==="SELECT") return <label>{field.label}{field.required&&" *"}<select required={field.required} value={String(value??"")} onChange={e=>onChange(e.target.value)}><option value="">Choose…</option>{field.options?.map(option=><option key={option}>{option}</option>)}</select></label>;
  return <label>{field.label}{field.required&&" *"}<input required={field.required} value={String(value??"")} onChange={e=>onChange(e.target.value)}/></label>;
}

export function JobDetails({id,onClose,onChanged,fieldMode=false}:{id:string;onClose:()=>void;onChanged:()=>Promise<void>;fieldMode?:boolean}){
  const [job,setJob]=useState<Detail|null>(null);
  const [responses,setResponses]=useState<Record<string,unknown>>({});
  const [riskSafe,setRiskSafe]=useState(false);
  const [signature,setSignature]=useState("");
  const [note,setNote]=useState("");
  const [reportEmail,setReportEmail]=useState("");
  const [reportMessage,setReportMessage]=useState("");
  const [planningConfig,setPlanningConfig]=useState<JobConfig|null>(null);
  const [schedule,setSchedule]=useState({scheduledStart:"",scheduledEnd:"",dueAt:"",vehicleId:"",personIds:[] as string[]});
  const [cost,setCost]=useState({category:"MATERIAL",description:"",quantity:"1",unitCost:"",unitSell:""});
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    setMessage("");
    try{
      const next=await api<Detail>(`/jobs/${id}`);
      setJob(next);setResponses(next.worksheetResponses??{});setRiskSafe(Boolean(next.riskAssessment?.safeToProceed));setSignature(String(next.customerSignature?.name??""));setReportEmail(current=>current||next.reportEmailTo||next.contactEmail||"");setSchedule({scheduledStart:localInput(next.scheduledStart),scheduledEnd:localInput(next.scheduledEnd),dueAt:localInput(next.dueAt),vehicleId:next.vehicleId??"",personIds:next.assignments.map(person=>person.personId)});
      if(next.canManage)setPlanningConfig(await api<JobConfig>("/jobs/config"));
    }catch(error){setMessage(error instanceof Error?error.message:"Could not load the job.");}
  }
  useEffect(()=>{void load();},[id]);

  const totals=useMemo(()=>job?.costs.reduce((sum,line)=>({cost:sum.cost+line.quantity*line.unitCostPence,sell:sum.sell+line.quantity*line.unitSellPence}),{cost:0,sell:0})??{cost:0,sell:0},[job?.costs]);
  const requiredComplete=useMemo(()=>job?job.worksheetSchema.filter(field=>field.required).every(field=>{const value=responses[field.key];return value!==undefined&&value!==null&&value!==""&&value!==false;}):false,[job,responses]);
  const customerReportComplete=useMemo(()=>customerReportFields.filter(field=>!field.optional).every(field=>String(responses[field.key]??"").trim().length>0),[responses]);
  const reportReady=Boolean(job?.submittedByDriverAt);

  async function updateStatus(value:string){setBusy(true);setMessage("");try{await api(`/jobs/${id}/status`,{method:"PATCH",body:JSON.stringify({status:value})});await Promise.all([load(),onChanged()]);}catch(error){setMessage(error instanceof Error?error.message:"Could not update job status.");}finally{setBusy(false);}}

  async function issueJob(){setBusy(true);setMessage("");try{await api(`/jobs/${id}/issue`,{method:"POST",body:JSON.stringify({note:note.trim()||undefined})});setMessage("Job issued to the assigned field staff.");await Promise.all([load(),onChanged()]);}catch(error){setMessage(error instanceof Error?error.message:"Could not issue the job.");}finally{setBusy(false);}}

  async function saveWorksheet(){
    if(!job)return false;
    setBusy(true);setMessage("");
    try{
      await api(`/jobs/${id}/worksheet`,{method:"POST",body:JSON.stringify({responses,riskAssessment:{safeToProceed:riskSafe,confirmedAt:new Date().toISOString()},customerSignature:signature?{name:signature}:undefined})});
      setMessage("Progress saved.");await load();return true;
    }catch(error){setMessage(error instanceof Error?error.message:"Could not save the job report.");return false;}finally{setBusy(false);}
  }

  async function completeJob(){
    if(!requiredComplete){setMessage("Complete the required report fields first.");return;}
    if(!customerReportComplete){setMessage("Complete the customer report summary, work carried out, findings and recommendations first. Enter 'None' where there is nothing to report.");return;}
    if(job?.riskAssessmentRequired&&!riskSafe){setMessage("Complete the point-of-work risk assessment first.");return;}
    if(job?.customerSignatureRequired&&!signature.trim()){setMessage("Capture the customer name/signature first.");return;}
    const saved=await saveWorksheet();if(!saved)return;
    setBusy(true);setMessage("");
    try{await api(`/jobs/${id}/submit`,{method:"POST",body:JSON.stringify({note:note.trim()||undefined})});setNote("");setMessage("Job completed and sent to the office.");await Promise.all([load(),onChanged()]);}
    catch(error){setMessage(error instanceof Error?error.message:"Could not complete the job.");}finally{setBusy(false);}
  }

  async function startWork(){
    if(job?.riskAssessmentRequired&&!riskSafe){setMessage("Complete the point-of-work risk assessment before starting work.");return;}
    if(!(await saveWorksheet()))return;
    await updateStatus("IN_PROGRESS");
  }

  async function approve(){setBusy(true);setMessage("");try{await api(`/jobs/${id}/approve`,{method:"POST",body:JSON.stringify({note:note.trim()||undefined})});setMessage("Job report approved.");await Promise.all([load(),onChanged()]);}catch(error){setMessage(error instanceof Error?error.message:"Could not approve the report.");}finally{setBusy(false);}}

  async function createInvoice(){setBusy(true);setMessage("");try{const invoice=await api<{reference:string}>("/field-service/invoices/from-job",{method:"POST",body:JSON.stringify({jobId:id})});setMessage(`Invoice ${invoice.reference} created from the approved job costs.`);await load();}catch(error){setMessage(error instanceof Error?error.message:"Could not create the invoice.");}finally{setBusy(false);}}

  async function saveSchedule(event:FormEvent){event.preventDefault();setBusy(true);setMessage("");try{await api(`/jobs/${id}/schedule`,{method:"PATCH",body:JSON.stringify({scheduledStart:schedule.scheduledStart||null,scheduledEnd:schedule.scheduledEnd||null,dueAt:schedule.dueAt||null,vehicleId:schedule.vehicleId||null,personIds:schedule.personIds})});setMessage("Job time, team and vehicle updated.");await Promise.all([load(),onChanged()]);}catch(error){setMessage(error instanceof Error?error.message:"Could not update the job plan.");}finally{setBusy(false);}}

  async function addNote(event:FormEvent){event.preventDefault();if(!note.trim())return;setBusy(true);try{await api(`/jobs/${id}/timeline`,{method:"POST",body:JSON.stringify({detail:note})});setNote("");await load();}catch(error){setMessage(error instanceof Error?error.message:"Could not add note.");}finally{setBusy(false);}}

  async function uploadEvidence(file:File){
    const companyId=localStorage.getItem(ACTIVE_WORKSPACE_KEY);if(!companyId)return setMessage("No active company workspace is selected.");
    if(file.size>20*1024*1024)return setMessage("Evidence files must be 20 MB or smaller.");
    const path=`${companyId}/jobs/${id}/${fieldMode?"field/":"office/"}${crypto.randomUUID()}-${cleanFilename(file.name)}`;
    setUploading(true);setMessage("");
    try{
      const {error}=await supabase.storage.from("fleet-documents").upload(path,file,{upsert:false,contentType:file.type||undefined});if(error)throw error;
      try{await api(`/documents/job/${id}`,{method:"POST",body:JSON.stringify({name:file.name,storagePath:path,type:fieldMode?"FIELD_PAPERWORK":"OTHER",fileSize:file.size,mimeType:file.type||undefined})});}
      catch(apiError){await supabase.storage.from("fleet-documents").remove([path]).catch(()=>undefined);throw apiError;}
      setMessage("Evidence added to the job report.");await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Could not upload evidence.");}finally{setUploading(false);}
  }
  async function openDocument(document:Detail["documents"][number]){const {data,error}=await supabase.storage.from("fleet-documents").createSignedUrl(document.fileUrl,60);if(error||!data?.signedUrl)return setMessage(error?.message||"Could not open this file.");window.open(data.signedUrl,"_blank","noopener,noreferrer");}

  async function downloadReport(){
    setBusy(true);setMessage("");
    try{
      let {data:{session}}=await supabase.auth.getSession();if(!session?.access_token){session=(await supabase.auth.refreshSession()).data.session??null;}if(!session?.access_token)throw new Error("Sign in again before downloading the report.");
      const workspaceId=localStorage.getItem(ACTIVE_WORKSPACE_KEY)??"";const response=await fetch(`${API_BASE_URL}/jobs/${id}/report.pdf`,{headers:{authorization:`Bearer ${session.access_token}`,...(workspaceId?{"x-company-id":workspaceId}:{})}});if(!response.ok)throw new Error(await response.text());
      const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`${job?.reference||id}-job-report.pdf`;link.click();URL.revokeObjectURL(url);setMessage("Customer report created.");await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Could not create the PDF report.");}finally{setBusy(false);}
  }

  async function emailReport(event:FormEvent){event.preventDefault();setBusy(true);setMessage("");try{const result=await api<{status:string;to:string}>(`/jobs/${id}/email-report`,{method:"POST",body:JSON.stringify({to:reportEmail.trim()||undefined,message:reportMessage.trim()||undefined})});setMessage(result.status==="SENT"?`Report emailed to ${result.to}.`:`Report prepared for ${result.to}; email sending still needs configuration.`);await load();}catch(error){setMessage(error instanceof Error?error.message:"Could not email the report.");}finally{setBusy(false);}}

  async function addCost(event:FormEvent){event.preventDefault();if(!cost.description.trim())return;setBusy(true);try{await api(`/jobs/${id}/costs`,{method:"POST",body:JSON.stringify({category:cost.category,description:cost.description,quantity:Number(cost.quantity),unitCostPence:Math.round(Number(cost.unitCost||0)*100),unitSellPence:Math.round(Number(cost.unitSell||0)*100)})});setCost(current=>({...current,description:"",unitCost:"",unitSell:""}));await load();}catch(error){setMessage(error instanceof Error?error.message:"Could not add the cost line.");}finally{setBusy(false);}}

  if(!job)return <section className="panel job-detail loading-page"><div><RefreshCw className="spin"/><h2>Opening job</h2>{message&&<p>{message}</p>}</div></section>;
  const completed=["COMPLETED","COMPLETED_ISSUES","CLOSED"].includes(job.status);
  const nextFieldActions=fieldActions[job.status]??[];
  const canIssue=job.canManage&&["DRAFT","PLANNED","ASSIGNED","SCHEDULED"].includes(job.status);
  const canCancel=job.canManage&&!completed&&job.status!=="CANCELLED";

  return <section className="job-detail">
    <button type="button" className="secondary-button back" onClick={onClose}><ArrowLeft/> Back</button>
    <div className="job-detail-hero panel" style={{"--job-colour":job.colour} as React.CSSProperties}><div><p className="eyebrow">{job.jobTypeName}</p><h1>{job.reference} · {job.title}</h1><p>{job.description||"No job description entered."}</p></div><div><span className={`job-priority ${job.priority.toLowerCase()}`}>{job.priority}</span><em className={`driver-status ${job.status.toLowerCase()}`}>{label(job.status)}</em>{canCancel&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void updateStatus("CANCELLED")}>Cancel job</button>}</div></div>
    {message&&<p role="status" className="form-message">{message}</p>}

    <section className="panel job-summary-grid">
      <article><MapPin/><div><small>Customer / site</small><strong>{job.customerName}</strong><p>{job.siteName} · {job.siteAddress} {job.sitePostcode}</p>{job.accessNotes&&<em>{job.accessNotes}</em>}</div></article>
      <article><CalendarClock/><div><small>When</small><strong>{dateTime(job.scheduledStart)}</strong><p>{job.dueAt?`Due ${dateTime(job.dueAt)}`:"No SLA due time"}</p></div></article>
      <article><Users/><div><small>Team</small><strong>{job.assignments.length?job.assignments.map(person=>`${person.firstName} ${person.lastName}`).join(", "):"Unallocated"}</strong><p>{job.registration?`Vehicle ${job.registration}`:"No vehicle allocated"}</p></div></article>
      <article><ClipboardCheck/><div><small>Contact / asset</small><strong>{job.contactName||job.assetName||"No contact"}</strong><p>{job.contactPhone||job.assetReference||""}</p></div></article>
    </section>

    {fieldMode&&<>
      <section className="panel job-progress-panel"><div><p className="eyebrow">Field workflow</p><h2>Do the job</h2><p>Travel, arrive, complete the safety check, then start work. The next valid action is shown.</p>{job.riskAssessmentRequired&&<label className="field-declaration"><input type="checkbox" checked={riskSafe} onChange={e=>setRiskSafe(e.target.checked)}/><span>Point-of-work risk check completed; it is safe to proceed.</span></label>}</div><div className="job-progress-actions">{nextFieldActions.map(([status,actionLabel])=><button key={status} disabled={busy||completed} onClick={()=>void (status==="IN_PROGRESS"?startWork():updateStatus(status))}>{actionLabel}</button>)}{!nextFieldActions.length&&!completed&&<span className="subtle">Waiting for the office to issue this job.</span>}</div></section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Customer service report</p><h2>Record the full story</h2><p>Write this so the customer can understand exactly what happened. Enter “None” when there are no findings or recommendations.</p></div></div><div className="form-grid"><label>Outcome summary / what happened *<textarea rows={4} required value={String(responses.report_summary??"")} onChange={e=>setResponses(current=>({...current,report_summary:e.target.value}))} placeholder="Why you attended, what you found and the final outcome"/></label><label>Work carried out *<textarea rows={4} required value={String(responses.report_work_completed??"")} onChange={e=>setResponses(current=>({...current,report_work_completed:e.target.value}))} placeholder="Repairs, checks, tests, adjustments and parts fitted"/></label><label>Findings / condition *<textarea rows={4} required value={String(responses.report_findings??"")} onChange={e=>setResponses(current=>({...current,report_findings:e.target.value}))} placeholder="Faults found, condition on arrival and test results"/></label><label>Recommendations / further work *<textarea rows={4} required value={String(responses.report_recommendations??"")} onChange={e=>setResponses(current=>({...current,report_recommendations:e.target.value}))} placeholder="Follow-up work, monitoring, parts needed or 'None'"/></label><label>Additional customer notes<textarea rows={3} value={String(responses.report_customer_notes??"")} onChange={e=>setResponses(current=>({...current,report_customer_notes:e.target.value}))} placeholder="Anything else the customer should know"/></label></div><div className="panel-heading"><div><h3>Job-specific checks</h3><p>Complete the questions for this type of work.</p></div></div><div className="form-grid">{job.worksheetSchema.map(field=><Field key={field.key} field={field} value={responses[field.key]} onChange={value=>setResponses(current=>({...current,[field.key]:value}))}/>)}</div>{job.customerSignatureRequired&&<label>Customer name / signature *<input value={signature} onChange={e=>setSignature(e.target.value)} placeholder="Name of person accepting the work"/></label>}<div className="wizard-actions"><button className="secondary-button" disabled={busy} onClick={()=>void saveWorksheet()}>Save progress</button></div></section>
      <section className="panel job-paperwork"><div className="panel-heading"><div><h2><Camera size={19}/> Photos & evidence</h2><p>Add before/after photos, proof of delivery or other evidence. They stay attached to this job.</p></div></div><label className="paperwork-dropzone"><UploadCloud/><strong>{uploading?"Uploading…":"Add photo or document"}</strong><small>Camera images, PDFs and job paperwork</small><input type="file" accept="image/*,.pdf" capture="environment" disabled={uploading} onChange={(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(file)void uploadEvidence(file);event.target.value="";}}/></label>{job.documents.length>0&&<div className="job-document-list">{job.documents.map(document=><button key={document.id} type="button" onClick={()=>void openDocument(document)}><FileText/><span><strong>{document.name}</strong><small>{label(document.type)} · {dateTime(document.createdAt)}</small></span><ExternalLink/></button>)}</div>}</section>
      <section className="panel"><div className="panel-heading"><div><h2>Complete job</h2><p>One tap sends the completed report back to the office.</p></div></div><label>Completion note (optional)<textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Anything the office needs to know"/></label><button className="primary-button" disabled={busy||completed||!["IN_PROGRESS","PAUSED"].includes(job.status)} onClick={()=>void completeJob()}><CheckCircle2/> {completed?"Completed":["IN_PROGRESS","PAUSED"].includes(job.status)?"Complete & send to office":"Start work before completing"}</button></section>
    </>}

    {!fieldMode&&<>
      {job.canManage&&planningConfig&&<form className="panel" onSubmit={saveSchedule}><div className="panel-heading"><div><p className="eyebrow">Planner</p><h2>Schedule & assign</h2><p>Change the visit time, assigned team or vehicle without recreating the job.</p></div></div><div className="form-grid"><label>Start<input type="datetime-local" value={schedule.scheduledStart} onChange={e=>setSchedule(current=>({...current,scheduledStart:e.target.value}))}/></label><label>End<input type="datetime-local" value={schedule.scheduledEnd} onChange={e=>setSchedule(current=>({...current,scheduledEnd:e.target.value}))}/></label><label>Due by<input type="datetime-local" value={schedule.dueAt} onChange={e=>setSchedule(current=>({...current,dueAt:e.target.value}))}/></label><label>Vehicle<select value={schedule.vehicleId} onChange={e=>setSchedule(current=>({...current,vehicleId:e.target.value}))}><option value="">No vehicle</option>{planningConfig.vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.registration} · {label(vehicle.type)}</option>)}</select></label><label>Assigned staff<select multiple size={Math.min(7,Math.max(3,planningConfig.people.length))} value={schedule.personIds} onChange={e=>setSchedule(current=>({...current,personIds:Array.from(e.target.selectedOptions,option=>option.value)}))}>{planningConfig.people.map(person=><option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {label(person.personType)}</option>)}</select><small>Hold Ctrl or Cmd to choose more than one person.</small></label></div><button className="primary-button" disabled={busy}><CalendarClock/> Save plan</button></form>}
      <section className="panel office-completion-panel"><div><p className="eyebrow">Customer report</p><h2>{reportReady?"Field report ready":canIssue?"Ready to issue":"Job in progress"}</h2><p>{reportReady?"Review the returned job record, approve it, then create or email the customer PDF.":canIssue?"Issue the job when the right staff member has been assigned.":"The assigned staff member sees the next valid field action in their app."}</p></div><div className="job-lifecycle-stamps"><span>Field completed: {dateTime(job.submittedByDriverAt)}</span><span>Office approved: {dateTime(job.officeApprovedAt)}</span><span>Report sent: {job.reportEmailStatus||"Not sent"}</span></div><div className="office-completion-actions">{canIssue&&<button className="primary-button" disabled={busy} onClick={()=>void issueJob()}><ClipboardCheck/> Issue to field staff</button>}{reportReady&&!job.officeApprovedAt&&<button className="primary-button" disabled={busy} onClick={()=>void approve()}><CheckCircle2/> Approve report</button>}<button disabled={busy||!job.officeApprovedAt} onClick={()=>void downloadReport()}><Download/> PDF report</button>{job.officeApprovedAt&&totals.sell>0&&<button className="primary-button" disabled={busy} onClick={()=>void createInvoice()}><Coins/> Create invoice</button>}</div>{job.officeApprovedAt&&<form className="job-report-email" onSubmit={emailReport}><label>Customer email<input type="email" value={reportEmail} onChange={e=>setReportEmail(e.target.value)} placeholder="customer@example.com"/></label><label>Email message<textarea rows={3} value={reportMessage} onChange={e=>setReportMessage(e.target.value)} placeholder="Optional message"/></label><button className="primary-button" disabled={busy}><Send/> Email report</button></form>}</section>
      <section className="panel"><div className="panel-heading"><div><h2>Customer report content</h2><p>Review the field team’s customer-facing account before approval.</p></div></div><div className="job-sheet-preview">{customerReportFields.map(field=><span key={field.key}><strong>{field.label}</strong><small>{String(job.worksheetResponses?.[field.key]??(field.optional?"No additional notes":"Not completed"))}</small></span>)}</div><div className="panel-heading"><div><h3>Job-specific checks</h3></div></div>{job.worksheetSchema.length?<div className="job-sheet-preview">{job.worksheetSchema.map(field=><span key={field.key}><strong>{field.label}</strong><small>{String(job.worksheetResponses?.[field.key]??"Not completed")}</small></span>)}</div>:<p className="subtle">No worksheet fields for this job type.</p>}{Boolean(job.customerSignature?.name)&&<p><strong>Customer acceptance:</strong> {String(job.customerSignature.name)}</p>}</section>
      <section className="panel job-paperwork"><div className="panel-heading"><div><h2>Photos & documents</h2><p>Evidence attached by office and field staff.</p></div></div><label className="paperwork-dropzone"><UploadCloud/><strong>{uploading?"Uploading…":"Add document"}</strong><input type="file" accept="image/*,.pdf" disabled={uploading} onChange={(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(file)void uploadEvidence(file);event.target.value="";}}/></label>{job.documents.length?<div className="job-document-list">{job.documents.map(document=><button key={document.id} type="button" onClick={()=>void openDocument(document)}><FileText/><span><strong>{document.name}</strong><small>{label(document.type)} · {dateTime(document.createdAt)}</small></span><ExternalLink/></button>)}</div>:<p className="subtle">No evidence attached yet.</p>}</section>
      {job.financialAccess&&<section className="panel"><div className="panel-heading"><div><h2><Coins size={19}/> Labour, parts & costs</h2><p>Commercial detail stays in the office; it is not shown to the driver.</p></div><strong>{pounds(totals.sell)}</strong></div><form className="form-grid" onSubmit={addCost}><label>Type<select value={cost.category} onChange={e=>setCost(v=>({...v,category:e.target.value}))}>{["LABOUR","PART","MATERIAL","EXPENSE","SUBCONTRACT","OTHER"].map(value=><option key={value}>{value}</option>)}</select></label><label>Description<input required value={cost.description} onChange={e=>setCost(v=>({...v,description:e.target.value}))}/></label><label>Qty<input type="number" min="0.01" step="0.01" value={cost.quantity} onChange={e=>setCost(v=>({...v,quantity:e.target.value}))}/></label><label>Cost £<input type="number" min="0" step="0.01" value={cost.unitCost} onChange={e=>setCost(v=>({...v,unitCost:e.target.value}))}/></label><label>Sell £<input type="number" min="0" step="0.01" value={cost.unitSell} onChange={e=>setCost(v=>({...v,unitSell:e.target.value}))}/></label><button className="secondary-button" disabled={busy}>Add</button></form>{job.costs.map(line=><p key={line.id}><strong>{line.description}</strong> · {line.quantity} × {pounds(line.unitSellPence)}</p>)}</section>}
      <section className="panel"><div className="panel-heading"><div><h2><MessageSquarePlus size={19}/> Job history</h2><p>Notes and accountable events stay with the job.</p></div></div><form onSubmit={addNote}><label>Office note<textarea rows={3} value={note} onChange={e=>setNote(e.target.value)}/></label><button className="secondary-button" disabled={busy}>Add note</button></form><div className="job-timeline">{job.timeline.slice(0,20).map(item=><article key={item.id}><strong>{item.summary}</strong><small>{dateTime(item.createdAt)}</small>{item.detail&&<p>{item.detail}</p>}</article>)}</div></section>
    </>}
  </section>;
}

