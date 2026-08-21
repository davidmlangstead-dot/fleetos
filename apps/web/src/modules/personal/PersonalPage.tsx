import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, GraduationCap, UserMinus, UserPlus, Users } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { api, ACTIVE_WORKSPACE_KEY } from "../../lib/api";

const personTypes = [
  ["DRIVER", "Driver", "Driving, vehicle checks and mobile jobs.", "DRIVER"],
  ["SUPERVISOR", "Supervisor", "Driving plus day-to-day team supervision.", "SUPERVISOR"],
  ["MANAGER", "Manager", "Driving plus operational management.", "MANAGER"],
  ["WORKSHOP", "Workshop", "Driving plus workshop, inspection and maintenance work.", "WORKSHOP"],
  ["CONTRACTOR", "Contractor", "Driving plus contracted or temporary work.", "WORKSHOP"],
  ["OFFICE", "Office / Finance", "Office administration, reporting or finance access.", "OFFICE"],
] as const;

const accessRoles = [
  ["DRIVER", "Driver"],
  ["WORKSHOP", "Workshop / Contractor"],
  ["SUPERVISOR", "Supervisor"],
  ["MANAGER", "Manager"],
  ["OFFICE", "Office staff"],
  ["FINANCE", "Finance (read only)"],
] as const;
const staffRemovalRoles = new Set(["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"]);
const driverCapableTypes = new Set(["DRIVER", "SUPERVISOR", "MANAGER", "WORKSHOP", "CONTRACTOR"]);
const STAFF_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PersonType = typeof personTypes[number][0];
type AccessRole = typeof accessRoles[number][0];
type Depot = { id: string; name: string; isActive: boolean };
type StaffRow = {
  id: string; userId: string | null; firstName: string; lastName: string; email: string | null; phone: string | null;
  personType: string; accessRole: string; isActive: boolean; startDate: string | null; skills: string[] | null;
  driver: { id: string; leftDate: string | null; isActive: boolean; licenceExpiry: string | null; cpcExpiry: string | null; tachoCardExpiry: string | null; medicalDue: string | null } | null;
};
type Absence = { id: string; driverId: string; type: string; status: string; startsOn: string; endsOn: string; reason: string | null; officeNotes: string | null };
type Training = { id: string; driverId: string; title: string; category: string; status: string; provider: string | null; dueDate: string | null; bookedDate: string | null; completedDate: string | null; expiryDate: string | null; notes: string | null };
type StaffOverview = { staff: StaffRow[]; absences: Absence[]; training: Training[] };
type View = "OVERVIEW" | "ABSENCE" | "TRAINING" | "LEFT" | "ADD";

const trainingByType: Record<PersonType, readonly string[]> = {
  DRIVER: ["Driving licence", "Driver CPC", "Tachograph card", "Driver assessment"],
  SUPERVISOR: ["Driving licence", "Driver CPC", "Tachograph card", "Driver assessment", "Supervisor induction"],
  MANAGER: ["Driving licence", "Driver CPC", "Tachograph card", "Driver assessment", "Manager induction"],
  WORKSHOP: ["Driving licence", "Driver CPC", "Tachograph card", "Driver assessment", "Workshop induction"],
  CONTRACTOR: ["Driving licence", "Driver CPC", "Tachograph card", "Driver assessment", "Contractor induction"],
  OFFICE: ["Office induction", "Data protection"],
};

const nice = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("en-GB") : "Not set";

export function PersonalPage() {
  const [view, setView] = useState<View>("OVERVIEW");
  const [overview, setOverview] = useState<StaffOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [onboardingKey, setOnboardingKey] = useState(() => crypto.randomUUID());
  const [depots, setDepots] = useState<Depot[]>([]);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    personType: "DRIVER" as PersonType,
    accessRole: "DRIVER" as AccessRole,
    skills: [] as string[], depotId: "", startDate: "", dateOfBirth: "",
    address: "", postcode: "", emergencyContact: "", emergencyPhone: "",
    licenceNumber: "", licenceExpiry: "", cpcExpiry: "", tachoCardNumber: "",
    tachoCardExpiry: "", medicalDue: "", inviteAccount: true,
  });
  const canRemoveStaff = staffRemovalRoles.has(document.documentElement.dataset.fleetosRole ?? "");

  const selectedType = useMemo(() => personTypes.find(([value]) => value === form.personType), [form.personType]);
  const trainingOptions = trainingByType[form.personType];
  const update = (key: string, value: string | boolean | string[]) => setForm((current) => ({ ...current, [key]: value }));

  async function loadOverview() {
    const companyId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (!companyId) return setError("No active company workspace is selected.");
    setOverviewLoading(true);
    setError("");
    const { data, error: functionError } = await supabase.functions.invoke("staff-overview", { body: { companyId } });
    setOverviewLoading(false);
    if (functionError) return setError(functionError.message || "Could not load Staff.");
    if (data?.error) return setError(data.error);
    setOverview(data as StaffOverview);
  }

  useEffect(() => {
    void loadOverview();
    void api<Depot[]>("/organisation/depots")
      .then((rows) => setDepots(rows.filter((depot) => depot.isActive)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load depots."));
  }, []);

  const activeStaff = useMemo(() => overview?.staff.filter((person) => person.isActive && person.driver?.isActive !== false) ?? [], [overview]);
  const leftStaff = useMemo(() => overview?.staff.filter((person) => !person.isActive || person.driver?.isActive === false || Boolean(person.driver?.leftDate)) ?? [], [overview]);
  const currentAbsences = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return overview?.absences.filter((item) => item.status !== "DECLINED" && item.status !== "CANCELLED" && item.startsOn <= today && item.endsOn >= today) ?? [];
  }, [overview]);
  const trainingAttention = useMemo(() => overview?.training.filter((item) => ["PLANNED", "BOOKED", "EXPIRED"].includes(item.status)) ?? [], [overview]);
  const staffByDriver = useMemo(() => new Map((overview?.staff ?? []).filter((person) => person.driver).map((person) => [person.driver!.id, person])), [overview]);

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
    if (step === 2 && form.inviteAccount && !STAFF_EMAIL_PATTERN.test(form.email.trim())) return "Enter a valid email address for the staff invitation.";
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
    const body = { ...form, email: form.email.trim().toLowerCase(), depotId: form.depotId || null, companyId, onboardingKey };
    let result = await supabase.functions.invoke("create-staff", { body });
    if (result.error && !(result.error instanceof FunctionsHttpError)) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data.session) result = await supabase.functions.invoke("create-staff", { body });
    }
    const { data, error: functionError } = result;
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
    setOnboardingKey(crypto.randomUUID());
    await loadOverview();
  }

  async function removeStaff(person: StaffRow) {
    if (!window.confirm(`Remove ${person.firstName} ${person.lastName} from active staff? Their app access will be revoked, while jobs, training and audit history will be kept.`)) return;
    setBusy(true);
    setError("");
    try {
      await api<void>(`/organisation/staff/${person.id}`, { method: "DELETE" });
      await loadOverview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove staff member.");
    } finally {
      setBusy(false);
    }
  }

  const depotName = depots.find((depot) => depot.id === form.depotId)?.name || "No depot assigned";

  if (saved) return <section className="page"><div className="empty-state panel"><div className="company-dot" style={{ margin: "0 auto 16px" }}><Check /></div><h1>Staff member added</h1><p>{form.firstName} {form.lastName} is now in Staff{driverCapableTypes.has(form.personType) ? " and has a driver profile" : ""}.</p><p className="subtle">{form.inviteAccount ? "Their Rivetway invitation was sent or existing account linked." : "No app account was created."} · {depotName}</p><button className="primary-button" onClick={() => { setSaved(false); setView("OVERVIEW"); setStep(1); }}>Back to Staff</button></div></section>;

  if (view !== "ADD") return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">People</p><h1>Staff</h1><p className="subtle">People, availability and training. Add details once, then manage by exception.</p></div><button className="primary-button" onClick={() => setView("ADD")}><UserPlus size={17}/> Add staff</button></div>
    {error && <p role="alert" className="form-message error">{error}</p>}
    {overviewLoading ? <section className="panel" style={{ padding: 20 }}>Loading Staff…</section> : <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 18 }}>
        <button className="panel" onClick={() => setView("OVERVIEW")} style={{ textAlign: "left", padding: 16 }}><Users size={20}/><small>Active staff</small><strong style={{ display: "block", fontSize: 28 }}>{activeStaff.length}</strong></button>
        <button className="panel" onClick={() => setView("ABSENCE")} style={{ textAlign: "left", padding: 16 }}><CalendarDays size={20}/><small>Off today</small><strong style={{ display: "block", fontSize: 28 }}>{currentAbsences.length}</strong></button>
        <button className="panel" onClick={() => setView("TRAINING")} style={{ textAlign: "left", padding: 16 }}><GraduationCap size={20}/><small>Training attention</small><strong style={{ display: "block", fontSize: 28 }}>{trainingAttention.length}</strong></button>
        <button className="panel" onClick={() => setView("LEFT")} style={{ textAlign: "left", padding: 16 }}><UserMinus size={20}/><small>Left / inactive</small><strong style={{ display: "block", fontSize: 28 }}>{leftStaff.length}</strong></button>
      </div>

      {view === "OVERVIEW" && <section className="panel" style={{ padding: 16 }}><div className="panel-heading"><div><h2>Current staff</h2><p>Open Staff to see who is available and what needs attention.</p></div></div>{activeStaff.length ? <div style={{ display: "grid", gap: 8 }}>{activeStaff.map((person) => <article key={person.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, alignItems: "center", padding: 12, borderTop: "1px solid rgba(148,163,184,.2)" }}><div><strong>{person.firstName} {person.lastName}</strong><small style={{ display: "block" }}>{person.email || person.phone || "No contact details"}</small></div><div><strong>{nice(person.personType)}</strong><small style={{ display: "block" }}>{person.userId ? `App access · ${nice(person.accessRole)}` : "No app login"}</small></div><div><small>Started {date(person.startDate)}</small></div>{canRemoveStaff&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void removeStaff(person)}><UserMinus size={16}/> Remove</button>}</article>)}</div> : <p className="subtle">No active staff yet.</p>}</section>}

      {view === "ABSENCE" && <section className="panel" style={{ padding: 16 }}><div className="panel-heading"><div><h2>Holiday, sickness & absence</h2><p>Approved leave, reported sickness and other absence records.</p></div></div>{overview?.absences.length ? <div style={{ display: "grid", gap: 8 }}>{overview.absences.map((item) => { const person = staffByDriver.get(item.driverId); return <article key={item.id} style={{ padding: 12, borderTop: "1px solid rgba(148,163,184,.2)" }}><strong>{person ? `${person.firstName} ${person.lastName}` : "Staff member"} · {nice(item.type)}</strong><p>{date(item.startsOn)} to {date(item.endsOn)} · {nice(item.status)}</p>{item.reason && <small>{item.reason}</small>}</article>; })}</div> : <p className="subtle">No absence records.</p>}</section>}

      {view === "TRAINING" && <section className="panel" style={{ padding: 16 }}><div className="panel-heading"><div><h2>Training matrix</h2><p>Training, qualifications and dates that need attention.</p></div></div>{overview?.training.length ? <div style={{ display: "grid", gap: 8 }}>{overview.training.map((item) => { const person = staffByDriver.get(item.driverId); return <article key={item.id} style={{ padding: 12, borderTop: "1px solid rgba(148,163,184,.2)" }}><strong>{person ? `${person.firstName} ${person.lastName}` : "Staff member"} · {item.title}</strong><p>{nice(item.status)} · due {date(item.dueDate)} · expires {date(item.expiryDate)}</p>{item.provider && <small>{item.provider}</small>}</article>; })}</div> : <p className="subtle">No training records.</p>}</section>}

      {view === "LEFT" && <section className="panel" style={{ padding: 16 }}><div className="panel-heading"><div><h2>Former staff</h2><p>People who have left stay on record instead of disappearing from the audit trail.</p></div></div>{leftStaff.length ? <div style={{ display: "grid", gap: 8 }}>{leftStaff.map((person) => <article key={person.id} style={{ padding: 12, borderTop: "1px solid rgba(148,163,184,.2)" }}><strong>{person.firstName} {person.lastName}</strong><p>{nice(person.personType)} · left {date(person.driver?.leftDate)}</p></article>)}</div> : <p className="subtle">No former staff records.</p>}</section>}
    </>}
  </section>;

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Staff</p><h1>Add staff</h1><p className="subtle">Minimum entry. The selected staff type drives access and training requirements.</p></div><button className="secondary-button" onClick={() => { setView("OVERVIEW"); setStep(1); }}>Back to Staff</button></div>
    <section className="panel" style={{ marginBottom: 24 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: 16 }}>{["Type", "Identity", "Driving & training", "Review"].map((label, index) => <div key={label} style={{ padding: "10px 12px", borderRadius: 10, background: step >= index + 1 ? "rgba(37,99,235,.10)" : "rgba(0,0,0,.04)", fontWeight: 700, fontSize: 13 }}>{index + 1}. {label}</div>)}</div></section>
    {error && <p role="alert" className="form-message error">{error}</p>}
    <form onSubmit={submit}>
      {step === 1 && <section className="panel"><div className="panel-heading"><div><h2>Staff type</h2><p>Choose the job type. App access and training are set from this.</p></div></div><div style={{ display: "grid", gap: 10, padding: 16 }}>{personTypes.map(([value, label, description, defaultRole]) => <button type="button" key={value} onClick={() => chooseType(value, defaultRole)} style={{ textAlign: "left", padding: 16, borderRadius: 12, border: form.personType === value ? "2px solid #2563eb" : "1px solid #ddd", background: form.personType === value ? "rgba(37,99,235,.06)" : "white" }}><strong>{label}</strong><div className="subtle">{description}</div></button>)}</div></section>}
      {step === 2 && <section className="panel"><div className="panel-heading"><h2>Who is it?</h2></div><div style={{ display: "grid", gap: 14, padding: 16 }}><div className="form-grid"><label>First name *<input autoFocus required value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label><label>Last name *<input required value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label><label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label>Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label><label>Depot / base<select value={form.depotId} onChange={(event) => update("depotId", event.target.value)}><option value="">No depot assigned</option>{depots.map((depot) => <option key={depot.id} value={depot.id}>{depot.name}</option>)}</select></label>{form.personType==="OFFICE"&&<label>App access<select value={form.accessRole} onChange={(event)=>update("accessRole",event.target.value)}><option value="OFFICE">Office staff</option><option value="FINANCE">Finance (read only)</option></select></label>}</div><label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={form.inviteAccount} onChange={(event) => update("inviteAccount", event.target.checked)} /> Create app login</label></div></section>}
      {step === 3 && <section className="panel"><div className="panel-heading"><div><h2>Training & qualifications</h2><p>Only record the driving details that apply to this role.</p></div></div><div style={{ display: "grid", gap: 16, padding: 16 }}><div className="form-grid"><label>Licence number<input value={form.licenceNumber} onChange={(event) => update("licenceNumber", event.target.value)} /></label><label>Licence expiry<input type="date" value={form.licenceExpiry} onChange={(event) => update("licenceExpiry", event.target.value)} /></label><label>CPC expiry<input type="date" value={form.cpcExpiry} onChange={(event) => update("cpcExpiry", event.target.value)} /></label><label>Tacho card number<input value={form.tachoCardNumber} onChange={(event) => update("tachoCardNumber", event.target.value)} /></label><label>Tacho card expiry<input type="date" value={form.tachoCardExpiry} onChange={(event) => update("tachoCardExpiry", event.target.value)} /></label><label>Medical due<input type="date" value={form.medicalDue} onChange={(event) => update("medicalDue", event.target.value)} /></label></div><div><h3 style={{ marginBottom: 10 }}>{selectedType?.[1]} training matrix</h3><div style={{ display: "grid", gap: 8 }}>{trainingOptions.map((item) => <label key={item} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid rgba(148,163,184,.25)", borderRadius: 10 }}><input type="checkbox" checked={form.skills.includes(item)} onChange={() => toggleTraining(item)} /> {item}</label>)}</div></div></div></section>}
      {step === 4 && <section className="panel"><div className="panel-heading"><div><h2>Review</h2><p>One entry, no duplicate setup.</p></div></div><div style={{ display: "grid", gap: 10, padding: 16 }}><p><strong>{form.firstName} {form.lastName}</strong> · {selectedType?.[1]}</p><p>Depot: <strong>{depotName}</strong></p><p>App role: <strong>{accessRoles.find(([value])=>value===form.accessRole)?.[1]??selectedType?.[1]}</strong>{driverCapableTypes.has(form.personType)?" · Driver app enabled":""}</p><p>{form.email || "No email"} · {form.phone || "No phone"}</p><p>Training: <strong>{form.skills.length ? form.skills.join(", ") : "None recorded"}</strong></p><p>{form.inviteAccount ? "App login: invitation will be sent or existing account linked" : "App login: not created"}</p></div></section>}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}><button type="button" className="switch-mode" disabled={step === 1 || busy} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={17} /> Back</button>{step < 4 ? <button type="button" className="primary-button" onClick={next}>Next <ChevronRight size={17}/></button> : <button type="submit" className="primary-button" disabled={busy}><UserPlus size={17}/>{busy ? " Creating…" : " Add staff"}</button>}</div>
    </form>
  </section>;
}

