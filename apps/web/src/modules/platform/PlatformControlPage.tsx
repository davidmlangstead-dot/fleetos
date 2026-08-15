import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type Portfolio = {
  companyId:string; companyName:string; slug:string; subscriptionPlan:string; subscriptionStatus:string;
  trialEndsAt:string|null; trialDaysRemaining:number|null; trialExpired:boolean; readOnly:boolean;
  vehicleLimit:number; vehicleUsage:number; members:number; commitmentMonths:number; commitmentStartedAt:string|null; commitmentEndsAt:string|null;
  resellerId:string|null; wholesaleMonthlyPence:number|null; retailMonthlyPence:number|null;
};
type Reseller={id:string;name:string;status:string;customers:number;vehicles:number;wholesalePence:number};
const money=(p:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(p/100);

export function PlatformControlPage() {
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
  }),[portfolio,resellers]);

  return <div className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">Owner home</p><h1>FleetOS Control</h1><p>A simple view of the business. Open a section only when you need the detail.</p></div></div>
    {error&&<p className="form-message">{error}</p>}

    <div className="action-grid">
      <a className="action-card" href="#customers"><strong>Customers</strong><span>{portfolio.length} companies · {totals.vehicles} vehicles</span><small>{totals.active} paid · {totals.trials} on trial · {totals.issues} need attention</small></a>
      <a className="action-card" href="/reseller"><strong>Agents / Resellers</strong><span>{resellers.length} reseller accounts</span><small>Customers, branding and wholesale relationships</small></a>
      <a className="action-card" href="#money"><strong>Money</strong><span>{money(totals.wholesale)} recorded wholesale MRR</span><small>Billing detail stays simple until Stripe is connected</small></a>
      <a className="action-card" href="/settings/medic"><strong>Platform health</strong><span>{totals.issues===0?"No commercial access issues":"Some companies need attention"}</span><small>Open Medic for technical detail only when needed</small></a>
    </div>

    <section className="dashboard-section" id="customers">
      <div className="section-heading"><div><p className="eyebrow">Customers</p><h2>Who is using FleetOS</h2></div></div>
      {portfolio.length===0?<p>No customer companies yet.</p>:<div className="action-grid">{portfolio.map(c=><article className="action-card" key={c.companyId}><strong>{c.companyName}</strong><span>{c.vehicleUsage} / {c.vehicleLimit} vehicles · {c.subscriptionStatus.toLowerCase().replaceAll("_"," ")}</span><small>{c.readOnly?"Needs attention · read-only":c.subscriptionStatus==="TRIAL"?`${c.trialDaysRemaining??0} trial days left`:c.subscriptionPlan.replaceAll("_"," ")}</small></article>)}</div>}
    </section>

    <section className="dashboard-section" id="money">
      <div className="section-heading"><div><p className="eyebrow">Money</p><h2>Simple commercial picture</h2></div></div>
      <div className="stats-grid">
        <article className="stat-card"><span>Paid customers</span><strong>{totals.active}</strong></article>
        <article className="stat-card"><span>Trials</span><strong>{totals.trials}</strong></article>
        <article className="stat-card"><span>Need attention</span><strong>{totals.issues}</strong></article>
        <article className="stat-card"><span>Wholesale MRR</span><strong>{money(totals.wholesale)}</strong></article>
      </div>
      <p className="subtle">When Stripe is connected, this section can add failed payments, conversion dates and actual recurring revenue without making the home screen technical.</p>
    </section>
  </div>;
}
