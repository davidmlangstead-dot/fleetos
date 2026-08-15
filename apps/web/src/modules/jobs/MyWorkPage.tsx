import { useEffect, useState } from "react";
import { BriefcaseBusiness, CalendarClock, ChevronLeft, MapPin, RefreshCw, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { JobDetails } from "./JobDetails";
import { useI18n } from "../../lib/i18n";

type Work={id:string;reference:string;title:string;description:string|null;status:string;priority:string;jobTypeName:string;trade:string;colour:string;scheduledStart:string|null;scheduledEnd:string|null;dueAt:string|null;customerName:string;siteName:string|null;siteAddress:string|null;sitePostcode:string|null;accessNotes:string|null;assetName:string|null;registration:string|null;assignments:Array<{id:string;name:string}>};
export function MyWorkPage(){
  const {t,locale}=useI18n();
  const date=(value:string|null)=>value?new Date(value).toLocaleString(locale,{dateStyle:"medium",timeStyle:"short"}):t("driver.awaitingSchedule");
  const [jobs,setJobs]=useState<Work[]>([]);const [selected,setSelected]=useState<string|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  async function load(){setError("");try{setJobs(await api<Work[]>("/jobs/my-work"));}catch(reason){setError(reason instanceof Error?reason.message:"Could not load assigned work.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  if(selected)return <main className="driver-field-app driver-field-subpage"><JobDetails id={selected} fieldMode onClose={()=>setSelected(null)} onChanged={load}/></main>;
  return <main className="driver-field-app driver-field-subpage">
    <header className="driver-field-header"><div><small>{t("driver.brand")}</small><strong>{t("driver.myWork")}</strong></div><Link className="driver-field-header-link" to="/driver"><ChevronLeft size={18}/> {t("driver.today")}</Link></header>
    <section className="field-flow driver-dark-page">
      <div className="field-flow-title"><BriefcaseBusiness/><div><small>{t("driver.mobileWorkforce")}</small><h1>{t("driver.myWork")}</h1></div></div>
      <p className="field-helper">{t("driver.workIntro")}</p>
      <button className="field-refresh" onClick={()=>void load()}><RefreshCw/> {t("driver.refresh")}</button>
      {error&&<p className="field-message">{error}</p>}{loading&&<p className="field-helper">{t("driver.loading")}</p>}
      <div className="driver-dark-work-list">{jobs.map(job=><button key={job.id} className="driver-dark-work-card" onClick={()=>setSelected(job.id)} style={{"--job-colour":job.colour} as React.CSSProperties}><div className="driver-dark-work-meta"><span className="job-colour"></span><small>{job.trade} · {job.jobTypeName}</small><em className={`job-priority ${job.priority.toLowerCase()}`}>{job.priority}</em></div><h2>{job.reference} · {job.title}</h2>{job.description&&<p>{job.description}</p>}<dl><div><dt><CalendarClock/> {t("driver.appointment")}</dt><dd>{date(job.scheduledStart)}</dd></div><div><dt><MapPin/> {t("driver.site")}</dt><dd>{job.customerName}{job.siteName?` · ${job.siteName}`:""}<br/>{job.siteAddress} {job.sitePostcode}</dd></div><div><dt><Users/> {t("driver.team")}</dt><dd>{job.assignments.map(person=>person.name).join(", ")||t("driver.you")}</dd></div></dl><footer><span className={`driver-status ${job.status.toLowerCase()}`}>{job.status.replaceAll("_"," ")}</span><strong>{t("driver.openWork")}</strong></footer></button>)}{!loading&&!jobs.length&&<div className="driver-dark-card driver-dark-empty"><BriefcaseBusiness/><h2>{t("driver.noWork")}</h2><p>{t("driver.noWorkDetail")}</p></div>}</div>
    </section>
  </main>;
}

