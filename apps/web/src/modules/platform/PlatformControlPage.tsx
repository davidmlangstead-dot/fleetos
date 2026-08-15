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
  const [portfolio,setPortfolio]=useState<Portfolio[]>([]); const [resellers,setResellers]=useState<Reseller[]>([]); const [error,setError]=useState("");
  useEffect(()=>{void Promise.all([api<Portfolio[]>("/commercial/portfolio"),api<Reseller[]>("/resellers")]).then(([companies,agents])=>{setPortfolio(companies);setResellers(agents);}).catch(err=>setError(err instanceof Error?err.message:"Unable to load platform controls"));},[]);
  const totals=useMemo(()=>({vehicles:portfolio.reduce((n,c)=>n+c.vehicleUsage,0),active:portfolio.filter(c=>c.subscriptionStatus==="ACTIVE").length,trials:portfolio.filter(c=>c.subscriptionStatus==="TRIAL").length,readOnly:portfolio.filter(c=>c.readOnly).length,wholesale:resellers.reduce((n,r)=>n+r.wholesalePence,0)}),[portfolio,resellers]);

  return <div className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">Platform owner</p><h1>FleetOS Control</h1><p>Your private control room for customer companies, resellers, subscriptions and platform health.</p></div></div>
    {error&&<p className="form-message">{error}</p>}
    <div className="stat-grid">
      <article className="stat-card"><span>Customer companies</span><strong>{portfolio.length}</strong><small>{totals.active} paid · {totals.trials} trial</small></article>
      <article className="stat-card"><span>Vehicles managed</span><strong>{totals.vehicles}</strong><small>Across all customer tenants</small></article>
      <article className="stat-card"><span>Resellers</span><strong>{resellers.length}</strong><small>{resellers.filter(r=>r.status==="ACTIVE").length} active channels</small></article>
      <article className="stat-card"><span>Wholesale MRR recorded</span><strong>{money(totals.wholesale)}</strong><small>Before Stripe automation</small></article>
      <article className="stat-card"><span>Read-only companies</span><strong>{totals.readOnly}</strong><small>Expired / past due / cancelled</small></article>
    </div>
    <section className="dashboard-section"><div className="section-heading"><div><p className="eyebrow">Customer portfolio</p><h2>Commercial state by company</h2></div></div>{portfolio.length===0?<p>No companies returned.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Company</th><th align="left">Plan</th><th align="left">Status</th><th align="right">Vehicles</th><th align="left">Trial</th><th align="left">Commitment</th><th align="left">Access</th></tr></thead><tbody>{portfolio.map(c=><tr key={c.companyId}><td><strong>{c.companyName}</strong><br/><small>{c.slug}</small></td><td>{c.subscriptionPlan}</td><td>{c.subscriptionStatus}</td><td align="right">{c.vehicleUsage}/{c.vehicleLimit}</td><td>{c.subscriptionStatus==="TRIAL"?(c.trialExpired?"Expired":`${c.trialDaysRemaining??0} days`):"—"}</td><td>{c.commitmentMonths}m{c.commitmentEndsAt?` · to ${new Date(c.commitmentEndsAt).toLocaleDateString("en-GB")}`:""}</td><td>{c.readOnly?"Read-only":"Writable"}</td></tr>)}</tbody></table></div>}</section>
    <section className="dashboard-section"><div className="section-heading"><div><p className="eyebrow">Reseller channel</p><h2>White-label partners</h2></div></div>{resellers.length===0?<p>No reseller records yet.</p>:<div className="action-grid">{resellers.map(r=><article className="action-card" key={r.id}><strong>{r.name}</strong><span>{r.customers} customers · {r.vehicles} vehicles · {money(r.wholesalePence)} wholesale/month</span></article>)}</div>}</section>
    <section className="dashboard-section"><div className="section-heading"><div><p className="eyebrow">Commercial control</p><h2>Owner tools</h2></div></div><div className="action-grid"><a className="action-card" href="/settings/beta"><strong>Subscriptions & trials</strong><span>90-day trials, status, commitment and vehicle allowances.</span></a><a className="action-card" href="/reseller"><strong>Resellers & white label</strong><span>Create agents, grant reseller membership and track wholesale relationships.</span></a><a className="action-card" href="/settings/medic"><strong>Platform health</strong><span>Open FleetOS Medic and operational safeguards.</span></a><a className="action-card" href="/settings/audit"><strong>Audit trail</strong><span>Review recorded company activity.</span></a></div></section>
    <section className="dashboard-section"><p className="eyebrow">Architecture</p><h2>One application, separated control planes</h2><p>Customers use the normal dashboard. Platform owners use <strong>/control</strong>. Reseller members use <strong>/reseller</strong>. The underlying platform remains shared so fixes and upgrades can be shipped once.</p></section>
  </div>;
}
