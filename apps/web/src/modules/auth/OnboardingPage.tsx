import { useState } from "react";
import { api } from "../../lib/api";
import { supabase } from "../../lib/supabase";

type Person = { firstName: string; lastName: string; email: string; personType: string; accessRole: string; inviteAccount: boolean };
type Vehicle = { registration: string; type: string; firstRegisteredAt: string; acquiredAt: string; motDue: string; taxDue: string; insuranceDue: string; tachoCalibrationDue: string };

const industries = ["HAULAGE", "LOGISTICS", "DRAINAGE", "CONSTRUCTION", "UTILITIES", "PLANT", "SERVICE", "OTHER"];
const roles = [
  ["DRIVER", "Driver / Operator"],
  ["WORKSHOP_TECHNICIAN", "Workshop / Technician"],
  ["TRANSPORT_PLANNER", "Transport Planner"],
  ["TRANSPORT_MANAGER", "Transport Manager"],
  ["OFFICE_STAFF", "Office / Admin"],
  ["FINANCE", "Finance"],
  ["COMPANY_ADMIN", "Company Owner / Admin"],
] as const;
const personTypes = [
  ["DRIVER", "Driver"],
  ["OFFICE", "Office"],
  ["WORKSHOP", "Workshop"],
  ["SUPERVISOR", "Supervisor"],
  ["MANAGER", "Manager"],
] as const;

const blankPerson = (): Person => ({ firstName: "", lastName: "", email: "", personType: "DRIVER", accessRole: "DRIVER", inviteAccount: true });
const blankVehicle = (): Vehicle => ({ registration: "", type: "TRUCK", firstRegisteredAt: "", acquiredAt: "", motDue: "", taxDue: "", insuranceDue: "", tachoCalibrationDue: "" });

export function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState("");
  const [industriesSelected, setIndustriesSelected] = useState<string[]>([]);
  const [role, setRole] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleIndustry = (id: string) => setIndustriesSelected((v) => v.includes(id) ? v.filter((x) => x !== id) : [...v, id]);
  const updatePerson = (i: number, patch: Partial<Person>) => setPeople((v) => v.map((p, n) => n === i ? { ...p, ...patch } : p));
  const updateVehicle = (i: number, patch: Partial<Vehicle>) => setVehicles((v) => v.map((x, n) => n === i ? { ...x, ...patch } : x));

  function next() {
    setError("");
    if (step === 2 && industriesSelected.length === 0) return setError("Choose at least one type of work.");
    if (step === 3 && (!companyName.trim() || !role)) return setError("Enter the company name and choose your role.");
    if (step === 5) {
      for (const p of people) if (!p.firstName.trim() || !p.lastName.trim() || (p.inviteAccount && !p.email.trim())) return setError("Complete each staff member, including email when an account is requested.");
      for (const v of vehicles) {
        if (!v.registration.trim() || !v.firstRegisteredAt || !v.acquiredAt || !v.motDue || !v.insuranceDue) return setError("Complete the required vehicle fields.");
        if (v.acquiredAt < v.firstRegisteredAt) return setError("A vehicle's acquired date cannot be before its first registration date.");
        if (v.type === "TRUCK" && !v.tachoCalibrationDue) return setError("HGV / Truck vehicles need a tacho calibration due date.");
      }
    }
    setStep((v) => Math.min(6, v + 1));
  }

  async function finish() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api("/onboarding/company", { method: "POST", body: JSON.stringify({ companyName: companyName.trim(), industries: industriesSelected, role, teamSize, vehicles }) });
      for (const person of people) {
        const onboardingKey = [
          companyName.trim().toLowerCase(),
          person.email.trim().toLowerCase() || `${person.firstName.trim().toLowerCase()}.${person.lastName.trim().toLowerCase()}`,
          person.personType,
        ].join("|");
        const { data, error: fnError } = await supabase.functions.invoke("create-staff", { body: { ...person, onboardingKey } });
        if (fnError || data?.error) throw new Error(data?.error ?? fnError?.message ?? "Could not create a staff account.");
      }
      await api("/onboarding/complete", { method: "POST" });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "FleetOS could not finish setup.");
    } finally { setBusy(false); }
  }

  return <main className="onboarding-page"><section className="onboarding-shell">
    <header className="onboarding-header"><div className="brand"><span className="brand-mark">F</span><span>FleetOS</span></div><div className="onboarding-progress"><span>Company setup</span><strong>{step} / 6</strong><div className="progress-track"><div className="progress-fill" style={{ width: `${(step / 6) * 100}%` }} /></div></div></header>
    <div className="onboarding-card">
      {step === 1 && <div className="onboarding-step"><p className="eyebrow">One-time setup</p><h1>Let's build your FleetOS workspace once.</h1><p className="onboarding-lead">Your company, people and vehicles are entered here once. FleetOS then reuses those records across Personal, Drivers, Workshop, Jobs and Compliance.</p><button className="primary-button onboarding-button" onClick={() => setStep(2)}>Let's get started</button></div>}
      {step === 2 && <div className="onboarding-step"><p className="eyebrow">Operation</p><h1>What kind of work do you do?</h1><div className="choice-grid">{industries.map((id) => <button type="button" key={id} className={`choice-card ${industriesSelected.includes(id) ? "selected" : ""}`} onClick={() => toggleIndustry(id)}><strong>{id === "PLANT" ? "Plant & machinery" : id[0] + id.slice(1).toLowerCase()}</strong><small>{industriesSelected.includes(id) ? "Selected" : "Select"}</small></button>)}</div><div className="onboarding-actions"><button className="secondary-button" onClick={() => setStep(1)}>Back</button><button className="primary-button" onClick={next}>Continue</button></div></div>}
      {step === 3 && <div className="onboarding-step"><p className="eyebrow">Company</p><h1>Who are we setting up?</h1><label className="onboarding-field"><span>Company name</span><input autoFocus value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Northstar Haulage" /></label><label className="onboarding-field"><span>Your role</span><select value={role} onChange={(e) => setRole(e.target.value)}><option value="">Choose…</option>{roles.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="onboarding-field"><span>Team size</span><select value={teamSize} onChange={(e) => setTeamSize(e.target.value)}><option value="">Choose…</option>{["Just me","2–5","6–20","21–50","51–100","100+"].map(v => <option key={v}>{v}</option>)}</select></label><div className="onboarding-actions"><button className="secondary-button" onClick={() => setStep(2)}>Back</button><button className="primary-button" onClick={next}>Continue</button></div></div>}
      {step === 4 && <div className="onboarding-step"><p className="eyebrow">People</p><h1>Add your team once.</h1><p className="onboarding-lead">These people become the same records used by Personal, Drivers, Training, Compliance and Jobs.</p>{people.map((p,i) => <div className="panel" key={i} style={{ padding: 16, marginBottom: 12 }}><div className="form-grid"><label>First name<input value={p.firstName} onChange={e => updatePerson(i,{firstName:e.target.value})}/></label><label>Last name<input value={p.lastName} onChange={e => updatePerson(i,{lastName:e.target.value})}/></label><label>Email<input type="email" value={p.email} onChange={e => updatePerson(i,{email:e.target.value})}/></label><label>Type<select value={p.personType} onChange={e => { const v=e.target.value; updatePerson(i,{personType:v,accessRole:v}); }}><option value="DRIVER">Driver</option>{personTypes.slice(1).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Access role<select value={p.accessRole} onChange={e=>updatePerson(i,{accessRole:e.target.value})}>{roles.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={p.inviteAccount} onChange={e=>updatePerson(i,{inviteAccount:e.target.checked})}/> Create app account</label></div><button type="button" className="switch-mode" onClick={()=>setPeople(v=>v.filter((_,n)=>n!==i))}>Remove</button></div>)}<button type="button" className="secondary-button" onClick={()=>setPeople(v=>[...v,blankPerson()])}>+ Add staff member</button><div className="onboarding-actions"><button className="secondary-button" onClick={()=>setStep(3)}>Back</button><button className="primary-button" onClick={()=>setStep(5)}>Continue</button></div></div>}
      {step === 5 && <div className="onboarding-step"><p className="eyebrow">Fleet</p><h1>Add your vehicles once.</h1><p className="onboarding-lead">Vehicle records created here become the same records used by Fleet Register, Workshop, Compliance, Fuel, Tyres and Jobs.</p>{vehicles.map((v,i)=><div className="panel" key={i} style={{padding:16,marginBottom:12}}><div className="form-grid"><label>Registration<input value={v.registration} onChange={e=>updateVehicle(i,{registration:e.target.value})}/></label><label>Type<select value={v.type} onChange={e=>updateVehicle(i,{type:e.target.value})}><option value="TRUCK">HGV / Truck</option><option value="VAN">Van</option><option value="TRAILER">Trailer</option><option value="CAR">Car</option><option value="OTHER">Other</option></select></label><label>First registered<input type="date" value={v.firstRegisteredAt} onChange={e=>updateVehicle(i,{firstRegisteredAt:e.target.value})}/></label><label>Acquired<input type="date" min={v.firstRegisteredAt||undefined} value={v.acquiredAt} onChange={e=>updateVehicle(i,{acquiredAt:e.target.value})}/></label><label>MOT / test due<input type="date" value={v.motDue} onChange={e=>updateVehicle(i,{motDue:e.target.value})}/></label><label>Insurance due<input type="date" value={v.insuranceDue} onChange={e=>updateVehicle(i,{insuranceDue:e.target.value})}/></label><label>Tax due<input type="date" value={v.taxDue} onChange={e=>updateVehicle(i,{taxDue:e.target.value})}/></label>{v.type === "TRUCK" && <label>Tacho calibration due<input type="date" value={v.tachoCalibrationDue} onChange={e=>updateVehicle(i,{tachoCalibrationDue:e.target.value})}/></label>}</div><button type="button" className="switch-mode" onClick={()=>setVehicles(vs=>vs.filter((_,n)=>n!==i))}>Remove</button></div>)}<button type="button" className="secondary-button" onClick={()=>setVehicles(v=>[...v,blankVehicle()])}>+ Add vehicle</button><div className="onboarding-actions"><button className="secondary-button" onClick={()=>setStep(4)}>Back</button><button className="primary-button" onClick={next}>Review</button></div></div>}
      {step === 6 && <div className="onboarding-step"><p className="eyebrow">Ready</p><h1>One setup. One source of truth.</h1><p className="onboarding-lead">FleetOS will create the company, vehicles and people records together. Staff accounts will be invited from this same setup when requested.</p><div className="panel" style={{padding:16}}><p><strong>{companyName}</strong></p><p>{people.length} staff records · {vehicles.length} vehicles</p><p>Modules will reuse these records instead of asking you to enter them again.</p></div><div className="onboarding-actions"><button className="secondary-button" disabled={busy} onClick={()=>setStep(5)}>Back</button><button className="primary-button" disabled={busy} onClick={finish}>{busy ? "Setting up…" : "Finish FleetOS setup"}</button></div></div>}
      {error && <p className="form-message error">{error}</p>}
    </div><footer className="onboarding-footer"><span>Built around the people doing the work.</span></footer>
  </section></main>;
}
