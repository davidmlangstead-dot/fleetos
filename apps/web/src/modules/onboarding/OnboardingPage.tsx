import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, ShieldCheck, Truck } from "lucide-react";
import { api, ACTIVE_WORKSPACE_KEY } from "../../lib/api";
import { BrandLogo, useBranding } from "../../lib/branding";

type Workspace = { id: string; name: string; slug: string; role: string };
type Props = { onComplete: (workspace: Workspace) => void };

const industries = [
  ["HAULAGE", "Haulage"], ["LOGISTICS", "Logistics"], ["DRAINAGE", "Drainage"],
  ["CONSTRUCTION", "Construction"], ["UTILITIES", "Utilities"], ["PLANT", "Plant & machinery"],
  ["SERVICE", "Service fleet"], ["OTHER", "Other"],
] as const;
const schemes = [
  ["FORS", "FORS"], ["CLOCS", "CLOCS"], ["DVSA_EARNED_RECOGNITION", "DVSA Earned Recognition"],
  ["ISO_9001", "ISO 9001"], ["ISO_14001", "ISO 14001"], ["ISO_45001", "ISO 45001"],
] as const;

export function OnboardingPage({ onComplete }: Props) {
  const { branding } = useBranding();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "", address: "", postcode: "", phone: "", homeDepotName: "",
    industries: [] as string[], teamSize: "", usesHgv: false,
    operatorLicenceNumber: "", operatorLicenceType: "", complianceSchemes: [] as string[], countryCode: "GB",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (key: string, value: string | boolean | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (key: "industries" | "complianceSchemes", value: string) => update(key, form[key].includes(value) ? form[key].filter((item) => item !== value) : [...form[key], value]);

  function next() {
    setError("");
    if (step === 1 && !form.name.trim()) return setError("Company or fleet name is required.");
    if (step === 2 && form.industries.length === 0) return setError("Choose at least one type of work.");
    if (step === 2 && !form.teamSize) return setError("Choose the approximate team size.");
    setStep((value) => Math.min(4, value + 1));
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!form.name.trim()) return setError("Company or fleet name is required.");
    setBusy(true); setError("");
    try {
      const created = await api<Workspace>("/company/workspaces", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          name: form.name.trim(), address: form.address.trim(), postcode: form.postcode.trim(), phone: form.phone.trim(),
          homeDepotName: form.homeDepotName.trim(), operatorLicenceNumber: form.operatorLicenceNumber.trim(),
        }),
      });
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, created.id);
      onComplete(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not create your ${branding.name} workspace.`);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page onboarding-page">
    <section className="auth-card onboarding-card">
      <div className="brand auth-brand"><BrandLogo /></div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div><p className="eyebrow">One-time company setup</p><h1 style={{ marginBottom: 4 }}>Build your operating profile once.</h1></div>
        <strong>{step} / 4</strong>
      </div>
      <div className="onboarding-progress"><div style={{ width: `${step * 25}%` }} /></div>

      {step === 1 && <div>
        <div className="panel" style={{ padding: 16, marginBottom: 18, display: "flex", gap: 12 }}><Building2 size={22}/><div><strong>Your company is the tenant boundary</strong><p className="subtle" style={{ margin: "4px 0 0" }}>People, vehicles, jobs, workshop and compliance records stay inside this workspace.</p></div></div>
        <div style={{ display: "grid", gap: 14 }}>
          <label>Company / fleet name<input autoFocus required maxLength={120} value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g. Langstead Transport Ltd" /></label>
          <label>Home depot / operating centre<input maxLength={120} value={form.homeDepotName} onChange={e => update("homeDepotName", e.target.value)} placeholder="e.g. Birmingham depot" /></label>
          <label>Business address<input maxLength={240} value={form.address} onChange={e => update("address", e.target.value)} placeholder="Optional" /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label>Postcode<input maxLength={20} value={form.postcode} onChange={e => update("postcode", e.target.value)} /></label><label>Phone<input maxLength={40} value={form.phone} onChange={e => update("phone", e.target.value)} /></label></div>
        </div>
      </div>}

      {step === 2 && <div>
        <p className="eyebrow">Operation</p><h2>What does this fleet actually do?</h2><p className="subtle">{branding.name} will use this profile to drive relevant setup and rules instead of treating every operator the same.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, margin: "18px 0" }}>{industries.map(([value,label]) => <button type="button" key={value} className={form.industries.includes(value) ? "primary-button" : "secondary-button"} onClick={() => toggle("industries", value)} style={{ justifyContent: "center", minHeight: 48 }}>{label}</button>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label>Team size<select value={form.teamSize} onChange={e => update("teamSize", e.target.value)}><option value="">Choose…</option>{["Just me","2–5","6–10","11–20","21–50","51–100","100+"].map(value => <option key={value}>{value}</option>)}</select></label><label>HGV operation<select value={form.usesHgv ? "yes" : "no"} onChange={e => update("usesHgv", e.target.value === "yes")}><option value="no">No HGVs</option><option value="yes">We operate HGVs</option></select></label></div>
      </div>}

      {step === 3 && <div>
        <p className="eyebrow">Compliance profile</p><h2>Tell {branding.name} which framework applies.</h2><p className="subtle">This does not claim accreditation. It tells {branding.name} which evidence, dates and checks your company wants to manage.</p>
        {form.usesHgv && <div className="panel" style={{ padding: 16, margin: "16px 0", display: "grid", gap: 12 }}><div style={{ display: "flex", gap: 10 }}><Truck size={21}/><strong>Operator licence</strong></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><label>Licence number<input value={form.operatorLicenceNumber} onChange={e => update("operatorLicenceNumber", e.target.value)} placeholder="Can be added later" /></label><label>Licence type<select value={form.operatorLicenceType} onChange={e => update("operatorLicenceType", e.target.value)}><option value="">Not set</option><option value="RESTRICTED">Restricted</option><option value="STANDARD_NATIONAL">Standard national</option><option value="STANDARD_INTERNATIONAL">Standard international</option></select></label></div></div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 16 }}>{schemes.map(([value,label]) => <button type="button" key={value} className={form.complianceSchemes.includes(value) ? "primary-button" : "secondary-button"} onClick={() => toggle("complianceSchemes", value)} style={{ justifyContent: "center", minHeight: 48 }}><ShieldCheck size={17}/>{label}</button>)}</div>
        <p className="subtle" style={{ marginTop: 12 }}>Nothing selected is fine. You can configure this later from company settings.</p>
      </div>}

      {step === 4 && <div>
        <p className="eyebrow">Ready</p><h2>One source of truth from day one.</h2><div className="panel" style={{ padding: 18, margin: "16px 0" }}><p><strong>{form.name}</strong></p><p className="subtle">{form.industries.map(value => industries.find(([id]) => id === value)?.[1]).filter(Boolean).join(" · ")} · {form.teamSize || "Team size not set"}</p><p className="subtle">{form.usesHgv ? `HGV operation${form.operatorLicenceNumber ? ` · O-licence ${form.operatorLicenceNumber}` : ""}` : "Non-HGV profile"}</p><p className="subtle">{form.complianceSchemes.length ? form.complianceSchemes.map(value => schemes.find(([id]) => id === value)?.[1]).filter(Boolean).join(" · ") : "No optional compliance schemes selected"}</p></div>
        <div className="onboarding-checks"><span><CheckCircle2 size={16}/>You become Company Admin.</span><span><CheckCircle2 size={16}/>No demo company or fake fleet data is created.</span><span><CheckCircle2 size={16}/>Vehicles, people and evidence are added once and reused across {branding.name}.</span></div>
      </div>}

      {error && <p className="form-message error" style={{ marginTop: 16 }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 24 }}>
        <button type="button" className="secondary-button" disabled={step === 1 || busy} onClick={() => { setError(""); setStep(value => Math.max(1, value - 1)); }}><ArrowLeft size={17}/> Back</button>
        {step < 4 ? <button type="button" className="primary-button" onClick={next}>Continue <ArrowRight size={17}/></button> : <button type="button" className="primary-button" disabled={busy} onClick={() => void submit()}>{busy ? "Creating workspace…" : <>Open my {branding.name} <ArrowRight size={17}/></>}</button>}
      </div>
    </section>
  </main>;
}
