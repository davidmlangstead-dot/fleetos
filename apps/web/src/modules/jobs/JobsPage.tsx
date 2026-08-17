import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardCheck, FileText, KanbanSquare, List, Mail, Plus, Search, Send, Settings2, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { JobDetails } from "./JobDetails";
import { JobTypeManager } from "./JobTypeManager";
import { JobWizard } from "./JobWizard";
import type { JobConfig, JobRow } from "./types";

type View="BOARD"|"LIST"|"TYPES";
const boardColumns=[{key:"BACKLOG",name:"Backlog",statuses:["DRAFT","PLANNED","ASSIGNED"]},{key:"SCHEDULED",name:"Scheduled",statuses:["SCHEDULED","DISPATCHED"]},{key:"ACTIVE",name:"In progress",statuses:["TRAVELLING","ON_SITE","PAUSED","IN_PROGRESS"]},{key:"COMPLETE",name:"Completed",statuses:["DELIVERED","COMPLETED","COMPLETED_ISSUES","CLOSED"]}];
const sheetStages=[
  {key:"TO_SEND",label:"Office to send",detail:"Jobs ready to issue to the driver",statuses:["DRAFT","PLANNED","ASSIGNED","SCHEDULED"],Icon:Send},
  {key:"WITH_DRIVER",label:"With driver",detail:"Sent out or being completed in the field",statuses:["DISPATCHED","TRAVELLING","ON_SITE","PAUSED","IN_PROGRESS"],Icon:ClipboardCheck},
  {key:"RETURNED",label:"Returned to office",detail:"Driver has finished and office needs to check",statuses:["COMPLETED","COMPLETED_ISSUES"],Icon:FileText},
  {key:"APPROVED",label:"Approved / report",detail:"Ready for PDF report and email trail",statuses:["CLOSED","DELIVERED"],Icon:Mail},
] as const;
type SheetStageKey=typeof sheetStages[number]["key"];
const label=(value:string)=>value.replaceAll("_"," ");const date=(value:string|null)=>value?new Date(value).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"Unscheduled";
function matchesSheetStage(job:JobRow,stage:typeof sheetStages[number]){
  if(stage.key==="APPROVED")return Boolean(job.officeApprovedAt||job.reportGeneratedAt||job.reportEmailedAt)||stage.statuses.some(status=>status===job.status);
  if(stage.key==="RETURNED")return Boolean(job.submittedByDriverAt&&!job.officeApprovedAt)||stage.statuses.some(status=>status===job.status);
  if(stage.key==="WITH_DRIVER")return Boolean(job.issuedToDriverAt&&!job.submittedByDriverAt)||stage.statuses.some(status=>status===job.status);
  return !job.issuedToDriverAt&&stage.statuses.some(status=>status===job.status);
}
function sheetStageLabel(job:JobRow){
  if(job.reportEmailedAt)return "Report emailed";
  if(job.reportGeneratedAt)return "PDF created";
  if(job.officeApprovedAt)return "Approved / send report";
  if(job.submittedByDriverAt||["COMPLETED","COMPLETED_ISSUES"].includes(job.status))return "Needs office check";
  if(job.issuedToDriverAt||["DISPATCHED","TRAVELLING","ON_SITE","PAUSED","IN_PROGRESS"].includes(job.status))return "With driver";
  return "Office to send";
}

export function JobsPage(){
  const [jobs,setJobs]=useState<JobRow[]>([]);const [config,setConfig]=useState<JobConfig|null>(null);const [view,setView]=useState<View>("BOARD");const [search,setSearch]=useState("");const [trade,setTrade]=useState("ALL");const [sheetStage,setSheetStage]=useState<SheetStageKey|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [showWizard,setShowWizard]=useState(false);const [selected,setSelected]=useState<string|null>(null);
  async function load(){setError("");try{const [nextJobs,nextConfig]=await Promise.all([api<JobRow[]>("/jobs"),api<JobConfig>("/jobs/config")]);setJobs(nextJobs);setConfig(nextConfig);}catch(reason){setError(reason instanceof Error?reason.message:"Could not load jobs.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  const activeSheetStage=sheetStages.find(stage=>stage.key===sheetStage)??null;
  const filtered=useMemo(()=>jobs.filter(job=>{const term=search.toLowerCase();return (!term||[job.reference,job.title,job.customerName,job.siteName,job.siteAddress,...job.assignments.map(a=>a.name)].some(value=>String(value??"").toLowerCase().includes(term)))&&(trade==="ALL"||job.trade===trade)&&(!activeSheetStage||matchesSheetStage(job,activeSheetStage));}),[jobs,search,trade,activeSheetStage]);
  const metrics=useMemo(()=>({open:jobs.filter(job=>!["COMPLETED","CLOSED","CANCELLED","DELIVERED"].includes(job.status)).length,today:jobs.filter(job=>job.scheduledStart&&new Date(job.scheduledStart).toDateString()===new Date().toDateString()).length,unassigned:jobs.filter(job=>!job.assignments.length&&!job.registration).length,urgent:jobs.filter(job=>["URGENT","EMERGENCY"].includes(job.priority)&&!["COMPLETED","CLOSED","CANCELLED"].includes(job.status)).length}),[jobs]);
  const sheetCounts=useMemo(()=>sheetStages.map(stage=>({...stage,count:jobs.filter(job=>matchesSheetStage(job,stage)).length})),[jobs]);
  if(selected)return <JobDetails id={selected} onClose={()=>setSelected(null)} onChanged={load}/>;
  return <section className="page jobs-page"><div className="page-heading"><div><p className="eyebrow">Field service operations</p><h1>Jobs & work orders</h1><p className="subtle">Run any trade, contract or transport workflow from booking through field completion and cost control.</p></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" to="/jobs/preflight" style={{display:"inline-flex",gap:7,alignItems:"center",textDecoration:"none"}}><ShieldCheck/> Dispatch preflight</Link><button className="primary-button" onClick={()=>setShowWizard(true)}><Plus/> Create job</button></div></div>{error&&<p role="alert" className="form-message error">{error}</p>}
    <div className="job-metrics"><article className="panel"><span>Open work</span><strong>{metrics.open}</strong></article><article className="panel"><span>Today</span><strong>{metrics.today}</strong></article><article className="panel"><span>Unallocated</span><strong>{metrics.unassigned}</strong></article><article className="panel"><span>Urgent / emergency</span><strong>{metrics.urgent}</strong></article></div>
    {!showWizard&&<section className="panel job-sheet-flow"><div><p className="eyebrow">Job sheet flow</p><h2>Office creates job → driver completes sheet → office approves PDF/email</h2><p className="subtle">Use this as the live handover queue. Open any job below to send, submit, approve, create the PDF report and record the email trail.</p></div><div>{sheetCounts.map(stage=>{const Icon=stage.Icon;return <button key={stage.key} type="button" className={sheetStage===stage.key?"active":""} onClick={()=>{setView("LIST");setTrade("ALL");setSearch("");setSheetStage(stage.key);}}><Icon/><span>{stage.label}</span><strong>{stage.count}</strong><small>{stage.detail}</small></button>;})}</div></section>}
    {showWizard&&config&&<JobWizard config={config} onCancel={()=>setShowWizard(false)} onComplete={()=>{setShowWizard(false);setLoading(true);void load();}}/>}
    {!showWizard&&<><nav className="job-view-tabs"><button className={view==="BOARD"?"active":""} onClick={()=>setView("BOARD")}><KanbanSquare/> Workflow board</button><button className={view==="LIST"?"active":""} onClick={()=>setView("LIST")}><List/> Job register</button><button className={view==="TYPES"?"active":""} onClick={()=>setView("TYPES")}><Settings2/> Job types</button></nav>{view!=="TYPES"&&<div className="job-toolbar panel"><div className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search reference, customer, site or assignee…"/></div><select value={trade} onChange={e=>setTrade(e.target.value)}><option value="ALL">All trades</option>{[...new Set(config?.jobTypes.map(type=>type.trade)??[])].map(value=><option key={value}>{value}</option>)}</select>{activeSheetStage&&<button type="button" className="sheet-filter-pill" onClick={()=>setSheetStage(null)}>{activeSheetStage.label} x</button>}<span>{filtered.length} jobs</span></div>}
      {view==="TYPES"&&config&&<JobTypeManager types={config.jobTypes} onSaved={load}/>} {loading&&<p className="empty-line">Loading jobs…</p>}
      {!loading&&view==="BOARD"&&<div className="job-board">{boardColumns.map(column=>{const items=filtered.filter(job=>column.statuses.includes(job.status));return <section key={column.key}><header><h2>{column.name}</h2><span>{items.length}</span></header><div>{items.map(job=><button className="job-card panel" key={job.id} onClick={()=>setSelected(job.id)} style={{"--job-colour":job.colour??"#718094"} as React.CSSProperties}><div><span className="job-colour"></span><small>{job.jobTypeName??job.trade??"Job"}</small><em className={`job-priority ${job.priority.toLowerCase()}`}>{job.priority}</em></div><strong>{job.reference} · {job.title}</strong><p>{job.customerName}</p><p>{job.siteName||job.siteAddress}</p><footer><span><CalendarDays/> {date(job.scheduledStart)}</span><span><Users/> {job.assignments.length?job.assignments.map(person=>person.name).join(", "):"Unallocated"}</span></footer></button>)}{!items.length&&<p className="board-empty">No jobs</p>}</div></section>})}</div>}
      {!loading&&view==="LIST"&&<section className="panel job-register"><div className="job-register-row heading"><span>Work order</span><span>Customer / site</span><span>Schedule / team</span><span>Status</span><span>Value</span></div>{activeSheetStage&&<div className="job-register-queue"><strong>{activeSheetStage.label}</strong><span>{activeSheetStage.detail}. Open a job to take the next audited action.</span></div>}{filtered.map(job=><button className="job-register-row" key={job.id} onClick={()=>setSelected(job.id)}><span><strong>{job.reference}</strong><small>{job.jobTypeName} · {job.title}</small></span><span><strong>{job.customerName}</strong><small>{job.siteName||job.siteAddress}</small></span><span><strong>{date(job.scheduledStart)}</strong><small>{job.assignments.map(person=>person.name).join(", ")||"Unallocated"}</small></span><span><em className={`driver-status ${job.status.toLowerCase()}`}>{label(job.status)}</em><small className={sheetStageLabel(job)==="Needs office check"?"needs-office-check":""}>{sheetStageLabel(job)}</small></span><span><strong>{job.quotePence?new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(job.quotePence/100):"—"}</strong><small>{job.purchaseOrderNumber||"No PO"}</small></span></button>)}{!filtered.length&&<div className="empty-state"><h2>No matching jobs</h2><p>Create a work order or change the filters.</p><button className="primary-button" onClick={()=>setShowWizard(true)}><Plus/> Create job</button></div>}</section>}
    </>}
  </section>;
}
