import { FormEvent, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

const personTypes = [
  ["DRIVER", "Driver", "Licence, CPC, tacho and medical requirements apply."],
  ["OFFICE", "Office", "Office access and employment details."],
  ["WORKSHOP", "Workshop", "Workshop access and competency records."],
  ["SUPERVISOR", "Supervisor", "Team and operational oversight."],
  ["MANAGER", "Manager", "Company-wide operational management."],
  ["ADMIN", "Company Admin", "Full company administration."],
] as const;

const accessRoles = personTypes.map(([value, label]) => [value, label] as const);

type PersonType = typeof personTypes[number][0];

export function PersonalPage() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", personType: "DRIVER" as PersonType,
    accessRole: "DRIVER" as PersonType, startDate: "", dateOfBirth: "", address: "", postcode: "",
    emergencyContact: "", emergencyPhone: "", licenceNumber: "", licenceExpiry: "", cpcExpiry: "",
    tachoCardNumber: "", tachoCardExpiry: "", medicalDue: "", inviteAccount: true,
  });

  const isDriver = form.personType === "DRIVER";
  const selectedType = useMemo(() => personTypes.find(([v]) => v === form.personType), [form.personType]);
  const update = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  function validateStep() {
    if (step === 1 && !form.personType) return "Choose a person type.";
    if (step === 2 && (!form.firstName.trim() || !form.lastName.trim())) return "First and last name are required.";
    if (step === 2 && form.inviteAccount && !form.email.trim()) return "Email is required when creating an account.";
    if (step === 3 && form.startDate && form.dateOfBirth && new Date(form.dateOfBirth) > new Date(form.startDate)) return "Date of birth cannot be after the employment start date.";
    if (step === 3 && isDriver && form.licenceExpiry && form.licenceNumber.trim() === "") return "Licence number is required when a licence expiry is entered.";
    return "";
  }

  function next() {
    const message = validateStep();
    if (message) return setError(message);
    setError(""); setStep((s) => Math.min(4, s + 1));
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const message = validateStep();
    if (message) return setError(message);
    setBusy(true); setError("");
    const { data, error: fnError } = await supabase.functions.invoke("create-staff", {
      body: form,
    });
    setBusy(false);

    if (fnError) {
      if (fnError instanceof FunctionsHttpError) {
        try {
          const body = await fnError.context.json();
          return setError(body?.error ?? fnError.message ?? "Could not create staff record.");
        } catch {
          return setError(fnError.message ?? "Could not create staff record.");
        }
      }
      return setError(fnError.message ?? "Could not create staff record.");
    }

    if (data?.error) return setError(data.error);
    setSaved(true);
  }

  if (saved) return (
    <section className="page">
      <div className="empty-state panel">
        <div className="company-dot" style={{ margin: "0 auto 16px" }}><Check /></div>
        <h1>Person added</h1>
        <p>{form.firstName} {form.lastName} is now in the company people records.</p>
        <p className="subtle">{form.inviteAccount ? "An account invitation has been sent or the existing account has been linked." : "No app account was created."}</p>
        <button className="primary-button" onClick={() => window.location.reload()}>Add another person</button>
      </div>
    </section>
  );

  return (
    <section className="page">
      <div className="page-heading">
        <div><p className="eyebrow">People & access</p><h1>Personal</h1><p className="subtle">Build staff records and give the right people the right FleetOS access.</p></div>
        <div className="presence">Step {step} of 4</div>
      </div>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: 16 }}>
          {["Type", "Identity", "Rules", "Review"].map((label, i) => <div key={label} style={{ padding: "10px 12px", borderRadius: 10, background: step >= i + 1 ? "rgba(37,99,235,.10)" : "rgba(0,0,0,.04)", fontWeight: 700, fontSize: 13 }}>{i + 1}. {label}</div>)}
        </div>
      </section>

      {error && <div className="panel" style={{ marginBottom: 16, padding: 14, borderColor: "#dc2626", color: "#991b1b" }}>{error}</div>}

      <form onSubmit={submit}>
        {step === 1 && <section className="panel"><div className="panel-heading"><div><h2>What type of person is this?</h2><p className="subtle">FleetOS will only ask for information that applies.</p></div></div><div style={{ display: "grid", gap: 10, padding: 16 }}>{personTypes.map(([value, label, description]) => <button type="button" key={value} onClick={() => { update("personType", value); update("accessRole", value); }} style={{ textAlign:"left", padding:16, borderRadius:12, border: form.personType === value ? "2px solid #2563eb" : "1px solid #ddd", background: form.personType === value ? "rgba(37,99,235,.06)" : "white" }}><strong>{label}</strong><div className="subtle">{description}</div></button>)}</div></section>}

        {step === 2 && <section className="panel"><div className="panel-heading"><h2>Identity & account</h2></div><div style={{ display:"grid", gap:14, padding:16 }}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>First name<input autoFocus required value={form.firstName} onChange={e=>update("firstName",e.target.value)} /></label><label>Last name<input required value={form.lastName} onChange={e=>update("lastName",e.target.value)} /></label></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Email<input type="email" value={form.email} onChange={e=>update("email",e.target.value)} /></label><label>Phone<input value={form.phone} onChange={e=>update("phone",e.target.value)} /></label></div><label style={{display:"flex",gap:10,alignItems:"center"}}><input type="checkbox" checked={form.inviteAccount} onChange={e=>update("inviteAccount",e.target.checked)} /> Create a FleetOS account and invite this person</label></div></section>}

        {step === 3 && <section className="panel"><div className="panel-heading"><div><h2>{selectedType?.[1]} rules</h2><p className="subtle">These fields are driven by the selected person type.</p></div></div><div style={{ display:"grid", gap:14, padding:16 }}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Date of birth<input type="date" value={form.dateOfBirth} onChange={e=>update("dateOfBirth",e.target.value)} /></label><label>Employment start date<input type="date" value={form.startDate} onChange={e=>update("startDate",e.target.value)} /></label></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Address<input value={form.address} onChange={e=>update("address",e.target.value)} /></label><label>Postcode<input value={form.postcode} onChange={e=>update("postcode",e.target.value)} /></label></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Emergency contact<input value={form.emergencyContact} onChange={e=>update("emergencyContact",e.target.value)} /></label><label>Emergency phone<input value={form.emergencyPhone} onChange={e=>update("emergencyPhone",e.target.value)} /></label></div>{isDriver && <div className="panel" style={{padding:14}}><h3>Driver requirements</h3><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Licence number<input value={form.licenceNumber} onChange={e=>update("licenceNumber",e.target.value)} /></label><label>Licence expiry<input type="date" value={form.licenceExpiry} onChange={e=>update("licenceExpiry",e.target.value)} /></label><label>CPC expiry<input type="date" value={form.cpcExpiry} onChange={e=>update("cpcExpiry",e.target.value)} /></label><label>Tacho card number<input value={form.tachoCardNumber} onChange={e=>update("tachoCardNumber",e.target.value)} /></label><label>Tacho card expiry<input type="date" value={form.tachoCardExpiry} onChange={e=>update("tachoCardExpiry",e.target.value)} /></label><label>Medical due<input type="date" value={form.medicalDue} onChange={e=>update("medicalDue",e.target.value)} /></label></div></div>}<label>Access role<select value={form.accessRole} onChange={e=>update("accessRole",e.target.value)}>{accessRoles.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div></section>}

        {step === 4 && <section className="panel"><div className="panel-heading"><div><h2>Review & create</h2><p className="subtle">Check the record before FleetOS creates it.</p></div></div><div style={{display:"grid",gap:10,padding:16}}><p><strong>{form.firstName} {form.lastName}</strong> · {personTypes.find(([v])=>v===form.personType)?.[1]}</p><p>Access: <strong>{accessRoles.find(([v])=>v===form.accessRole)?.[1]}</strong></p><p>{form.email || "No email"} · {form.phone || "No phone"}</p><p>{form.inviteAccount ? "FleetOS account: invitation will be sent or an existing account linked" : "FleetOS account: not created"}</p>{isDriver && <p>Driver compliance: licence, CPC, tacho and medical fields enabled.</p>}<div className="panel" style={{padding:14}}><strong>Tenant safety</strong><p className="subtle">This person will be attached only to the current company workspace. Access is controlled by their company membership role.</p></div></div></section>}

        <div style={{display:"flex",justifyContent:"space-between",marginTop:18}}><button type="button" className="switch-mode" disabled={step===1||busy} onClick={()=>setStep(s=>s-1)}><ChevronLeft size={17}/> Back</button>{step<4?<button type="button" className="primary-button" onClick={next}>Next <ChevronRight size={17}/></button>:<button type="submit" className="primary-button" disabled={busy}><UserPlus size={17}/>{busy?" Creating…":" Create person"}</button>}</div>
      </form>
    </section>
  );
}
