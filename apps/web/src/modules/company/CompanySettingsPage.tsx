import { FormEvent, useEffect, useState } from "react";
import { Building2, Save, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";

type CompanyProfile = {
  id: string; name: string; slug: string; address: string | null; postcode: string | null; phone: string | null;
  industries: string[]; teamSize: string | null; operatorLicenceNumber: string | null; operatorLicenceType: string | null;
  complianceSchemes: string[]; homeDepotName: string | null; countryCode: string; usesHgv: boolean;
};

const industries = [["HAULAGE","Haulage"],["LOGISTICS","Logistics"],["DRAINAGE","Drainage"],["CONSTRUCTION","Construction"],["UTILITIES","Utilities"],["PLANT","Plant & machinery"],["SERVICE","Service fleet"],["OTHER","Other"]] as const;
const schemes = [["FORS","FORS"],["CLOCS","CLOCS"],["DVSA_EARNED_RECOGNITION","DVSA Earned Recognition"],["ISO_9001","ISO 9001"],["ISO_14001","ISO 14001"],["ISO_45001","ISO 45001"]] as const;

export function CompanySettingsPage() {
  const [form, setForm] = useState<CompanyProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void api<CompanyProfile>("/company").then(setForm).catch((e) => setError(e instanceof Error ? e.message : "Could not load company settings.")); }, []);
  if (!form) return <section className="page"><div className="panel" style={{padding:24}}>{error || "Loading company settings…"}</div></section>;

  const update = (key: keyof CompanyProfile, value: any) => setForm((current) => current ? ({ ...current, [key]: value }) : current);
  const toggle = (key: "industries" | "complianceSchemes", value: string) => update(key, form[key].includes(value) ? form[key].filter((item) => item !== value) : [...form[key], value]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const saved = await api<CompanyProfile>("/company", { method: "PATCH", body: JSON.stringify(form) });
      setForm(saved); setMessage("Company operating profile saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save company settings."); }
    finally { setBusy(false); }
  }

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Company settings</p><h1>Operating profile</h1><p className="subtle">The company-level facts FleetOS reuses across people, vehicles, workshop and compliance.</p></div></div>
    {error && <p className="form-message error">{error}</p>}{message && <p className="form-message">{message}</p>}
    <form onSubmit={save} style={{display:"grid",gap:18}}>
      <section className="panel"><div className="panel-heading"><div><h2><Building2 size={19}/> Company</h2><p>Identity and operating centre.</p></div></div><div style={{display:"grid",gap:12,padding:16}}><label>Company name<input required value={form.name} onChange={e=>update("name",e.target.value)}/></label><label>Home depot / operating centre<input value={form.homeDepotName ?? ""} onChange={e=>update("homeDepotName",e.target.value)}/></label><label>Address<input value={form.address ?? ""} onChange={e=>update("address",e.target.value)}/></label><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Postcode<input value={form.postcode ?? ""} onChange={e=>update("postcode",e.target.value)}/></label><label>Phone<input value={form.phone ?? ""} onChange={e=>update("phone",e.target.value)}/></label></div></div></section>

      <section className="panel"><div className="panel-heading"><div><h2>Operation</h2><p>Used to tailor FleetOS around the work you actually do.</p></div></div><div style={{padding:16}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:16}}>{industries.map(([value,label])=><button type="button" key={value} className={form.industries.includes(value)?"primary-button":"secondary-button"} onClick={()=>toggle("industries",value)} style={{justifyContent:"center"}}>{label}</button>)}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Team size<select value={form.teamSize ?? ""} onChange={e=>update("teamSize",e.target.value)}><option value="">Not set</option>{["Just me","2–5","6–10","11–20","21–50","51–100","100+"].map(value=><option key={value}>{value}</option>)}</select></label><label>HGV operation<select value={form.usesHgv?"yes":"no"} onChange={e=>update("usesHgv",e.target.value==="yes")}><option value="no">No HGVs</option><option value="yes">We operate HGVs</option></select></label></div></div></section>

      <section className="panel"><div className="panel-heading"><div><h2><ShieldCheck size={19}/> Compliance profile</h2><p>Manage frameworks and operator-licence details without claiming accreditation.</p></div></div><div style={{display:"grid",gap:14,padding:16}}>{form.usesHgv && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Operator licence number<input value={form.operatorLicenceNumber ?? ""} onChange={e=>update("operatorLicenceNumber",e.target.value)}/></label><label>Licence type<select value={form.operatorLicenceType ?? ""} onChange={e=>update("operatorLicenceType",e.target.value)}><option value="">Not set</option><option value="RESTRICTED">Restricted</option><option value="STANDARD_NATIONAL">Standard national</option><option value="STANDARD_INTERNATIONAL">Standard international</option></select></label></div>}<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>{schemes.map(([value,label])=><button type="button" key={value} className={form.complianceSchemes.includes(value)?"primary-button":"secondary-button"} onClick={()=>toggle("complianceSchemes",value)} style={{justifyContent:"center"}}>{label}</button>)}</div></div></section>

      <button className="primary-button" disabled={busy} style={{justifySelf:"start"}}><Save size={17}/>{busy?" Saving…":" Save company profile"}</button>
    </form>
  </section>;
}
