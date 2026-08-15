import { FormEvent, useEffect, useState } from "react";
import { Building2, Database, Download, Save, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { api } from "../../lib/api";

type CompanyProfile = {
  id: string; name: string; slug: string; address: string | null; postcode: string | null; phone: string | null;
  industries: string[]; teamSize: string | null; operatorLicenceNumber: string | null; operatorLicenceType: string | null;
  complianceSchemes: string[]; homeDepotName: string | null; countryCode: string; usesHgv: boolean;
};
type Control = {
  billingEmail: string | null; privacyContactEmail: string | null; retentionDays: number; marketplaceEnabled: boolean;
  subscriptionPlan: string; subscriptionStatus: string; seatLimit: number;
};
type Backup = { id: string; label: string; recordCounts: Record<string, number>; createdAt: string; expiresAt: string };
type Governance = { id: string; type: string; status: string; subjectName: string; subjectEmail: string | null; notes: string | null; dueAt: string; completedAt: string | null; createdAt: string };
type Admin = {
  control: Control;
  usage: { members: number; seatsAvailable: number; vehicles: number; activeDrivers: number; documents: number };
  backups: Backup[];
  governance: Governance[];
};

const industries = [["HAULAGE","Haulage"],["LOGISTICS","Logistics"],["DRAINAGE","Drainage"],["CONSTRUCTION","Construction"],["UTILITIES","Utilities"],["PLANT","Plant & machinery"],["SERVICE","Service fleet"],["OTHER","Other"]] as const;
const schemes = [["FORS","FORS"],["CLOCS","CLOCS"],["DVSA_EARNED_RECOGNITION","DVSA Earned Recognition"],["ISO_9001","ISO 9001"],["ISO_14001","ISO 14001"],["ISO_45001","ISO 45001"]] as const;

function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

export function CompanySettingsPage() {
  const [form, setForm] = useState<CompanyProfile | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [requestForm, setRequestForm] = useState({ type: "ACCESS", subjectName: "", subjectEmail: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [profile, controls] = await Promise.all([api<CompanyProfile>("/company"), api<Admin>("/company/admin")]);
      setForm(profile); setAdmin(controls); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load company settings."); }
  }
  useEffect(() => { void load(); }, []);
  if (!form || !admin) return <section className="page"><div className="panel" style={{padding:24}}>{error || "Loading company settings…"}</div></section>;

  const update = (key: keyof CompanyProfile, value: unknown) => setForm((current) => current ? ({ ...current, [key]: value }) : current);
  const updateControl = (key: keyof Control, value: unknown) => setAdmin((current) => current ? ({ ...current, control: { ...current.control, [key]: value } }) : current);
  const toggle = (key: "industries" | "complianceSchemes", value: string) => update(key, form[key].includes(value) ? form[key].filter((item) => item !== value) : [...form[key], value]);
  const complete = (text: string) => { setMessage(text); setError(""); };
  const fail = (e: unknown, fallback: string) => { setError(e instanceof Error ? e.message : fallback); setMessage(""); };

  async function save() {
    setBusy(true); setMessage(""); setError("");
    try {
      const [profile, control] = await Promise.all([
        api<CompanyProfile>("/company", { method: "PATCH", body: JSON.stringify(form) }),
        api<Control>("/company/admin", { method: "PATCH", body: JSON.stringify({
          billingEmail: admin.control.billingEmail ?? "",
          privacyContactEmail: admin.control.privacyContactEmail ?? "",
          retentionDays: admin.control.retentionDays,
          marketplaceEnabled: admin.control.marketplaceEnabled,
        }) }),
      ]);
      setForm(profile); setAdmin((current) => current ? ({ ...current, control: { ...current.control, ...control } }) : current);
      complete("Company settings saved.");
    } catch (e) { fail(e, "Could not save company settings."); }
    finally { setBusy(false); }
  }

  async function portableExport() {
    setBusy(true);
    try { const data = await api<unknown>("/company/export"); downloadJson(data, `fleetos-${form.slug}-${new Date().toISOString().slice(0,10)}.json`); complete("Portable company export downloaded."); }
    catch (e) { fail(e, "Could not create the company export."); }
    finally { setBusy(false); }
  }

  async function createBackup() {
    const label = window.prompt("Backup name", `Before changes ${new Date().toLocaleDateString("en-GB")}`);
    if (label === null) return;
    setBusy(true);
    try { await api("/company/backups", { method: "POST", body: JSON.stringify({ label: label.trim() || undefined, keepDays: 90 }) }); await load(); complete("Company backup created."); }
    catch (e) { fail(e, "Could not create the backup."); }
    finally { setBusy(false); }
  }

  async function downloadBackup(item: Backup) {
    try { const data = await api<unknown>(`/company/backups/${item.id}`); downloadJson(data, `fleetos-backup-${item.id}.json`); }
    catch (e) { fail(e, "Could not download the backup."); }
  }

  async function deleteBackup(item: Backup) {
    if (!window.confirm(`Delete backup “${item.label}”?`)) return;
    try { await api(`/company/backups/${item.id}`, { method: "DELETE" }); await load(); complete("Backup deleted."); }
    catch (e) { fail(e, "Could not delete the backup."); }
  }

  async function addGovernance(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await api("/company/governance-requests", { method: "POST", body: JSON.stringify(requestForm) }); setRequestForm({ type: "ACCESS", subjectName: "", subjectEmail: "", notes: "" }); await load(); complete("Data request added."); }
    catch (e) { fail(e, "Could not add the data request."); }
    finally { setBusy(false); }
  }

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Company administration</p><h1>Company settings</h1><p className="subtle">Settings for this customer company only. FleetOS owner, reseller and white-label controls are kept outside customer workspaces.</p></div></div>
    {error && <p className="form-message error">{error}</p>}{message && <p className="form-message">{message}</p>}

    <section className="panel" style={{marginBottom:18}}><div className="panel-heading"><div><h2><Building2 size={19}/> Company profile</h2><p>Identity and operating details.</p></div></div><div style={{display:"grid",gap:12,padding:16}}>
      <label>Company name<input required value={form.name} onChange={e=>update("name",e.target.value)}/></label>
      <label>Home depot / operating centre<input value={form.homeDepotName ?? ""} onChange={e=>update("homeDepotName",e.target.value)}/></label>
      <label>Address<input value={form.address ?? ""} onChange={e=>update("address",e.target.value)}/></label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}><label>Postcode<input value={form.postcode ?? ""} onChange={e=>update("postcode",e.target.value)}/></label><label>Phone<input value={form.phone ?? ""} onChange={e=>update("phone",e.target.value)}/></label></div>
      <div><strong>Industry</strong><div className="chip-grid">{industries.map(([value,label])=><label key={value} className="chip-check"><input type="checkbox" checked={form.industries.includes(value)} onChange={()=>toggle("industries",value)}/><span>{label}</span></label>)}</div></div>
      <div><strong>Compliance schemes used</strong><div className="chip-grid">{schemes.map(([value,label])=><label key={value} className="chip-check"><input type="checkbox" checked={form.complianceSchemes.includes(value)} onChange={()=>toggle("complianceSchemes",value)}/><span>{label}</span></label>)}</div></div>
    </div></section>

    <section className="panel" style={{marginBottom:18}}><div className="panel-heading"><div><h2><ShieldCheck size={19}/> Business & privacy</h2><p>Customer-controlled contact and retention settings.</p></div></div><div style={{display:"grid",gap:12,padding:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><label>Billing email<input type="email" value={admin.control.billingEmail ?? ""} onChange={e=>updateControl("billingEmail",e.target.value)}/></label><label>Privacy contact email<input type="email" value={admin.control.privacyContactEmail ?? ""} onChange={e=>updateControl("privacyContactEmail",e.target.value)}/></label></div>
      <label>Administrative data retention days<input type="number" min={365} max={3650} value={admin.control.retentionDays} onChange={e=>updateControl("retentionDays",Number(e.target.value))}/></label>
      <label className="toggle-row"><input type="checkbox" checked={admin.control.marketplaceEnabled} onChange={e=>updateControl("marketplaceEnabled",e.target.checked)}/><span><strong>Marketplace enabled</strong><small>Allow this company to use the FleetOS marketplace.</small></span></label>
      <div className="stat-grid"><article className="stat-card"><span>Members</span><strong>{admin.usage.members}</strong></article><article className="stat-card"><span>Vehicles</span><strong>{admin.usage.vehicles}</strong></article><article className="stat-card"><span>Active drivers</span><strong>{admin.usage.activeDrivers}</strong></article><article className="stat-card"><span>Plan</span><strong>{admin.control.subscriptionPlan.replaceAll("_"," ")}</strong><small>{admin.control.subscriptionStatus.replaceAll("_"," ")}</small></article></div>
    </div></section>

    <section className="panel" style={{marginBottom:18}}><div className="panel-heading"><div><h2><Database size={19}/> Data & backups</h2><p>Portable copies of this company’s own FleetOS records.</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary-button" onClick={()=>void portableExport()} disabled={busy}><Download size={16}/> Export</button><button className="secondary-button" onClick={()=>void createBackup()} disabled={busy}><Database size={16}/> Create backup</button></div></div>
      <div style={{padding:16,display:"grid",gap:10}}>{admin.backups.length===0?<p className="subtle">No saved backups.</p>:admin.backups.map(item=><div key={item.id} style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",borderBottom:"1px solid #e2e8f0",paddingBottom:10}}><div><strong>{item.label}</strong><div className="subtle">{new Date(item.createdAt).toLocaleString("en-GB")}</div></div><div style={{display:"flex",gap:8}}><button className="secondary-button" onClick={()=>void downloadBackup(item)}><Download size={15}/></button><button className="secondary-button" onClick={()=>void deleteBackup(item)}><Trash2 size={15}/></button></div></div>)}</div>
    </section>

    <section className="panel" style={{marginBottom:18}}><div className="panel-heading"><div><h2><UserCheck size={19}/> Data requests</h2><p>Record access, erasure, rectification or restriction requests.</p></div></div><form onSubmit={addGovernance} style={{padding:16,display:"grid",gap:10}}><select value={requestForm.type} onChange={e=>setRequestForm({...requestForm,type:e.target.value})}><option value="ACCESS">Access</option><option value="ERASURE">Erasure</option><option value="RECTIFICATION">Rectification</option><option value="RESTRICTION">Restriction</option></select><input required placeholder="Person name" value={requestForm.subjectName} onChange={e=>setRequestForm({...requestForm,subjectName:e.target.value})}/><input type="email" placeholder="Email (optional)" value={requestForm.subjectEmail} onChange={e=>setRequestForm({...requestForm,subjectEmail:e.target.value})}/><textarea placeholder="Notes" value={requestForm.notes} onChange={e=>setRequestForm({...requestForm,notes:e.target.value})}/><button disabled={busy}>Add request</button></form></section>

    <div style={{display:"flex",justifyContent:"flex-end"}}><button onClick={()=>void save()} disabled={busy}><Save size={16}/> {busy?"Saving…":"Save company settings"}</button></div>
  </section>;
}
