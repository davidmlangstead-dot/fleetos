import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardCheck, List, MapPinned, Plus, Search, Settings2 } from "lucide-react";
import { api } from "../../lib/api";
import { JobDetails } from "./JobDetails";
import { JobTypeManager } from "./JobTypeManager";
import { JobWizard } from "./JobWizard";
import type { JobConfig, JobRow } from "./types";

type View="DISPATCH"|"JOBS"|"CUSTOMERS"|"REPORTS"|"TYPES";
const label=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase());
const date=(value:string|null)=>value?new Date(value).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"Not scheduled";
const finished=new Set(["COMPLETED","CLOSED","CANCELLED","DELIVERED"]);
const active=new Set(["TRAVELLING","ON_SITE","PAUSED","IN_PROGRESS"]);
const reportReady=(job:JobRow)=>Boolean(job.submittedByDriverAt||job.officeApprovedAt||job.reportGeneratedAt||job.reportEmailedAt);

export function JobsPage(){
  const [jobs,setJobs]=useState<JobRow[]>([]);
  const [config,setConfig]=useState<JobConfig|null>(null);
  const [view,setView]=useState<View>("DISPATCH");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [showWizard,setShowWizard]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);

  async function load(){setError("");try{const [nextJobs,nextConfig]=await Promise.all([api<JobRow[]>("/jobs"),api<JobConfig>("/jobs/config")]);setJobs(nextJobs);setConfig(nextConfig);}catch(reason){setError(reason instanceof Error?reason.message:"Could not load field service.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);

  const filtered=useMemo(()=>jobs.filter(job=>{const term=search.trim().toLowerCase();return !term||[job.reference,job.title,job.customerName,job.siteName,job.siteAddress,...job.assignments.map(a=>a.name)].some(value=>String(value??"").toLowerCase().includes(term));}),[jobs,search]);
  const attention=useMemo(()=>jobs.filter(job=>!finished.has(job.status)&&(["URGENT","EMERGENCY"].includes(job.priority)||!job.assignments.length)),[jobs]);
  const inProgress=useMemo(()=>jobs.filter(job=>active.has(job.status)),[jobs]);
  const today=useMemo(()=>jobs.filter(job=>job.scheduledStart&&new Date(job.scheduledStart).toDateString()===new Date().toDateString()&&!finished.has(job.status)),[jobs]);
  const reports=useMemo(()=>jobs.filter(job=>reportReady(job)&&job.status!=="CANCELLED").sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()),[jobs]);
  const dispatch=useMemo(()=>jobs.filter(job=>!finished.has(job.status)).sort((a,b)=>{
    const aTime=a.scheduledStart?new Date(a.scheduledStart).getTime():Number.MAX_SAFE_INTEGER;
    const bTime=b.scheduledStart?new Date(b.scheduledStart).getTime():Number.MAX_SAFE_INTEGER;
    return aTime-bTime;
  }),[jobs]);

  if(selected)return <JobDetails id={selected} onClose={()=>setSelected(null)} onChanged={load}/>;

  return <section className="page jobs-page">
    <div className="page-heading">
      <div><p className="eyebrow">Field service</p><h1>Jobs</h1><p className="subtle">One job from office booking to field completion, customer report and history.</p></div>
      <button className="primary-button" onClick={()=>setShowWizard(true)}><Plus/> New job</button>
    </div>
    {error&&<p role="alert" className="form-message error">{error}</p>}

    {showWizard&&config?<JobWizard config={config} onCancel={()=>setShowWizard(false)} onComplete={()=>{setShowWizard(false);setLoading(true);void load();}}/>:<>
      <div className="job-metrics">
        <article className="panel"><span>Needs attention</span><strong>{attention.length}</strong><small>Urgent or unallocated</small></article>
        <article className="panel"><span>Today</span><strong>{today.length}</strong><small>Scheduled today</small></article>
        <article className="panel"><span>In the field</span><strong>{inProgress.length}</strong><small>Travelling or on site</small></article>
        <article className="panel"><span>Reports back</span><strong>{reports.length}</strong><small>Returned from field staff</small></article>
      </div>

      <nav className="job-view-tabs">
        <button className={view==="DISPATCH"?"active":""} onClick={()=>setView("DISPATCH")}><CalendarDays/> Dispatch</button>
        <button className={view==="JOBS"?"active":""} onClick={()=>setView("JOBS")}><List/> Jobs</button>
        <button className={view==="CUSTOMERS"?"active":""} onClick={()=>setView("CUSTOMERS")}><MapPinned/> Customers & sites</button>
        <button className={view==="REPORTS"?"active":""} onClick={()=>setView("REPORTS")}><ClipboardCheck/> Reports</button>
        <button className={view==="TYPES"?"active":""} onClick={()=>setView("TYPES")}><Settings2/> Setup</button>
      </nav>

      {view==="TYPES"&&config&&<JobTypeManager types={config.jobTypes} onSaved={load}/>} 

      {(view==="DISPATCH"||view==="JOBS")&&<>
        <div className="job-toolbar panel"><div className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job, customer, site or staff…"/></div><span>{view==="DISPATCH"?dispatch.length:filtered.length} jobs</span></div>
        {loading?<p className="empty-line">Loading jobs…</p>:<section className="panel job-register">
          <div className="job-register-row heading"><span>Job</span><span>Customer / site</span><span>When / who</span><span>Status</span><span>Next</span></div>
          {(view==="DISPATCH"?dispatch:filtered).map(job=><button className="job-register-row" key={job.id} onClick={()=>setSelected(job.id)}>
            <span><strong>{job.reference}</strong><small>{job.title}</small></span>
            <span><strong>{job.customerName}</strong><small>{job.siteName||job.siteAddress}</small></span>
            <span><strong>{date(job.scheduledStart)}</strong><small>{job.assignments.map(person=>person.name).join(", ")||"Needs assigning"}</small></span>
            <span><em className={`driver-status ${job.status.toLowerCase()}`}>{label(job.status)}</em></span>
            <span><strong>{!job.assignments.length?"Assign":active.has(job.status)?"Field working":reportReady(job)?"Review report":"Await field work"}</strong><small>{job.registration?`Vehicle ${job.registration}`:"Open job"}</small></span>
          </button>)}
          {!(view==="DISPATCH"?dispatch:filtered).length&&<div className="empty-state"><h2>{view==="DISPATCH"?"Nothing waiting to dispatch":"No jobs found"}</h2><p>Create a job once, assign staff and it will appear in their field app.</p><button className="primary-button" onClick={()=>setShowWizard(true)}><Plus/> New job</button></div>}
        </section>}
      </>}

      {view==="CUSTOMERS"&&config&&<section className="panel job-register">
        <div className="job-register-row heading"><span>Customer</span><span>Sites</span><span>Contact</span><span>Jobs</span><span>History</span></div>
        {config.customers.map(customer=>{const sites=config.sites.filter(site=>site.customerId===customer.id);const customerJobs=jobs.filter(job=>job.customerName===customer.name);return <div className="job-register-row" key={customer.id}>
          <span><strong>{customer.name}</strong><small>{customer.accountReference||"No account reference"}</small></span>
          <span><strong>{sites.length}</strong><small>{sites.slice(0,2).map(site=>site.name).join(", ")||"No saved sites"}</small></span>
          <span><strong>{customer.phone||customer.email||"—"}</strong><small>{customer.email&&customer.phone?customer.email:""}</small></span>
          <span><strong>{customerJobs.filter(job=>!finished.has(job.status)).length} open</strong><small>{customerJobs.length} total</small></span>
          <span><strong>{customerJobs.filter(job=>finished.has(job.status)).length} completed</strong><small>Job history retained</small></span>
        </div>;})}
        {!config.customers.length&&<div className="empty-state"><h2>No customers yet</h2><p>Create the first job and the customer/site can be captured there with minimum entry.</p><button className="primary-button" onClick={()=>setShowWizard(true)}><Plus/> New job</button></div>}
      </section>}

      {view==="REPORTS"&&<section className="panel job-register">
        <div className="job-register-row heading"><span>Report</span><span>Customer / site</span><span>Field staff</span><span>Stage</span><span>Delivery</span></div>
        {reports.map(job=><button className="job-register-row" key={job.id} onClick={()=>setSelected(job.id)}>
          <span><strong>{job.reference}</strong><small>{job.title}</small></span>
          <span><strong>{job.customerName}</strong><small>{job.siteName||job.siteAddress}</small></span>
          <span><strong>{job.assignments.map(person=>person.name).join(", ")||"—"}</strong><small>{job.submittedByDriverAt?`Returned ${date(job.submittedByDriverAt)}`:""}</small></span>
          <span><strong>{job.officeApprovedAt?"Approved":"Review needed"}</strong><small>{job.reportGeneratedAt?"PDF generated":"Open to review"}</small></span>
          <span><strong>{job.reportEmailedAt?"Sent":"Not sent"}</strong><small>{job.reportEmailTo||"Open report"}</small></span>
        </button>)}
        {!reports.length&&<div className="empty-state"><h2>No field reports back yet</h2><p>When field staff complete a job, its report appears here for office review and customer delivery.</p></div>}
      </section>}
    </>}
  </section>;
}
