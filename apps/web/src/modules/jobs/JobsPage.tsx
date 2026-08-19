import { useEffect, useMemo, useState } from "react";
import { CalendarDays, List, Plus, Search, Settings2, Users } from "lucide-react";
import { api } from "../../lib/api";
import { JobDetails } from "./JobDetails";
import { JobTypeManager } from "./JobTypeManager";
import { JobWizard } from "./JobWizard";
import type { JobConfig, JobRow } from "./types";

type View="JOBS"|"TYPES";
const label=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase());
const date=(value:string|null)=>value?new Date(value).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"Not scheduled";
const finished=new Set(["COMPLETED","CLOSED","CANCELLED","DELIVERED"]);
const active=new Set(["TRAVELLING","ON_SITE","PAUSED","IN_PROGRESS"]);

export function JobsPage(){
  const [jobs,setJobs]=useState<JobRow[]>([]);
  const [config,setConfig]=useState<JobConfig|null>(null);
  const [view,setView]=useState<View>("JOBS");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [showWizard,setShowWizard]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);

  async function load(){setError("");try{const [nextJobs,nextConfig]=await Promise.all([api<JobRow[]>("/jobs"),api<JobConfig>("/jobs/config")]);setJobs(nextJobs);setConfig(nextConfig);}catch(reason){setError(reason instanceof Error?reason.message:"Could not load jobs.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);

  const filtered=useMemo(()=>jobs.filter(job=>{const term=search.trim().toLowerCase();return !term||[job.reference,job.title,job.customerName,job.siteName,job.siteAddress,...job.assignments.map(a=>a.name)].some(value=>String(value??"").toLowerCase().includes(term));}),[jobs,search]);
  const attention=useMemo(()=>jobs.filter(job=>!finished.has(job.status)&&(["URGENT","EMERGENCY"].includes(job.priority)||!job.assignments.length)),[jobs]);
  const inProgress=useMemo(()=>jobs.filter(job=>active.has(job.status)),[jobs]);
  const today=useMemo(()=>jobs.filter(job=>job.scheduledStart&&new Date(job.scheduledStart).toDateString()===new Date().toDateString()&&!finished.has(job.status)),[jobs]);
  const completed=useMemo(()=>jobs.filter(job=>finished.has(job.status)&&job.status!=="CANCELLED"),[jobs]);

  if(selected)return <JobDetails id={selected} onClose={()=>setSelected(null)} onChanged={load}/>;

  return <section className="page jobs-page">
    <div className="page-heading">
      <div><p className="eyebrow">Jobs</p><h1>Jobs</h1><p className="subtle">Create the work once. Assigned staff receive it in Driver; completed reports return here.</p></div>
      <button className="primary-button" onClick={()=>setShowWizard(true)}><Plus/> New job</button>
    </div>
    {error&&<p role="alert" className="form-message error">{error}</p>}

    {showWizard&&config?<JobWizard config={config} onCancel={()=>setShowWizard(false)} onComplete={()=>{setShowWizard(false);setLoading(true);void load();}}/>:<>
      <div className="job-metrics">
        <article className="panel"><span>Needs attention</span><strong>{attention.length}</strong><small>Urgent or unallocated</small></article>
        <article className="panel"><span>Today</span><strong>{today.length}</strong><small>Scheduled today</small></article>
        <article className="panel"><span>Out working</span><strong>{inProgress.length}</strong><small>With field staff</small></article>
        <article className="panel"><span>Reports</span><strong>{completed.length}</strong><small>Completed jobs</small></article>
      </div>

      <nav className="job-view-tabs">
        <button className={view==="JOBS"?"active":""} onClick={()=>setView("JOBS")}><List/> Jobs</button>
        <button className={view==="TYPES"?"active":""} onClick={()=>setView("TYPES")}><Settings2/> Job types</button>
      </nav>

      {view==="TYPES"&&config&&<JobTypeManager types={config.jobTypes} onSaved={load}/>} 
      {view==="JOBS"&&<>
        <div className="job-toolbar panel"><div className="search"><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job, customer, site or staff…"/></div><span>{filtered.length} jobs</span></div>
        {loading?<p className="empty-line">Loading jobs…</p>:<section className="panel job-register">
          <div className="job-register-row heading"><span>Job</span><span>Customer / site</span><span>When / who</span><span>Status</span><span>Report</span></div>
          {filtered.map(job=><button className="job-register-row" key={job.id} onClick={()=>setSelected(job.id)}>
            <span><strong>{job.reference}</strong><small>{job.title}</small></span>
            <span><strong>{job.customerName}</strong><small>{job.siteName||job.siteAddress}</small></span>
            <span><strong>{date(job.scheduledStart)}</strong><small>{job.assignments.map(person=>person.name).join(", ")||"Needs assigning"}</small></span>
            <span><em className={`driver-status ${job.status.toLowerCase()}`}>{label(job.status)}</em></span>
            <span><strong>{finished.has(job.status)&&job.status!=="CANCELLED"?"Ready":"—"}</strong><small>{finished.has(job.status)&&job.status!=="CANCELLED"?"Open to review / send":active.has(job.status)?"Driver working":"Awaiting work"}</small></span>
          </button>)}
          {!filtered.length&&<div className="empty-state"><h2>No jobs found</h2><p>Create a job and assign it. The driver receives it automatically.</p><button className="primary-button" onClick={()=>setShowWizard(true)}><Plus/> New job</button></div>}
        </section>}
      </>}
    </>}
  </section>;
}
