import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";

const moduleConfig = {
  TRAINING: ["Training", "Courses, competencies, certificates and refresher dates."],
  INCIDENT: ["Incidents", "Operational incidents, investigations and follow-up actions."],
  INFRINGEMENT: ["Infringements", "Driver and operational infringements, actions and closure."],
  PCN: ["PCNs", "Penalty charge notices, appeal/payment dates and outcomes."],
  TOOLBOX_TALK: ["Toolbox Talks", "Briefings, attendance evidence and review dates."],
  FUEL: ["Fuel & AdBlue", "Fuel/AdBlue records, references, quantities or costs."],
  TYRE: ["Tyres", "Tyre actions, inspections, replacements and due work."],
  EQUIPMENT: ["Equipment", "Company equipment, checks, servicing and status."],
  COST: ["Costs", "Operational costs and financial references by company."],
  SUPPLIER: ["Suppliers", "Supplier records, services and review actions."],
  INSURANCE_CLAIM: ["Insurance Claims", "Claims, references, incident links and outcomes."],
  SERVICE_HISTORY: ["Service History", "PMI, servicing, repairs and maintenance evidence by vehicle."],
  PARTS_STOCK: ["Parts & Stock", "Parts, stock references, replenishment actions and costs."],
  DRIVER_SCORECARD: ["Driver Scorecards", "Driver reviews, coaching actions and operational performance notes."],
} as const;

type Module = keyof typeof moduleConfig;
type Item = {
  id: string; module: Module; reference: string | null; title: string; status: string;
  occurredAt: string | null; dueAt: string | null; amountPence: number | null;
  subjectLabel: string | null; notes: string | null; archivedAt: string | null; createdAt: string;
};

const moduleOrder = Object.keys(moduleConfig) as Module[];

export function RegistersHubPage() {
  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Tenant registers</p><h1>Operational registers</h1><p className="subtle">Every record below belongs to the selected company workspace and is written to the FleetOS audit trail.</p></div></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
      {moduleOrder.map((module) => <Link key={module} to={`/registers/${module}`} className="panel" style={{padding:18,textDecoration:"none",color:"inherit"}}>
        <strong style={{fontSize:17}}>{moduleConfig[module][0]}</strong><p className="subtle" style={{marginBottom:0}}>{moduleConfig[module][1]}</p>
      </Link>)}
    </div>
  </section>;
}

export function RegisterModulePage() {
  const params = useParams();
  const module = (params.module ?? "").toUpperCase() as Module;
  const config = moduleConfig[module];
  const [items,setItems] = useState<Item[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [form,setForm] = useState({title:"",reference:"",status:"OPEN",occurredAt:"",dueAt:"",amount:"",subjectLabel:"",notes:""});
  const hasAmount = useMemo(() => ["FUEL","COST","PCN","INSURANCE_CLAIM","TYRE","EQUIPMENT","SUPPLIER","SERVICE_HISTORY","PARTS_STOCK"].includes(module),[module]);

  async function load() {
    if (!config) return;
    setError("");
    try { setItems(await api<Item[]>(`/registers/${module}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load this register."); }
  }
  useEffect(() => { void load(); }, [module]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError("Title is required.");
    setBusy(true); setError("");
    try {
      await api(`/registers/${module}`, { method:"POST", body:JSON.stringify({
        title:form.title.trim(), reference:form.reference.trim() || undefined, status:form.status,
        occurredAt:form.occurredAt || undefined, dueAt:form.dueAt || undefined,
        amountPence:hasAmount && form.amount ? Math.round(Number(form.amount) * 100) : undefined,
        subjectLabel:form.subjectLabel.trim() || undefined, notes:form.notes.trim() || undefined,
      })});
      setForm({title:"",reference:"",status:"OPEN",occurredAt:"",dueAt:"",amount:"",subjectLabel:"",notes:""});
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save record."); }
    finally { setBusy(false); }
  }

  async function update(id:string, patch:Record<string,unknown>) {
    setBusy(true); setError("");
    try { await api(`/registers/${module}/${id}`, { method:"PATCH", body:JSON.stringify(patch) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update record."); }
    finally { setBusy(false); }
  }

  if (!config) return <section className="page"><h1>Register not found</h1><Link to="/registers">Back to registers</Link></section>;

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow"><Link to="/registers">Operational registers</Link></p><h1>{config[0]}</h1><p className="subtle">{config[1]}</p></div></div>
    {error && <div className="panel" style={{padding:14,marginBottom:16,borderColor:"#dc2626",color:"#991b1b"}}>{error}</div>}
    <form className="panel" onSubmit={create} style={{padding:18,marginBottom:20}}>
      <h2>Add record</h2>
      <div className="form-grid">
        <label>Title<input required maxLength={180} value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label>
        <label>Reference<input maxLength={80} value={form.reference} onChange={e=>setForm(v=>({...v,reference:e.target.value}))}/></label>
        <label>Status<select value={form.status} onChange={e=>setForm(v=>({...v,status:e.target.value}))}><option>OPEN</option><option>IN_PROGRESS</option><option>COMPLETE</option><option>CLOSED</option><option>DUE</option><option>OVERDUE</option></select></label>
        <label>Subject / vehicle / person<input maxLength={180} value={form.subjectLabel} onChange={e=>setForm(v=>({...v,subjectLabel:e.target.value}))}/></label>
        <label>Occurred / recorded<input type="date" value={form.occurredAt} onChange={e=>setForm(v=>({...v,occurredAt:e.target.value}))}/></label>
        <label>Due / review date<input type="date" value={form.dueAt} onChange={e=>setForm(v=>({...v,dueAt:e.target.value}))}/></label>
        {hasAmount && <label>Amount £<input type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm(v=>({...v,amount:e.target.value}))}/></label>}
      </div>
      <label style={{display:"block",marginTop:12}}>Notes<textarea maxLength={5000} value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))} rows={3}/></label>
      <button className="primary-button" disabled={busy} style={{marginTop:14}}>{busy?"Saving…":"Add record"}</button>
    </form>

    <section className="panel">
      <div className="panel-heading"><div><h2>{config[0]} register</h2><p className="subtle">{items.length} active records in this company.</p></div></div>
      <div style={{display:"grid",gap:10,padding:16}}>{items.length===0 ? <p className="subtle">No records yet.</p> : items.map(item=><article key={item.id} style={{border:"1px solid #e5e7eb",borderRadius:12,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}><div><strong>{item.title}</strong><div className="subtle">{[item.reference,item.subjectLabel].filter(Boolean).join(" · ") || "No reference"}</div></div><span className="presence">{item.status.replaceAll("_"," ")}</span></div>
        <div className="subtle" style={{marginTop:8}}>{item.occurredAt?`Recorded ${new Date(item.occurredAt).toLocaleDateString("en-GB")}`:""}{item.dueAt?` · Due ${new Date(item.dueAt).toLocaleDateString("en-GB")}`:""}{item.amountPence!=null?` · £${(item.amountPence/100).toFixed(2)}`:""}</div>
        {item.notes && <p style={{marginBottom:8}}>{item.notes}</p>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}><button type="button" disabled={busy||item.status==="COMPLETE"} onClick={()=>void update(item.id,{status:"COMPLETE"})}>Mark complete</button><button type="button" disabled={busy} onClick={()=>void update(item.id,{archived:true})}>Archive</button></div>
      </article>)}</div>
    </section>
  </section>;
}
