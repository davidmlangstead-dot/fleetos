import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, CircleDollarSign, HeartPulse, ReceiptText, ShieldCheck, Store, Users } from "lucide-react";
import { api } from "../../lib/api";

type Portfolio = {
  companyId:string; companyName:string; slug:string; subscriptionPlan:string; subscriptionStatus:string;
  trialEndsAt:string|null; trialDaysRemaining:number|null; trialExpired:boolean; readOnly:boolean;
  vehicleLimit:number; vehicleUsage:number; members:number; commitmentMonths:number; commitmentStartedAt:string|null; commitmentEndsAt:string|null;
  resellerId:string|null; wholesaleMonthlyPence:number|null; retailMonthlyPence:number|null;
};
type Reseller={id:string;name:string;status:string;customers:number;vehicles:number;wholesalePence:number};
const money=(p:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(p/100);

function useOwnerData() {
  const [portfolio,setPortfolio]=useState<Portfolio[]>([]);
  const [resellers,setResellers]=useState<Reseller[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{void Promise.all([api<Portfolio[]>("/commercial/portfolio"),api<Reseller[]>("/resellers")]).then(([companies,agents])=>{setPortfolio(companies);setResellers(agents);}).catch(err=>setError(err instanceof Error?err.message:"Unable to load owner dashboard"));},[]);
  const totals=useMemo(()=>({
    active:portfolio.filter(c=>c.subscriptionStatus==="ACTIVE").length,
    trials:portfolio.filter(c=>c.subscriptionStatus==="TRIAL").length,
    issues:portfolio.filter(c=>c.readOnly).length,
    vehicles:portfolio.reduce((n,c)=>n+c.vehicleUsage,0),
    wholesale:resellers.reduce((n,r)=>n+r.wholesalePence,0),
    retail:portfolio.reduce((n,c)=>n+(c.retailMonthlyPence??0),0),
  }),[portfolio,resellers]);
  return {portfolio,resellers,error,totals};
}

export function PlatformControlPage() {
  const {portfolio,resellers,error,totals}=useOwnerData();
  const links=[
    {label:"Customers",description:`${portfolio.length} companies · ${totals.vehicles} vehicles`,to:"/control/customers",Icon:Building2,tone:"blue"},
    {label:"Agents / Resellers",description:`${resellers.length} reseller accounts`,to:"/reseller",Icon:Store,tone:"violet"},
    {label:"Money",description:`${money(totals.wholesale)} recorded wholesale MRR`,to:"/control/money",Icon:CircleDollarSign,tone:"green"},
    {label:"Trials & Plans",description:`${totals.trials} trials · ${totals.issues} need attention`,to:"/settings/beta",Icon:ReceiptText,tone:"orange"},
    {label:"Platform Health",description:"Simple system status and Medic",to:"/settings/medic",Icon:HeartPulse,tone:"red"},
    {label:"Audit",description:"Who changed what and when",to:"/settings/audit",Icon:ShieldCheck,tone:"blue"},
  ] as const;

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">FleetOS owner</p><h1>Control dashboard</h1><p className="subtle">Pick what you want to manage. The detail stays inside each section.</p></div></div>
    {error&&<p className="form-message error">{error}</p>}
    <div className="metric-grid">{links.map(({label,description,to,Icon,tone})=><Link key={label} to={to} className="metric-card" style={{textDecoration:"none",color:"inherit"}}><div className={`metric-icon ${tone}`}><Icon size={21}/></div><div><strong style={{display:"block",marginBottom:4}}>{label}</strong><small>{description}</small></div><ArrowRight size={17}/></Link>)}</div>
    <section className="panel" style={{marginTop:24}}><div className="panel-heading"><div><h2>At a glance</h2><p>Only the numbers you need on the home screen.</p></div></div><div className="metric-grid">
      <div className="metric-card"><div className="metric-icon blue"><Users size={21}/></div><div><p>Customers</p><strong>{portfolio.length}</strong><small>{totals.active} paid · {totals.trials} trial</small></div></div>
      <div className="metric-card"><div className="metric-icon green"><CircleDollarSign size={21}/></div><div><p>Wholesale MRR</p><strong>{money(totals.wholesale)}</strong><small>Recorded before Stripe automation</small></div></div>
      <div className="metric-card"><div className="metric-icon orange"><ReceiptText size={21}/></div><div><p>Need attention</p><strong>{totals.issues}</strong><small>Expired, past due or cancelled</small></div></div>
    </div></section>
  </section>;
}

export function PlatformCustomersPage(){
  const {portfolio,error}=useOwnerData();
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">Control · Customers</p><h1>Customers</h1><p className="subtle">Every FleetOS customer company in one place.</p></div><Link className="secondary-button" to="/control">Back to control</Link></div>{error&&<p className="form-message error">{error}</p>}<div className="metric-grid">{portfolio.map(c=><article className="metric-card" key={c.companyId}><div className={`metric-icon ${c.readOnly?"red":c.subscriptionStatus==="TRIAL"?"orange":"green"}`}><Building2 size={21}/></div><div><strong>{c.companyName}</strong><small style={{display:"block",marginTop:4}}>{c.vehicleUsage}/{c.vehicleLimit} vehicles · {c.subscriptionStatus.toLowerCase().replaceAll("_"," ")}</small><small>{c.readOnly?"Needs attention · read-only":c.subscriptionStatus==="TRIAL"?`${c.trialDaysRemaining??0} trial days left`:c.subscriptionPlan.replaceAll("_"," ")}</small></div></article>)}</div>{portfolio.length===0&&<div className="panel"><p>No customer companies yet.</p></div>}</section>;
}

export function PlatformMoneyPage(){
  const {portfolio,resellers,error,totals}=useOwnerData();
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">Control · Money</p><h1>Money</h1><p className="subtle">A simple commercial view. Payment automation can plug in here later.</p></div><Link className="secondary-button" to="/control">Back to control</Link></div>{error&&<p className="form-message error">{error}</p>}<div className="metric-grid">
    <div className="metric-card"><div className="metric-icon green"><CircleDollarSign size={21}/></div><div><p>Wholesale MRR</p><strong>{money(totals.wholesale)}</strong><small>Recorded reseller value</small></div></div>
    <div className="metric-card"><div className="metric-icon blue"><ReceiptText size={21}/></div><div><p>Retail MRR recorded</p><strong>{money(totals.retail)}</strong><small>Customer retail values currently stored</small></div></div>
    <div className="metric-card"><div className="metric-icon violet"><Building2 size={21}/></div><div><p>Paid customers</p><strong>{totals.active}</strong><small>{totals.trials} trials</small></div></div>
  </div><section className="panel" style={{marginTop:24}}><div className="panel-heading"><div><h2>Agents / reseller value</h2><p>Wholesale amounts recorded against each reseller.</p></div></div><div className="metric-grid">{resellers.map(r=><article className="metric-card" key={r.id}><div className="metric-icon violet"><Store size={21}/></div><div><strong>{r.name}</strong><small style={{display:"block",marginTop:4}}>{r.customers} customers · {r.vehicles} vehicles</small><small>{money(r.wholesalePence)} / month wholesale</small></div></article>)}</div>{resellers.length===0&&<p>No reseller values recorded yet.</p>}</section><section className="panel" style={{marginTop:24}}><p className="subtle">Stripe is not connected yet, so these are FleetOS commercial records rather than confirmed payment receipts.</p></section></section>;
}
