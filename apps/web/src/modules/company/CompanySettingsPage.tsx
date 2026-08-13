import { FormEvent, useEffect, useState } from "react";
import { ArchiveRestore, Building2, Database, Download, Globe2, MailCheck, Receipt, Save, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { api } from "../../lib/api";

type CompanyProfile = {
  id: string; name: string; slug: string; address: string | null; postcode: string | null; phone: string | null;
  industries: string[]; teamSize: string | null; operatorLicenceNumber: string | null; operatorLicenceType: string | null;
  complianceSchemes: string[]; homeDepotName: string | null; countryCode: string; usesHgv: boolean;
};
type Control = {
  subscriptionPlan: string; subscriptionStatus: string; billingEmail: string | null; seatLimit: number; retentionDays: number;
  privacyContactEmail: string | null; customDomain: string | null; customDomainVerified: boolean;
  emailSenderDomain: string | null; emailDomainVerified: boolean;
};
type Backup = { id: string; label: string; recordCounts: Record<string, number>; createdAt: string; expiresAt: string };
type Governance = { id: string; type: string; status: string; subjectName: string; subjectEmail: string | null; notes: string | null; dueAt: string; completedAt: string | null; createdAt: string };
type Admin = {
  control: Control;
  usage: { members: number; seatsAvailable: number; vehicles: number; activeDrivers: number; documents: number };
  readiness: { productionUrl: string; authenticationRedirect: string; databaseRegion: string; portableBackup: string; customDomain: string; emailSender: string };
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

function Ready({ label, status, detail }: { label: string; status: string; detail: string }) {
  const ready = status === "READY";
  return <article style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong>{label}</strong><span style={{ color: ready ? "#166534" : status === "VERIFY_DNS" ? "#a16207" : "#64748b", fontSize: 12, fontWeight: 800 }}>{ready ? "READY" : status === "VERIFY_DNS" ? "VERIFY DNS" : "SET UP"}</span></div><p className="subtle" style={{ marginBottom: 0 }}>{detail}</p></article>;
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
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load company controls."); }
  }
  useEffect(() => { void load(); }, []);
  if (!form || !admin) return <section className="page"><div className="panel" style={{padding:24}}>{error || "Loading company controlsâ€¦"}</div></section>;

  const update = (key: keyof CompanyProfile, value: unknown) => setForm((current) => current ? ({ ...current, [key]: value }) : current);
  const updateControl = (key: keyof Control, value: unknown) => setAdmin((current) => current ? ({ ...current, control: { ...current.control, [key]: value } }) : current);
  const toggle = (key: "industries" | "complianceSchemes", value: string) => update(key, form[key].includes(value) ? form[key].filter((item) => item !== value) : [...form[key], value]);
  const complete = (text: string) => { setMessage(text); setError(""); };
  const fail = (e: unknown, fallback: string) => { setError(e instanceof Error ? e.message : fallback); setMessage(""); };

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const [profile, control] = await Promise.all([
        api<CompanyProfile>("/company", { method: "PATCH", body: JSON.stringify(form) }),
        api<Control>("/company/admin", { method: "PATCH", body: JSON.stringify({
          billingEmail: admin.control.billingEmail ?? "", privacyContactEmail: admin.control.privacyContactEmail ?? "",
          retentionDays: admin.control.retentionDays, customDomain: admin.control.customDomain ?? "",
          emailSenderDomain: admin.control.emailSenderDomain ?? "",
        }) }),
      ]);
      setForm(profile); setAdmin((current) => current ? ({ ...current, control }) : current); complete("Company and business controls saved.");
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
    try { await api("/company/backups", { method: "POST", body: JSON.stringify({ label: label.trim() || undefined, keepDays: 90 }) }); await load(); complete("Company backup created and kept for 90 days."); }
    catch (e) { fail(e, "Could not create the backup."); }
    finally { setBusy(false); }
  }

  async function downloadBackup(item: Backup) {
    try { const data = await api<unknown>(`/company/backups/${item.id}`); downloadJson(data, `fleetos-backup-${item.id}.json`); complete("Backup downloaded."); }
    catch (e) { fail(e, "Could not download the backup."); }
  }

  async function restoreBackup(item: Backup) {
    const confirmation = window.prompt("This only restores missing records and never overwrites newer data. Type RESTORE MISSING RECORDS to continue.");
    if (confirmation !== "RESTORE MISSING RECORDS") return;
    setBusy(true);
    try { const result = await api<{ note: string }>(`/company/backups/${item.id}/restore`, { method: "POST", body: JSON.stringify({ confirmation }) }); await load(); complete(result.note); }
    catch (e) { fail(e, "Could not restore the backup."); }
    finally { setBusy(false); }
  }

  async function deleteBackup(item: Backup) {
    if (!window.confirm(`Delete backup â€œ${item.label}â€? The downloaded copies you hold are unaffected.`)) return;
    try { await api(`/company/backups/${item.id}`, { method: "DELETE" }); await load(); complete("Backup deleted."); }
    catch (e) { fail(e, "Could not delete the backup."); }
  }

  async function addGovernance(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await api("/company/governance-requests", { method: "POST", body: JSON.stringify(requestForm) }); setRequestForm({ type: "ACCESS", subjectName: "", subjectEmail: "", notes: "" }); await load(); complete("Data request added with a 30-day deadline."); }
    catch (e) { fail(e, "Could not add the data request."); }
    finally { setBusy(false); }
  }

  async function updateGovernance(id: string, status: string) {
    try { await api(`/company/governance-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); complete(`Request marked ${status.replaceAll("_", " ").toLowerCase()}.`); }
    catch (e) { fail(e, "Could not update the data request."); }
  }

  async function applyRetention() {
    setBusy(true);
    try {
      const preview = await api<{ retentionDays: number; records: Record<string, number> }>("/company/retention-preview");
      const total = Object.values(preview.records).reduce((sum, count) => sum + count, 0);
      if (!total) { complete("Nothing has reached the retention limit."); return; }
      const confirmation = window.prompt(`${total} expired administrative record(s) can be removed under the ${preview.retentionDays}-day policy. Type APPLY RETENTION to continue.`);
      if (confirmation !== "APPLY RETENTION") return;
      await api("/company/retention-run", { method: "POST", body: JSON.stringify({ confirmation }) });
      complete("The retention policy was applied and recorded in the audit trail.");
    } catch (e) { fail(e, "Could not apply the retention policy."); }
    finally { setBusy(false); }
  }

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Company administration</p><h1>Business controls</h1><p className="subtle">Operating profile, billing visibility, backup recovery, privacy work and production readiness in one place.</p></div></div>
    {error && <p className="form-message error">{error}</p>}{message && <p className="form-message">{message}</p>}
    <div style={{display:"grid",gap:18}}>
      <section className="panel"><div className="panel-heading"><div><h2><Building2 size={19}/> Company</h2><p>Identity and operating centre.</p></div></div><div style={{display:"grid",gap:12,padding:16}}><label>Company name<input required value={form.name} onChange={e=>update("name",e.target.value)}/></label><label>Home depot / operating centre<input value={form.homeDepotName ?? ""} onChange={e=>update("homeDepotName",e.target.value)}/></label><label>Address<input value={form.address ?? ""} onChange={e=>update("address",e.target.value)}/></label><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}><label>Postcode<input value={form.postcode ?? ""} onChange={e=>update("postcode",e.target.value)}/></label><label>Phone<input value={form.phone ?? ""} onChange={e=>update("phone",e.target.value)}/></label></div></div></section>

      <section className="panel"><div className="panel-heading"><div><h2>Operation</h2><p>Used to tailor FleetOS around the work you actually do.</p></div></div><div style={{padding:16}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:16}}>{industries.map(([value,label])=><button type="button" key={value} className={form.industries.includes(value)?"primary-button":"secondary-button"} onClick={()=>toggle("industries",value)} style={{justifyContent:"center"}}>{label}</button>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}><label>Team size<select value={form.teamSize ?? ""} onChange={e=>update("teamSize",e.target.value)}><option value="">Not set</option>{["Just me","2â€“5","6â€“10","11â€“20","21â€“50","51â€“100","100+"].map(value=><option key={value}>{value}</option>)}</select></label><label>HGV operation<select value={form.usesHgv?"yes":"no"} onChange={e=>update("usesHgv",e.target.value==="yes")}><option value="no">No HGVs</option><option value="yes">We operate HGVs</option></select></label></div></div></section>

      <section className="panel"><div className="panel-heading"><div><h2><ShieldCheck size={19}/> Compliance profile</h2><p>Manage frameworks and operator-licence details without claiming accreditation.</p></div></div><div style={{display:"grid",gap:14,padding:16}}>{form.usesHgv && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><label>Operator licence number<input value={form.operatorLicenceNumber ?? ""} onChange={e=>update("operatorLicenceNumber",e.target.value)}/></label><label>Licence type<select value={form.operatorLicenceType ?? ""} onChange={e=>update("operatorLicenceType",e.target.value)}><option value="">Not set</option><option value="RESTRICTED">Restricted</option><option value="STANDARD_NATIONAL">Standard national</option><option value="STANDARD_INTERNATIONAL">Standard international</option></select></label></div>}<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>{schemes.map(([value,label])=><button type="button" key={value} className={form.complianceSchemes.includes(value)?"primary-button":"secondary-button"} onClick={()=>toggle("complianceSchemes",value)} style={{justifyContent:"center"}}>{label}</button>)}</div></div></section>

      <section className="panel"><div className="panel-heading"><div><h2><Receipt size={19}/> Plan & seats</h2><p>Commercial status and contact details. Plan changes remain protected as platform-admin actions.</p></div></div><div style={{padding:16,display:"grid",gap:14}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}><div><span className="subtle">Plan</span><h3>{admin.control.subscriptionPlan.replaceAll("_"," ")}</h3></div><div><span className="subtle">Status</span><h3>{admin.control.subscriptionStatus}</h3></div><div><span className="subtle">Seats</span><h3>{admin.usage.members}/{admin.control.seatLimit}</h3><span className="subtle">{admin.usage.seatsAvailable} available</span></div></div><label>Billing email<input type="email" value={admin.control.billingEmail ?? ""} onChange={e=>updateControl("billingEmail",e.target.value)}/></label></div></section>

      <section className="panel"><div className="panel-heading"><div><h2><Database size={19}/> Backup & recovery</h2><p>Portable downloads plus server-side snapshots. Restore only fills missing records; it never overwrites newer live work.</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" onClick={()=>void portableExport()} disabled={busy}><Download size={16}/> Download full export</button><button type="button" className="primary-button" onClick={()=>void createBackup()} disabled={busy}><Database size={16}/> Create backup</button></div></div><div style={{padding:16,display:"grid",gap:10}}>{admin.backups.length===0?<p className="subtle">No active server-side backups yet.</p>:admin.backups.map(item=><article key={item.id} style={{border:"1px solid #e2e8f0",borderRadius:12,padding:14,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><strong>{item.label}</strong><div className="subtle">Created {new Date(item.createdAt).toLocaleString("en-GB")} Â· expires {new Date(item.expiresAt).toLocaleDateString("en-GB")} Â· {Object.values(item.recordCounts).reduce((sum,count)=>sum+count,0)} records</div></div><div style={{display:"flex",gap:8}}><button type="button" onClick={()=>void downloadBackup(item)}><Download size={15}/> Download</button><button type="button" onClick={()=>void restoreBackup(item)}><ArchiveRestore size={15}/> Restore missing</button><button type="button" aria-label={`Delete ${item.label}`} onClick={()=>void deleteBackup(item)}><Trash2 size={15}/></button></div></article>)}</div></section>

      <section className="panel"><div className="panel-heading"><div><h2><UserCheck size={19}/> Privacy & GDPR work</h2><p>Track access, erasure, correction and restriction requests against a 30-day deadline.</p></div></div><div style={{padding:16,display:"grid",gap:16}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}><label>Privacy contact email<input type="email" value={admin.control.privacyContactEmail ?? ""} onChange={e=>updateControl("privacyContactEmail",e.target.value)}/></label><label>Administrative retention<select value={admin.control.retentionDays} onChange={e=>updateControl("retentionDays",Number(e.target.value))}><option value={365}>1 year</option><option value={1095}>3 years</option><option value={2190}>6 years</option><option value={2555}>7 years</option><option value={3650}>10 years</option></select></label></div><button type="button" style={{justifySelf:"start"}} onClick={()=>void applyRetention()} disabled={busy}>Preview & apply retention</button><form onSubmit={addGovernance} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,alignItems:"end"}}><label>Request type<select value={requestForm.type} onChange={e=>setRequestForm(current=>({...current,type:e.target.value}))}><option value="ACCESS">Data access</option><option value="ERASURE">Erasure review</option><option value="RECTIFICATION">Correction</option><option value="RESTRICTION">Processing restriction</option></select></label><label>Person / subject<input required value={requestForm.subjectName} onChange={e=>setRequestForm(current=>({...current,subjectName:e.target.value}))}/></label><label>Email<input type="email" value={requestForm.subjectEmail} onChange={e=>setRequestForm(current=>({...current,subjectEmail:e.target.value}))}/></label><button className="primary-button" disabled={busy}>Add request</button></form>{admin.governance.length>0&&<div style={{display:"grid",gap:8}}>{admin.governance.map(item=><article key={item.id} style={{border:"1px solid #e2e8f0",borderRadius:12,padding:12,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><strong>{item.type} Â· {item.subjectName}</strong><div className="subtle">{item.status.replaceAll("_"," ")} Â· due {new Date(item.dueAt).toLocaleDateString("en-GB")}</div></div>{!['COMPLETED','CANCELLED'].includes(item.status)&&<div style={{display:"flex",gap:8}}><button type="button" onClick={()=>void updateGovernance(item.id,"IN_REVIEW")}>In review</button><button type="button" onClick={()=>void updateGovernance(item.id,"COMPLETED")}>Complete</button><button type="button" onClick={()=>void updateGovernance(item.id,"CANCELLED")}>Cancel</button></div>}</article>)}</div>}</div></section>

      <section className="panel"><div className="panel-heading"><div><h2><Globe2 size={19}/> Production readiness</h2><p>The existing FleetOS address stays live while optional business domains are verified.</p></div></div><div style={{padding:16,display:"grid",gap:14}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}><Ready label="Production app" status="READY" detail={admin.readiness.productionUrl}/><Ready label="Email confirmations" status={admin.readiness.authenticationRedirect} detail="Confirmed users return to the production FleetOS app."/><Ready label="Portable backup" status={admin.readiness.portableBackup} detail="Download and server-side recovery are available."/><Ready label="Database region" status="READY" detail={admin.readiness.databaseRegion}/><Ready label="Custom domain" status={admin.readiness.customDomain} detail={admin.control.customDomain || "Use the FleetOS address until a business domain is chosen."}/><Ready label="Sender email" status={admin.readiness.emailSender} detail={admin.control.emailSenderDomain || "Authentication continues through Supabase until a sender domain is verified."}/></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><label><Globe2 size={15}/> Desired app domain<input placeholder="app.yourcompany.co.uk" value={admin.control.customDomain ?? ""} onChange={e=>updateControl("customDomain",e.target.value.toLowerCase())}/></label><label><MailCheck size={15}/> Desired email domain<input placeholder="mail.yourcompany.co.uk" value={admin.control.emailSenderDomain ?? ""} onChange={e=>updateControl("emailSenderDomain",e.target.value.toLowerCase())}/></label></div><p className="subtle">Saving a domain records the request; DNS verification and activation remain protected platform actions.</p></div></section>

      <button type="button" className="primary-button" disabled={busy} onClick={()=>void save()} style={{justifySelf:"start"}}><Save size={17}/>{busy?" Savingâ€¦":" Save company controls"}</button>
    </div>
  </section>;
}

