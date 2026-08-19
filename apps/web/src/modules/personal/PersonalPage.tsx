import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { api, ACTIVE_WORKSPACE_KEY } from "../../lib/api";

const personTypes = [
  ["DRIVER", "Driver", "Driving, vehicle checks and mobile jobs.", "DRIVER"],
  ["SUPERVISOR", "Supervisor", "Driving plus day-to-day team supervision.", "SUPERVISOR"],
  ["MANAGER", "Manager", "Driving plus operational management.", "MANAGER"],
  ["SUBCONTRACTOR", "Workshop Contractor", "Driving plus workshop or contracted work.", "WORKSHOP"],
] as const;

const accessRoles = [
  ["DRIVER", "Driver"],
  ["WORKSHOP", "Workshop Contractor"],
  ["SUPERVISOR", "Supervisor"],
  ["MANAGER", "Manager"],
] as const;

const trainingByType: Record<PersonType, readonly string[]> = {
  DRIVER: ["Driving licence", "Driver CPC", "Tachograph card", "Driver assessment"],
  SUPERVISOR: ["Driving licence", "Driver CPC", "Tachograph card", "Driver assessment", "Supervisor induction"],
  MANAGER: ["Driving licence", "Driver CPC", "Tachograph card", "Driver assessment", "Manager induction"],
  SUBCONTRACTOR: ["Driving licence", "Driver CPC", "Tachograph card", "Driver assessment", "Workshop induction"],
};

type PersonType = typeof personTypes[number][0];
type AccessRole = typeof accessRoles[number][0];
type Depot = { id: string; name: string; isActive: boolean };

export function PersonalPage() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [depots, setDepots] = useState<Depot[]>([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    personType: "DRIVER" as PersonType,
    accessRole: "DRIVER" as AccessRole,
    skills: [] as string[],
    depotId: "",
    startDate: "",
    dateOfBirth: "",
    address: "",
    postcode: "",
    emergencyContact: "",
    emergencyPhone: "",
    licenceNumber: "",
    licenceExpiry: "",
    cpcExpiry: "",
    tachoCardNumber: "",
    tachoCardExpiry: "",
    medicalDue: "",
    inviteAccount: true,
  });

  const selectedType = useMemo(() => personTypes.find(([value]) => value === form.personType), [form.personType]);
  const trainingOptions = trainingByType[form.personType];
  const update = (key: string, value: string | boolean | string[]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    void api<Depot[]>("/organisation/depots")
      .then((rows) => setDepots(rows.filter((depot) => depot.isActive)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load depots."));
  }, []);

  function chooseType(personType: PersonType, accessRole: AccessRole) {
    setForm((current) => ({ ...current, personType, accessRole, skills: current.skills.filter((item) => trainingByType[personType].includes(item)) }));
  }

  function toggleTraining(item: string) {
    update("skills", form.skills.includes(item) ? form.skills.filter((value) => value !== item) : [...form.skills, item]);
  }

  function validateStep() {
    if (step === 1 && !form.personType) return "Choose a staff type.";
    if (step === 2 && (!form.firstName.trim() || !form.lastName.trim())) return "First and last name are required.";
    if (step === 2 && form.inviteAccount && !form.email.trim()) return "Email is required when creating an account.";
    if (step === 3 && form.licenceExpiry && !form.licenceNumber.trim()) return "Licence number is required when a licence expiry is entered.";
    return "";
  }

  function next() {
    const message = validateStep();
    if (message) return setError(message);
    setError("");
    setStep((current) => Math.min(4, current + 1));
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const message = validateStep();
    if (message) return setError(message);
    const companyId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (!companyId) return setError("No active company workspace is selected.");

    setBusy(true);
    setError("");
    const { data, error: functionError } = await supabase.functions.invoke("create-staff", {
      body: { ...form, depotId: form.depotId || null, companyId },
    });
    setBusy(false);

    if (functionError) {
      if (functionError instanceof FunctionsHttpError) {
        try {
          const body = await functionError.context.json();
          return setError(body?.error ?? functionError.message ?? "Could not create staff record.");
        } catch {
          return setError(functionError.message ?? "Could not create staff record.");
        }
      }
      return setError(functionError.message ?? "Could not create staff record.");
    }
    if (data?.error) return setError(data.error);
    if (form.inviteAccount && data?.inviteWarning) return setError(`Staff record created, but the login invitation could not be sent: ${data.inviteWarning}`);
    setSaved(true);
  }

  const depotName = depots.find((depot) => depot.id === form.depotId)?.name || "No depot assigned";

  if (saved) return <section className="page"><div className="empty-state panel"><div className="company-dot" style={{ margin: "0 auto 16px" }}><Check /></div><h1>Staff member added</h1><p>{form.firstName} {form.lastName} is now in Staff and has a driver profile.</p><p className="subtle">{form.inviteAccount ? "Their Rivetway invitation was sent or existing account linked." : "No app account was created."} · {depotName}</p><button className="primary-button" onClick={() => window.location.reload()}>Add another staff member</button></div></section>;

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">People & access</p><h1>Staff</h1><p className="subtle">One entry creates the staff record, driver profile, training matrix and app access.</p></div><div className="presence">Step {step} of 4</div></div>
    <section className="panel" style={{ marginBottom: 24 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: 16 }}>{["Type", "Identity", "Driving & training", "Review"].map((label, index) => <div key={label} style={{ padding: "10px 12px", borderRadius: 10, background: step >= index + 1 ? "rgba(37,99,235,.10)" : "rgba(0,0,0,.04)", fontWeight: 700, fontSize: 13 }}>{index + 1}. {label}</div>)}</div></section>
    {error && <p role="alert" className="form-message error">{error}</p>}
    <form onSubmit={submit}>
      {step === 1 && <section className="panel"><div className="panel-heading"><div><h2>Staff type</h2><p>Choose the job type. App access and training are set from this.</p></div></div><div style={{ display: "grid", gap: 10, padding: 16 }}>{personTypes.map(([value, label, description, defaultRole]) => <button type="button" key={value} onClick={() => chooseType(value, defaultRole)} style={{ textAlign: "left", padding: 16, borderRadius: 12, border: form.personType === value ? "2px solid #2563eb" : "1px solid #ddd", background: form.personType === value ? "rgba(37,99,235,.06)" : "white" }}><strong>{label}</strong><div className="subtle">{description}</div></button>)}</div></section>}

      {step === 2 && <section className="panel"><div className="panel-heading"><h2>Who is it?</h2></div><div style={{ display: "grid", gap: 14, padding: 16 }}><div className="form-grid"><label>First name *<input autoFocus required value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label><label>Last name *<input required value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label><label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label>Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label><label>Depot / base<select value={form.depotId} onChange={(event) => update("depotId", event.target.value)}><option value="">No depot assigned</option>{depots.map((depot) => <option key={depot.id} value={depot.id}>{depot.name}</option>)}</select></label></div><label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={form.inviteAccount} onChange={(event) => update("inviteAccount", event.target.checked)} /> Create app login</label></div></section>}

      {step === 3 && <section className="panel"><div className="panel-heading"><div><h2>Driving & training</h2><p>All four staff types can drive. Only record what applies.</p></div></div><div style={{ display: "grid", gap: 16, padding: 16 }}><div className="form-grid"><label>Licence number<input value={form.licenceNumber} onChange={(event) => update("licenceNumber", event.target.value)} /></label><label>Licence expiry<input type="date" value={form.licenceExpiry} onChange={(event) => update("licenceExpiry", event.target.value)} /></label><label>CPC expiry<input type="date" value={form.cpcExpiry} onChange={(event) => update("cpcExpiry", event.target.value)} /></label><label>Tacho card number<input value={form.tachoCardNumber} onChange={(event) => update("tachoCardNumber", event.target.value)} /></label><label>Tacho card expiry<input type="date" value={form.tachoCardExpiry} onChange={(event) => update("tachoCardExpiry", event.target.value)} /></label><label>Medical due<input type="date" value={form.medicalDue} onChange={(event) => update("medicalDue", event.target.value)} /></label></div><div><h3 style={{ marginBottom: 10 }}>{selectedType?.[1]} training matrix</h3><div style={{ display: "grid", gap: 8 }}>{trainingOptions.map((item) => <label key={item} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid rgba(148,163,184,.25)", borderRadius: 10 }}><input type="checkbox" checked={form.skills.includes(item)} onChange={() => toggleTraining(item)} /> {item}</label>)}</div></div></div></section>}

      {step === 4 && <section className="panel"><div className="panel-heading"><div><h2>Review</h2><p>One entry, no duplicate setup.</p></div></div><div style={{ display: "grid", gap: 10, padding: 16 }}><p><strong>{form.firstName} {form.lastName}</strong> · {selectedType?.[1]}</p><p>Depot: <strong>{depotName}</strong></p><p>App role: <strong>{accessRoles.find(([value]) => value === form.accessRole)?.[1]}</strong> · Driver app enabled</p><p>{form.email || "No email"} · {form.phone || "No phone"}</p><p>Training: <strong>{form.skills.length ? form.skills.join(", ") : "None recorded"}</strong></p><p>{form.inviteAccount ? "App login: invitation will be sent or existing account linked" : "App login: not created"}</p></div></section>}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}><button type="button" className="switch-mode" disabled={step === 1 || busy} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={17} /> Back</button>{step < 4 ? <button type="button" className="primary-button" onClick={next}>Next <ChevronRight size={17} /></button> : <button type="submit" className="primary-button" disabled={busy}><UserPlus size={17} />{busy ? " Creating…" : " Add staff"}</button>}</div>
    </form>
  </section>;
}
