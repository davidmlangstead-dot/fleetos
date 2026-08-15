import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Reseller={id:string;name:string;slug:string;status:string;customers:number;vehicles:number;wholesalePence?:number;supportEmail:string|null;wholesaleModel:string;role?:string};
type Customer={id:string;name:string;slug:string;subscriptionPlan:string;subscriptionStatus:string;trialEndsAt:string|null;vehicleLimit:number;vehicleUsage:number;wholesaleMonthlyPence:number|null;retailMonthlyPence:number|null};
type PlatformIdentity={isPlatformOwner:boolean};
const money=(p:number|null|undefined)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format((p??0)/100);

export function ResellerPortalPage() {
  const [isOwner,setIsOwner]=useState(false);
  const [resellers,setResellers]=useState<Reseller[]>([]);
  const [selected,setSelected]=useState<string>("");
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [message,setMessage]=useState("");
  const [name,setName]=useState(""); const [slug,setSlug]=useState(""); const [email,setEmail]=useState("");
  const [inviteEmail,setInviteEmail]=useState("");
  const [resellerInviteUrl,setResellerInviteUrl]=useState("");
  const [customerInviteUrl,setCustomerInviteUrl]=useState("");

  async function load(){
    const platform=await api<PlatformIdentity>("/platform/me");
    setIsOwner(platform.isPlatformOwner);
    const rows=platform.isPlatformOwner?await api<Reseller[]>("/resellers"):await api<Reseller[]>("/resellers/mine");
    setResellers(rows);
    if(!selected&&rows[0])setSelected(rows[0].id);
  }
  useEffect(()=>{void load().catch(e=>setMessage(e instanceof Error?e.message:"Could not load reseller portal"));},[]);
  useEffect(()=>{if(!selected){setCustomers([]);return;}void api<Customer[]>(`/resellers/${selected}/customers`).then(setCustomers).catch(e=>setMessage(e instanceof Error?e.message:"Could not load reseller customers"));},[selected]);

  async function create(event:React.FormEvent){
    event.preventDefault();setMessage("");
    try{
      const r=await api<Reseller>("/resellers",{method:"POST",body:JSON.stringify({name,slug,supportEmail:email||undefined,wholesaleModel:"PER_TENANT",branding:{}})});
      setName("");setSlug("");setEmail("");setSelected(r.id);setMessage("Reseller created. Generate an invitation link below.");await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not create reseller");}
  }

  async function createResellerInvite(event:React.FormEvent){
    event.preventDefault();if(!selected)return;setMessage("");setResellerInviteUrl("");
    try{
      const result=await api<{inviteUrl:string;expiresAt:string}>(`/resellers/${selected}/invites`,{method:"POST",body:JSON.stringify({email:inviteEmail||undefined,role:"ADMIN",expiresInDays:7})});
      setResellerInviteUrl(result.inviteUrl);setMessage("Secure reseller invitation created. It expires in 7 days and can only be used once.");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not create reseller invitation");}
  }

  async function createCustomerInvite(){
    if(!selected)return;setMessage("");setCustomerInviteUrl("");
    try{
      const result=await api<{customerUrl:string;expiresAt:string}>(`/resellers/${selected}/customer-invites`,{method:"POST",body:JSON.stringify({expiresInDays:14})});
      setCustomerInviteUrl(result.customerUrl);setMessage("Customer onboarding link created. It expires in 14 days and can only be used once.");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not create customer invitation");}
  }

  async function copy(text:string){try{await navigator.clipboard.writeText(text);setMessage("Link copied.");}catch{window.prompt("Copy this link",text);}}

  const current=resellers.find(r=>r.id===selected);
  return <div className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">{isOwner?"FleetOS owner":"Reseller workspace"}</p><h1>{isOwner?"Reseller Control":"My Reseller Portal"}</h1><p>{isOwner?"Create reseller channels and issue secure invitations without giving anyone FleetOS owner access.":"Manage only your reseller customers and create customer onboarding links. FleetOS owner control remains unavailable."}</p></div></div>
    {message&&<p className="form-message">{message}</p>}

    <div className="stat-grid"><article className="stat-card"><span>{isOwner?"Resellers":"Channels"}</span><strong>{resellers.length}</strong></article><article className="stat-card"><span>Customer companies</span><strong>{resellers.reduce((n,r)=>n+r.customers,0)}</strong></article><article className="stat-card"><span>Vehicles</span><strong>{resellers.reduce((n,r)=>n+r.vehicles,0)}</strong></article>{isOwner&&<article className="stat-card"><span>Wholesale MRR recorded</span><strong>{money(resellers.reduce((n,r)=>n+(r.wholesalePence??0),0))}</strong></article>}</div>

    {isOwner&&<section className="dashboard-section"><p className="eyebrow">Create channel</p><h2>New reseller / agent</h2><form onSubmit={create} className="form-grid"><label>Trading name<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>Slug<input required pattern="[a-z0-9-]+" value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-"))} placeholder="abc-fleet"/></label><label>Support email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><div><button className="primary-button" type="submit">Create reseller</button></div></form></section>}

    <section className="dashboard-section"><p className="eyebrow">Channel</p><h2>{isOwner?"Manage reseller":"Your reseller account"}</h2>{resellers.length===0?<p>{isOwner?"Create the first reseller above.":"No reseller membership is attached to this account."}</p>:<><label>Reseller<select value={selected} onChange={e=>setSelected(e.target.value)}>{resellers.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{current&&<div className="action-grid" style={{marginTop:18}}><article className="action-card"><strong>{current.name}</strong><span>{current.status} · {current.wholesaleModel}</span></article><article className="action-card"><strong>{current.customers} customers</strong><span>{current.vehicles} vehicles</span></article>{isOwner&&<article className="action-card"><strong>{money(current.wholesalePence)}</strong><span>Recorded wholesale monthly value</span></article>}<article className="action-card"><strong>{current.supportEmail??"No support email"}</strong><span>Reseller support identity</span></article></div>}</>}</section>

    {isOwner&&selected&&<section className="dashboard-section"><p className="eyebrow">Secure invitation</p><h2>Invite the reseller administrator</h2><form onSubmit={createResellerInvite} className="form-grid"><label>Email (recommended)<input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="agent@company.co.uk"/></label><div><button type="submit">Generate reseller invite</button></div></form>{resellerInviteUrl&&<div className="panel" style={{marginTop:14,padding:14}}><strong>One-time reseller URL</strong><p style={{wordBreak:"break-all"}}>{resellerInviteUrl}</p><button className="secondary-button" onClick={()=>void copy(resellerInviteUrl)}>Copy reseller link</button></div>}</section>}

    {selected&&<section className="dashboard-section"><p className="eyebrow">Customer onboarding</p><h2>Generate a customer link</h2><p>The customer gets a separate one-time link. It creates a normal isolated FleetOS company and links it to this reseller. It never grants reseller or FleetOS owner permissions.</p><button onClick={()=>void createCustomerInvite()}>Generate customer link</button>{customerInviteUrl&&<div className="panel" style={{marginTop:14,padding:14}}><strong>One-time customer URL</strong><p style={{wordBreak:"break-all"}}>{customerInviteUrl}</p><button className="secondary-button" onClick={()=>void copy(customerInviteUrl)}>Copy customer link</button></div>}</section>}

    {selected&&<section className="dashboard-section"><p className="eyebrow">Customer companies</p><h2>{current?.name??"Reseller"} portfolio</h2>{customers.length===0?<p>No customer companies are linked to this reseller yet.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Company</th><th align="left">Status</th><th align="right">Vehicles</th>{isOwner&&<><th align="right">Wholesale</th><th align="right">Retail</th></>}</tr></thead><tbody>{customers.map(c=><tr key={c.id}><td><strong>{c.name}</strong><br/><small>{c.slug}</small></td><td>{c.subscriptionPlan} · {c.subscriptionStatus}</td><td align="right">{c.vehicleUsage}/{c.vehicleLimit}</td>{isOwner&&<><td align="right">{money(c.wholesaleMonthlyPence)}</td><td align="right">{money(c.retailMonthlyPence)}</td></>}</tr>)}</tbody></table></div>}</section>}

    <section className="dashboard-section"><p className="eyebrow">Permission boundary</p><h2>Separated by design</h2><p>Customers get only their company app. Resellers get only their reseller portal and linked customer portfolio. FleetOS owner control, global customer lists, platform money, infrastructure and master security remain owner-only.</p></section>
  </div>;
}
