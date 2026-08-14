import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ClipboardCheck, Coffee, Gauge, GraduationCap, MapPin, MessageCircle, Play, RefreshCw, ShieldAlert, TimerReset, Truck, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

type Activity = "DRIVING" | "OTHER_WORK" | "POA" | "BREAK_REST";
type Hours = { driver: { firstName: string; lastName: string }; current: { activity: Activity; startedAt: string } | null; totals: Record<Activity, number> };
type Vehicle = { id: string; registration: string; type: string; mileage: number | null; status: string };
type Job = { id: string; reference: string | null; title: string | null; customerName: string; collectionAddress: string | null; deliveryAddress: string | null; scheduledAt: string | null; status: string; instructions: string | null; vehicle: { id: string; registration: string } | null };
type CheckRecord = { id: string; status: string; nilDefect: boolean; completedAt: string; durationSeconds: number; registration: string; trailerRegistration: string | null };
type Breakdown = { id: string; severity: string; status: string; location: string; description: string; reportedAt: string; registration: string };
type Absence = { id: string; type: string; status: string; startsOn: string; endsOn: string; reason: string | null; officeNotes: string | null };
type Training = { id: string; title: string; category: string; status: string; provider: string | null; dueDate: string | null; bookedDate: string | null; completedDate: string | null; expiryDate: string | null; notes: string | null };
type DriverSummary = { driver: { id: string; firstName: string; lastName: string; phone: string | null }; vehicles: Vehicle[]; jobs: Job[]; checks: CheckRecord[]; breakdowns: Breakdown[]; absences: Absence[]; training: Training[] };
type TemplateItem = { id: string; section: string; label: string; target: "VEHICLE" | "TRAILER"; safetyCritical: boolean };
type CheckTemplate = { version: string; vehicle: Vehicle; trailer: Vehicle | null; items: TemplateItem[] };
type Answer = { status: "PASS" | "DEFECT" | "NA"; note?: string; severity?: "LOW" | "MEDIUM" | "HIGH" | "SAFETY_CRITICAL" };
type Section = "TODAY" | "CHECKS" | "BREAKDOWN" | "ADMIN";

const activityLabels: Record<Activity, string> = { DRIVING: "Driving", OTHER_WORK: "Other work", POA: "POA", BREAK_REST: "Break / rest" };
const activityActions: Array<[Activity, string, typeof Gauge]> = [["DRIVING", "Driving", Gauge], ["OTHER_WORK", "Other work", Wrench], ["POA", "POA", TimerReset], ["BREAK_REST", "Break / rest", Coffee]];
const sectionTabs: Array<[Section, string, typeof Gauge]> = [["TODAY", "Today", Gauge], ["CHECKS", "Walkaround", ClipboardCheck], ["BREAKDOWN", "Breakdown", ShieldAlert], ["ADMIN", "My admin", CalendarDays]];
const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("en-GB") : "Not set";
const statusLabel = (value: string) => value.replaceAll("_", " ");

function WalkaroundPanel({ summary, onSaved }: { summary: DriverSummary; onSaved: () => Promise<void> }) {
  const [vehicleId, setVehicleId] = useState("");
  const [trailerVehicleId, setTrailerVehicleId] = useState("");
  const [template, setTemplate] = useState<CheckTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [startedAt, setStartedAt] = useState("");
  const [odometer, setOdometer] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [signatureName, setSignatureName] = useState(`${summary.driver.firstName} ${summary.driver.lastName}`);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const trailers = summary.vehicles.filter(vehicle => vehicle.type === "TRAILER" && vehicle.id !== vehicleId);
  const selectedVehicle = summary.vehicles.find(vehicle => vehicle.id === vehicleId);
  const sections = useMemo(() => {
    const grouped = new Map<string, TemplateItem[]>();
    for (const item of template?.items ?? []) grouped.set(item.section, [...(grouped.get(item.section) ?? []), item]);
    return [...grouped.entries()];
  }, [template]);
  const completedCount = template?.items.filter(item => answers[item.id]?.status).length ?? 0;
  const safetyStop = Object.values(answers).some(answer => answer.status === "DEFECT" && answer.severity === "SAFETY_CRITICAL");

  async function loadTemplate(nextVehicleId: string, nextTrailerId = trailerVehicleId) {
    setVehicleId(nextVehicleId); setTrailerVehicleId(nextTrailerId); setTemplate(null); setAnswers({}); setMessage("");
    if (!nextVehicleId) return;
    setBusy(true);
    try {
      const query = new URLSearchParams({ vehicleId: nextVehicleId });
      if (nextTrailerId) query.set("trailerVehicleId", nextTrailerId);
      const loaded = await api<CheckTemplate>(`/driver-operations/check-template?${query}`);
      setTemplate(loaded); setStartedAt(new Date().toISOString()); setOdometer(loaded.vehicle.mileage?.toString() ?? "");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load the vehicle checklist."); }
    finally { setBusy(false); }
  }

  function setAnswer(id: string, status: Answer["status"]) {
    setAnswers(current => ({ ...current, [id]: status === "DEFECT" ? { status, severity: current[id]?.severity ?? "HIGH", note: current[id]?.note ?? "" } : { status } }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!template || !startedAt) return setMessage("Choose a vehicle and start its checklist.");
    if (completedCount !== template.items.length) return setMessage("Complete every checklist item before signing.");
    if (template.items.some(item => answers[item.id]?.status === "DEFECT" && !answers[item.id]?.note?.trim())) return setMessage("Describe every defect before signing.");
    if (!declarationAccepted) return setMessage("Confirm the driver declaration before submitting.");
    setBusy(true); setMessage("");
    try {
      const result = await api<{ status?: string; vehicleOffRoad?: boolean; offline?: boolean }>("/driver-operations/checks", { method: "POST", body: JSON.stringify({ vehicleId, trailerVehicleId: trailerVehicleId || undefined, odometer: odometer ? Number(odometer) : undefined, location, notes, startedAt, signatureName, declarationAccepted, items: template.items.map(item => ({ id: item.id, ...answers[item.id] })) }) });
      setMessage(result.offline ? "Check saved securely on this device and queued for office sync." : result.vehicleOffRoad ? "Check submitted. The affected vehicle has been marked off road and the office alerted." : `Check submitted: ${statusLabel(result.status ?? "recorded")}.`);
      setAnswers({}); setTemplate(null); setVehicleId(""); setTrailerVehicleId(""); setDeclarationAccepted(false); setNotes("");
      await onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not submit the walkaround check."); }
    finally { setBusy(false); }
  }

  return <div className="driver-stack">
    <section className="panel driver-callout"><ClipboardCheck size={26}/><div><h2>Daily walkaround check</h2><p>Choose the vehicle or combination. FleetOS builds the checklist from its vehicle type and records a signed, timestamped result for the office.</p></div></section>
    {message && <p role="status" className="form-message">{message}</p>}
    <form className="driver-stack" onSubmit={submit}>
      <section className="panel driver-form-card"><h2>1. Vehicle and location</h2><div className="form-grid">
        <label>Vehicle *<select value={vehicleId} onChange={event => void loadTemplate(event.target.value, "")}><option value="">Choose vehicle…</option>{summary.vehicles.filter(vehicle => vehicle.type !== "TRAILER").map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration} · {vehicle.type}</option>)}</select></label>
        {selectedVehicle?.type === "TRUCK" && <label>Trailer / combination<select value={trailerVehicleId} onChange={event => void loadTemplate(vehicleId, event.target.value)}><option value="">No FleetOS trailer attached</option>{trailers.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration}</option>)}</select></label>}
        <label>Odometer<input type="number" min="0" value={odometer} onChange={event => setOdometer(event.target.value)}/></label>
        <label>Location<input value={location} maxLength={300} onChange={event => setLocation(event.target.value)} placeholder="Depot, site or postcode"/></label>
      </div></section>
      {template && <>
        <section className="panel driver-form-card"><div className="driver-section-heading"><div><h2>2. Type-driven checks</h2><p>{template.version} · {completedCount}/{template.items.length} completed</p></div><button type="button" className="secondary-button" onClick={() => setAnswers(Object.fromEntries(template.items.map(item => [item.id, { status: "PASS" as const }])))}><CheckCircle2 size={16}/> Mark all pass</button></div>
          {sections.map(([section, items]) => <div key={section} className="check-section"><h3>{section}</h3>{items.map(item => { const answer = answers[item.id]; return <article key={item.id} className={`check-row ${answer?.status?.toLowerCase() ?? ""}`}><div className="check-label"><strong>{item.label}</strong><small>{item.target === "TRAILER" ? "Trailer" : "Vehicle"}{item.safetyCritical ? " · safety item" : ""}</small></div><div className="check-actions"><button type="button" className={answer?.status === "PASS" ? "selected-pass" : ""} onClick={() => setAnswer(item.id, "PASS")}>Pass</button><button type="button" className={answer?.status === "DEFECT" ? "selected-defect" : ""} onClick={() => setAnswer(item.id, "DEFECT")}>Defect</button><button type="button" className={answer?.status === "NA" ? "selected-na" : ""} onClick={() => setAnswer(item.id, "NA")}>N/A</button></div>{answer?.status === "DEFECT" && <div className="defect-detail"><label>What is wrong? *<textarea value={answer.note ?? ""} onChange={event => setAnswers(current => ({ ...current, [item.id]: { ...current[item.id], note: event.target.value } }))}/></label><label>Can the vehicle be used?<select value={answer.severity ?? "HIGH"} onChange={event => setAnswers(current => ({ ...current, [item.id]: { ...current[item.id], severity: event.target.value as Answer["severity"] } }))}><option value="LOW">Minor – monitor</option><option value="MEDIUM">Defect – office assessment</option><option value="HIGH">Serious – urgent assessment</option><option value="SAFETY_CRITICAL">Do not drive – unsafe</option></select></label></div>}</article>; })}</div>)}
        </section>
        <section className="panel driver-form-card"><h2>3. Sign and submit</h2>{safetyStop && <div className="safety-stop"><AlertTriangle/><div><strong>Do not drive</strong><p>A safety-critical defect will mark the affected vehicle off road and alert the office.</p></div></div>}<div className="form-grid"><label>Additional notes<textarea value={notes} onChange={event => setNotes(event.target.value)}/></label><label>Driver signature name *<input required value={signatureName} onChange={event => setSignatureName(event.target.value)}/></label></div><label className="driver-declaration"><input type="checkbox" checked={declarationAccepted} onChange={event => setDeclarationAccepted(event.target.checked)}/><span>I confirm I carried out this check, recorded the result accurately and will not use a vehicle I believe is unsafe.</span></label><button className="primary-button" disabled={busy}>{busy ? "Submitting…" : "Submit signed check"}</button></section>
      </>}
    </form>
  </div>;
}

function BreakdownPanel({ summary, onSaved }: { summary: DriverSummary; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ vehicleId: "", severity: "IMMOBILE", location: "", description: "", canMove: false, occupantsSafe: true, contactNumber: summary.driver.phone ?? "" });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { const result = await api<{ vehicleOffRoad?: boolean; offline?: boolean }>("/driver-operations/breakdowns", { method: "POST", body: JSON.stringify(form) }); setMessage(result.offline ? "Breakdown saved on this device and queued for office sync." : result.vehicleOffRoad ? "Breakdown reported. The vehicle is off road and the office has been alerted." : "Breakdown reported to the office and workshop queue."); setForm(current => ({ ...current, vehicleId: "", description: "", location: "" })); await onSaved(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not report the breakdown."); } finally { setBusy(false); } }
  return <div className="driver-stack"><section className="panel safety-stop"><AlertTriangle/><div><strong>Make people safe first</strong><p>If there is immediate danger, call the emergency services. Do not continue in a vehicle you believe is unsafe.</p></div></section>{message && <p role="status" className="form-message">{message}</p>}<form className="panel driver-form-card" onSubmit={submit}><h2>Report a breakdown</h2><div className="form-grid"><label>Vehicle *<select required value={form.vehicleId} onChange={event => setForm(current => ({ ...current, vehicleId: event.target.value }))}><option value="">Choose vehicle…</option>{summary.vehicles.filter(vehicle => vehicle.type !== "TRAILER").map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration}</option>)}</select></label><label>Situation<select value={form.severity} onChange={event => setForm(current => ({ ...current, severity: event.target.value }))}><option value="IMMOBILE">Vehicle cannot move</option><option value="UNSAFE">Unsafe to continue</option><option value="LIMITED">Can move only with advice</option><option value="MINOR">Minor problem</option></select></label><label>Exact location *<input required value={form.location} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} placeholder="Road, direction, marker or what3words"/></label><label>Contact number<input value={form.contactNumber} onChange={event => setForm(current => ({ ...current, contactNumber: event.target.value }))}/></label></div><label>What happened? *<textarea required value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))}/></label><div className="driver-toggle-grid"><label><input type="checkbox" checked={form.occupantsSafe} onChange={event => setForm(current => ({ ...current, occupantsSafe: event.target.checked }))}/> Driver and occupants are currently safe</label><label><input type="checkbox" checked={form.canMove} onChange={event => setForm(current => ({ ...current, canMove: event.target.checked }))}/> Vehicle can move if the office instructs</label></div><button className="primary-button" disabled={busy}>{busy ? "Reporting…" : "Alert office and workshop"}</button></form><section className="panel driver-form-card"><h2>My recent breakdowns</h2>{summary.breakdowns.length ? <div className="driver-list">{summary.breakdowns.map(item => <article key={item.id}><strong>{item.registration} · {statusLabel(item.status)}</strong><span>{formatDate(item.reportedAt)} · {item.location}</span><p>{item.description}</p></article>)}</div> : <p className="subtle">No breakdowns reported.</p>}</section></div>;
}

function AdminPanel({ summary, onSaved }: { summary: DriverSummary; onSaved: () => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ type: "HOLIDAY", startsOn: today, endsOn: today, reason: "" });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { const result = await api<{ offline?: boolean }>("/driver-operations/absences", { method: "POST", body: JSON.stringify(form) }); setMessage(result.offline ? "Admin record saved and queued for office sync." : form.type === "HOLIDAY" ? "Holiday request sent to the office for approval." : "Sickness/absence notification sent to the office."); setForm(current => ({ ...current, reason: "" })); await onSaved(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not send the request."); } finally { setBusy(false); } }
  return <div className="driver-stack">{message && <p role="status" className="form-message">{message}</p>}<div className="driver-two-column"><form className="panel driver-form-card" onSubmit={submit}><h2>Holiday, sickness or absence</h2><label>Type<select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}><option value="HOLIDAY">Holiday request</option><option value="SICKNESS">Report sickness</option><option value="OTHER">Other absence</option></select></label><div className="form-grid"><label>From<input required type="date" value={form.startsOn} onChange={event => setForm(current => ({ ...current, startsOn: event.target.value }))}/></label><label>To<input required type="date" value={form.endsOn} onChange={event => setForm(current => ({ ...current, endsOn: event.target.value }))}/></label></div><label>Information for the office<textarea value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))}/></label><button className="primary-button" disabled={busy}>{busy ? "Sending…" : form.type === "HOLIDAY" ? "Request holiday" : "Notify office"}</button></form><section className="panel driver-form-card"><h2>My requests and absences</h2>{summary.absences.length ? <div className="driver-list">{summary.absences.map(item => <article key={item.id}><strong>{statusLabel(item.type)} · {statusLabel(item.status)}</strong><span>{formatDate(item.startsOn)} to {formatDate(item.endsOn)}</span>{item.officeNotes && <p>Office: {item.officeNotes}</p>}</article>)}</div> : <p className="subtle">Nothing recorded yet.</p>}</section></div><section className="panel driver-form-card"><div className="driver-section-heading"><div><h2>Training and qualifications</h2><p>Training entered by the office appears here with due, booked and expiry dates.</p></div><GraduationCap size={24}/></div>{summary.training.length ? <div className="training-grid">{summary.training.map(item => <article key={item.id}><span className={`driver-status ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span><h3>{item.title}</h3><p>{statusLabel(item.category)}</p><dl><div><dt>Due</dt><dd>{formatDate(item.dueDate)}</dd></div><div><dt>Booked</dt><dd>{formatDate(item.bookedDate)}</dd></div><div><dt>Expires</dt><dd>{formatDate(item.expiryDate)}</dd></div></dl>{item.provider && <small>{item.provider}</small>}</article>)}</div> : <p className="subtle">No training records have been assigned.</p>}</section></div>;
}

export function DriverCockpitPage() {
  const [summary, setSummary] = useState<DriverSummary | null>(null); const [hours, setHours] = useState<Hours | null>(null); const [section, setSection] = useState<Section>("TODAY");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { setError(""); try { const [nextSummary, nextHours] = await Promise.all([api<DriverSummary>("/driver-operations/me"), api<Hours>("/operations/driver-hours/me")]); setSummary(nextSummary); setHours(nextHours); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load Driver Operations."); } }
  useEffect(() => { void load(); }, []);
  async function setActivity(activity: Activity) { setBusy(true); try { await api("/operations/driver-hours/me", { method: "POST", body: JSON.stringify({ activity }) }); await load(); } catch (activityError) { setError(activityError instanceof Error ? activityError.message : "Could not update activity."); } finally { setBusy(false); } }
  async function moveJob(id: string, status: "ON_SITE" | "COMPLETED") { setBusy(true); try { await api(`/driver-operations/jobs/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); } catch (jobError) { setError(jobError instanceof Error ? jobError.message : "Could not update the job."); } finally { setBusy(false); } }
  const driving = hours?.totals.DRIVING ?? 0;
  const currentMinutes = hours?.current ? Math.floor((Date.now() - new Date(hours.current.startedAt).getTime()) / 60_000) : 0;
  if (!summary) return <main className="loading-page"><div><RefreshCw className="spin"/><h1>Loading Driver Operations</h1>{error && <p role="alert">{error}</p>}</div></main>;
  return <section className="page driver-page"><div className="page-heading"><div><p className="eyebrow">Driver Operations</p><h1>{summary.driver.firstName}'s driver app</h1><p className="subtle">Jobs, daily checks, breakdowns, messages and personal admin linked directly to the office.</p></div><Link className="primary-button" to="/messages"><MessageCircle size={17}/> Messages</Link></div>{error && <p role="alert" className="form-message error">{error}</p>}<nav className="driver-tabs" aria-label="Driver app sections">{sectionTabs.map(([value, label, Icon]) => <button key={value} className={section === value ? "active" : ""} onClick={() => setSection(value)}><Icon size={18}/>{label}</button>)}</nav>
    {section === "CHECKS" && <WalkaroundPanel summary={summary} onSaved={load}/>} {section === "BREAKDOWN" && <BreakdownPanel summary={summary} onSaved={load}/>} {section === "ADMIN" && <AdminPanel summary={summary} onSaved={load}/>} {section === "TODAY" && <div className="driver-stack"><div className="driver-metrics"><article className="panel"><span>Driving today</span><strong>{formatMinutes(driving)}</strong></article><article className="panel"><span>Current activity</span><strong>{hours?.current ? activityLabels[hours.current.activity] : "Not set"}</strong><small>{hours?.current ? `${formatMinutes(currentMinutes)} current session` : "Choose below"}</small></article><article className="panel"><span>Checks</span><strong>{summary.checks[0]?.status ? statusLabel(summary.checks[0].status) : "Due"}</strong><small>{summary.checks[0] ? formatDate(summary.checks[0].completedAt) : "No check recorded"}</small></article></div><section className="panel driver-form-card"><h2>Activity companion</h2><p className="subtle">This shares your working state with authorised office users. It does not replace an approved tachograph.</p><div className="activity-grid">{activityActions.map(([value, label, Icon]) => <button key={value} disabled={busy} className={hours?.current?.activity === value ? "primary-button" : "secondary-button"} onClick={() => void setActivity(value)}><Icon size={18}/>{label}</button>)}</div>{driving >= 240 && <div className="driver-warning"><AlertTriangle size={18}/> Approaching 4½ hours of recorded driving. Confirm the applicable legal break requirement against the tachograph and this duty.</div>}</section><section className="panel driver-form-card"><div className="driver-section-heading"><div><h2>Assigned jobs</h2><p>Only work assigned to your driver record appears here.</p></div><Truck size={24}/></div>{summary.jobs.length ? <div className="driver-list jobs">{summary.jobs.map(job => <article key={job.id}><div><strong>{job.reference || job.id} · {job.customerName}</strong><span>{formatDate(job.scheduledAt)}{job.vehicle ? ` · ${job.vehicle.registration}` : ""}</span><p><MapPin size={14}/> {job.collectionAddress || "Collection not set"} → {job.deliveryAddress || "Delivery not set"}</p>{job.instructions && <small>{job.instructions}</small>}</div><div className="job-driver-actions"><span className={`driver-status ${job.status.toLowerCase()}`}>{statusLabel(job.status)}</span>{["ASSIGNED", "PLANNED", "SCHEDULED", "DISPATCHED", "TRAVELLING"].includes(job.status) && <button disabled={busy} onClick={() => void moveJob(job.id, "ON_SITE")}><Play size={15}/> Start</button>}{["ON_SITE", "PAUSED", "IN_PROGRESS"].includes(job.status) && <button className="primary-button" disabled={busy} onClick={() => void moveJob(job.id, "COMPLETED")}><Check size={15}/> Complete</button>}</div></article>)}</div> : <p className="subtle">No jobs assigned.</p>}</section></div>}
  </section>;
}
