import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, CalendarDays, Camera, Check, ChevronLeft, ChevronRight, ClipboardCheck, CloudOff, MapPin, RefreshCw, ShieldAlert, Truck, UserRound } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

type Vehicle = { id: string; registration: string; type: string; mileage: number | null; status: string };
type Job = { id: string; reference: string | null; title: string | null; customerName: string; scheduledAt: string | null; status: string; vehicle: { id: string; registration: string } | null };
type AssignedWork = { id: string; reference: string | null; title: string | null; customerName: string; scheduledStart: string | null; status: string; registration: string | null };
type CheckRecord = { id: string; status: string; nilDefect: boolean; completedAt: string; registration: string };
type Breakdown = { id: string; severity: string; status: string; location: string; description: string; reportedAt: string; registration: string };
type Absence = { id: string; type: string; status: string; startsOn: string; endsOn: string; reason?: string | null; officeNotes?: string | null };
type Training = { id: string; title: string; category: string; status: string; expiryDate: string | null; dueDate: string | null };
type DriverSummary = { driver: { id: string; firstName: string; lastName: string; phone: string | null }; vehicles: Vehicle[]; jobs: Job[]; checks: CheckRecord[]; breakdowns: Breakdown[]; absences: Absence[]; training: Training[] };
type TemplateItem = { id: string; section: string; label: string; target: "VEHICLE" | "TRAILER"; safetyCritical: boolean };
type CheckTemplate = { version: string; vehicle: Vehicle; trailer: Vehicle | null; items: TemplateItem[] };
type Severity = "LOW" | "MEDIUM" | "HIGH" | "SAFETY_CRITICAL";
type Answer = { status: "PASS" | "DEFECT" | "NA"; note?: string; severity?: Severity; photoDataUrl?: string; photoCapturedAt?: string };
type Gps = { latitude: number; longitude: number; accuracy: number; capturedAt: string };
type Mode = "HOME" | "CHECK" | "BREAKDOWN" | "ADMIN";

const quickReasons = ["Damaged", "Loose", "Missing", "Leaking", "Worn", "Warning showing", "Not working", "Other"];
const outcomeOptions: Array<[Severity, string, string]> = [
  ["LOW", "Minor", "Record and monitor"],
  ["MEDIUM", "Needs assessment", "Office/workshop to assess"],
  ["HIGH", "Serious", "Urgent assessment before continuing"],
  ["SAFETY_CRITICAL", "DO NOT DRIVE", "Vehicle or trailer is unsafe"],
];

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Not set";
}

function getGps(): Promise<{ status: "CAPTURED" | "UNAVAILABLE" | "DENIED"; gps?: Gps }> {
  return new Promise(resolve => {
    if (!("geolocation" in navigator)) return resolve({ status: "UNAVAILABLE" });
    navigator.geolocation.getCurrentPosition(
      position => resolve({ status: "CAPTURED", gps: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date().toISOString() } }),
      error => resolve({ status: error.code === error.PERMISSION_DENIED ? "DENIED" : "UNAVAILABLE" }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

async function compressPhoto(file: File) {
  const image = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera image could not be prepared.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  let quality = 0.72;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length > 850_000 && quality > 0.38) {
    quality -= 0.08;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  if (data.length > 950_000) throw new Error("Photo is too large. Please retake it closer to the defect.");
  return data;
}

export function DriverFieldPage() {
  const [summary, setSummary] = useState<DriverSummary | null>(null);
  const [mode, setMode] = useState<Mode>("HOME");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(navigator.onLine);

  async function load() {
    setLoading(true);
    try {
      const [driverSummary, assignedWork] = await Promise.all([
        api<DriverSummary>("/driver-operations/me"),
        api<AssignedWork[]>("/jobs/my-work").catch(() => [] as AssignedWork[]),
      ]);
      const assignedJobs: Job[] = assignedWork.map(job => ({
        id: job.id,
        reference: job.reference,
        title: job.title,
        customerName: job.customerName,
        scheduledAt: job.scheduledStart,
        status: job.status,
        vehicle: job.registration ? { id: "", registration: job.registration } : null,
      }));
      setSummary({ ...driverSummary, jobs: assignedJobs.length ? assignedJobs : driverSummary.jobs });
      setMessage("");
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Driver information could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (loading) return <main className="driver-field-loading">Opening driver app…</main>;
  if (!summary) return <main className="driver-field-loading"><h1>Driver app unavailable</h1><p>{message}</p><button onClick={() => void load()}><RefreshCw/> Try again</button></main>;

  return <main className="driver-field-app">
    <header className="driver-field-header">
      <div><small>FleetOS Driver</small><strong>{summary.driver.firstName} {summary.driver.lastName}</strong></div>
      <span className={online ? "field-online" : "field-offline"}>{online ? "Online" : <><CloudOff size={16}/> Offline</>}</span>
    </header>
    {mode !== "HOME" && <button className="field-back" onClick={() => setMode("HOME")}><ChevronLeft/> Home</button>}
    {mode === "HOME" && <Home summary={summary} setMode={setMode} />}
    {mode === "CHECK" && <Walkaround summary={summary} onDone={async () => { await load(); setMode("HOME"); }} />}
    {mode === "BREAKDOWN" && <BreakdownPanel summary={summary} onDone={async () => { await load(); setMode("HOME"); }} />}
    {mode === "ADMIN" && <AdminPanel summary={summary} onSaved={load} />}
  </main>;
}

function Home({ summary, setMode }: { summary: DriverSummary; setMode: (mode: Mode) => void }) {
  const todayJobs = summary.jobs.filter(job => !job.scheduledAt || new Date(job.scheduledAt).toDateString() === new Date().toDateString());
  return <div className="field-home">
    <section className="field-welcome"><p>Good {new Date().getHours() < 12 ? "morning" : "day"}</p><h1>{summary.driver.firstName}</h1><span>{todayJobs.length ? `${todayJobs.length} job${todayJobs.length === 1 ? "" : "s"} today` : "No jobs assigned today"}</span></section>
    <div className="field-main-actions">
      <button className="field-action field-action-check" onClick={() => setMode("CHECK")}><ClipboardCheck/><span><strong>START CHECK</strong><small>Vehicle walkaround</small></span><ChevronRight/></button>
      <button className="field-action" onClick={() => { window.location.href = "/my-work"; }}><BriefcaseBusiness/><span><strong>MY JOBS</strong><small>{summary.jobs.length ? `${summary.jobs.length} assigned` : "No assigned work"}</small></span><ChevronRight/></button>
      <button className="field-action field-action-breakdown" onClick={() => setMode("BREAKDOWN")}><ShieldAlert/><span><strong>BREAKDOWN</strong><small>Alert office & workshop</small></span><ChevronRight/></button>
      <button className="field-action" onClick={() => setMode("ADMIN")}><UserRound/><span><strong>MY ADMIN</strong><small>Training, leave & records</small></span><ChevronRight/></button>
    </div>
    {summary.checks[0] && <section className="field-status-card"><Check/><div><small>Last vehicle check</small><strong>{summary.checks[0].registration} · {summary.checks[0].status.replaceAll("_", " ")}</strong><span>{formatDate(summary.checks[0].completedAt)}</span></div></section>}
  </div>;
}

function Walkaround({ summary, onDone }: { summary: DriverSummary; onDone: () => Promise<void> }) {
  const [vehicleId, setVehicleId] = useState("");
  const [trailerVehicleId, setTrailerVehicleId] = useState("");
  const [template, setTemplate] = useState<CheckTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [index, setIndex] = useState(0);
  const [odometer, setOdometer] = useState("");
  const [locationText, setLocationText] = useState("");
  const [gpsStatus, setGpsStatus] = useState<"CAPTURED" | "UNAVAILABLE" | "DENIED">("UNAVAILABLE");
  const [gps, setGps] = useState<Gps | undefined>();
  const [startedAt, setStartedAt] = useState("");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = template?.items[index];
  const selectedVehicle = summary.vehicles.find(vehicle => vehicle.id === vehicleId);
  const trailers = summary.vehicles.filter(vehicle => vehicle.type === "TRAILER");
  const completed = template?.items.filter(item => !!answers[item.id]).length ?? 0;
  const defects = template?.items.filter(item => answers[item.id]?.status === "DEFECT") ?? [];
  const safetyStop = defects.some(item => answers[item.id]?.severity === "SAFETY_CRITICAL");

  async function startCheck() {
    if (!vehicleId) return setMessage("Choose your vehicle first.");
    setBusy(true); setMessage("");
    try {
      const query = new URLSearchParams({ vehicleId });
      if (trailerVehicleId) query.set("trailerVehicleId", trailerVehicleId);
      const [loaded, position] = await Promise.all([api<CheckTemplate>(`/driver-operations/check-template?${query}`), getGps()]);
      setTemplate(loaded); setOdometer(loaded.vehicle.mileage?.toString() ?? ""); setStartedAt(new Date().toISOString()); setIndex(0); setAnswers({});
      setGpsStatus(position.status); setGps(position.gps);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start the check."); }
    finally { setBusy(false); }
  }

  function answer(status: "PASS" | "NA" | "DEFECT") {
    if (!current) return;
    if (status === "DEFECT") {
      setAnswers(values => ({ ...values, [current.id]: { status: "DEFECT", severity: current.safetyCritical ? "HIGH" : "MEDIUM", note: "" } }));
      return;
    }
    setAnswers(values => ({ ...values, [current.id]: { status } }));
    if (template && index < template.items.length - 1) setIndex(value => value + 1);
  }

  async function photo(event: ChangeEvent<HTMLInputElement>) {
    if (!current || !event.target.files?.[0]) return;
    setBusy(true); setMessage("");
    try {
      const photoDataUrl = await compressPhoto(event.target.files[0]);
      setAnswers(values => ({ ...values, [current.id]: { ...values[current.id], photoDataUrl, photoCapturedAt: new Date().toISOString() } }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Photo could not be saved."); }
    finally { setBusy(false); event.target.value = ""; }
  }

  function nextAfterFail() {
    if (!current) return;
    const value = answers[current.id];
    if (!value?.photoDataUrl) return setMessage("Take a photo of the failed item before continuing.");
    if (!value.note?.trim()) return setMessage("Choose or enter what is wrong.");
    if (!value.severity) return setMessage("Choose whether the vehicle can continue.");
    setMessage("");
    if (template && index < template.items.length - 1) setIndex(value => value + 1);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!template) return;
    if (completed !== template.items.length) return setMessage("Complete every check item first.");
    if (!declarationAccepted) return setMessage("Confirm the declaration before submitting.");
    setBusy(true); setMessage("");
    try {
      const result = await api<{ offline?: boolean; vehicleOffRoad?: boolean; status?: string }>("/driver-operations/field-checks", {
        method: "POST",
        body: JSON.stringify({ vehicleId, trailerVehicleId: trailerVehicleId || undefined, odometer: odometer ? Number(odometer) : undefined, location: locationText, gpsStatus, gps, startedAt, declarationAccepted: true, items: template.items.map(item => ({ id: item.id, ...answers[item.id] })) }),
      });
      if (result.offline) setMessage("CHECK SAVED ✓ Waiting for signal to send to office.");
      else if (result.vehicleOffRoad) setMessage("CHECK SENT ✓ DO NOT DRIVE. Office and workshop have been alerted.");
      else setMessage("CHECK SENT ✓ Recorded with the office.");
      window.setTimeout(() => void onDone(), 900);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check could not be submitted."); }
    finally { setBusy(false); }
  }

  if (!template) return <section className="field-flow">
    <div className="field-flow-title"><Truck/><div><small>Daily walkaround</small><h1>Choose vehicle</h1></div></div>
    {message && <p className="field-message">{message}</p>}
    <label className="field-label">Vehicle<select value={vehicleId} onChange={event => { setVehicleId(event.target.value); setTrailerVehicleId(""); }}><option value="">Select vehicle…</option>{summary.vehicles.filter(v => v.type !== "TRAILER").map(v => <option key={v.id} value={v.id}>{v.registration} · {v.type}</option>)}</select></label>
    {selectedVehicle?.type === "TRUCK" && <label className="field-label">Trailer<select value={trailerVehicleId} onChange={event => setTrailerVehicleId(event.target.value)}><option value="">No trailer</option>{trailers.map(v => <option key={v.id} value={v.id}>{v.registration}</option>)}</select></label>}
    <label className="field-label">Location / site <input value={locationText} onChange={event => setLocationText(event.target.value)} placeholder="Optional – GPS is captured automatically"/></label>
    <button className="field-start" disabled={busy || !vehicleId} onClick={() => void startCheck()}>{busy ? "Starting…" : "START WALKAROUND"}</button>
    <p className="field-helper">GPS failure will never stop a safety check. If there is no signal, the completed check is queued on this device.</p>
  </section>;

  if (completed === template.items.length && index === template.items.length - 1 && answers[current!.id]?.status !== "DEFECT") {
    return <form className="field-flow" onSubmit={submit}>
      <div className="field-complete"><Check/><h1>Check complete</h1><p>{template.items.length - defects.length} pass / N/A · {defects.length} fail</p></div>
      {safetyStop && <div className="field-danger"><AlertTriangle/><div><strong>DO NOT DRIVE</strong><span>A safety-critical defect has been recorded.</span></div></div>}
      <label className="field-label">Odometer<input inputMode="numeric" type="number" min="0" value={odometer} onChange={event => setOdometer(event.target.value)}/></label>
      <div className="field-gps"><MapPin/><span>{gpsStatus === "CAPTURED" ? `Location captured ±${Math.round(gps?.accuracy ?? 0)}m` : gpsStatus === "DENIED" ? "Location permission denied – check can still be submitted" : "Location unavailable – check can still be submitted"}</span></div>
      <label className="field-declaration"><input type="checkbox" checked={declarationAccepted} onChange={event => setDeclarationAccepted(event.target.checked)}/><span>I confirm I carried out this check and recorded the condition accurately. I will not use a vehicle I believe is unsafe.</span></label>
      {message && <p className="field-message">{message}</p>}
      <button className={safetyStop ? "field-submit field-submit-danger" : "field-submit"} disabled={busy}>{busy ? "Saving…" : safetyStop ? "SUBMIT & ALERT OFFICE" : "SIGN & SUBMIT"}</button>
    </form>;
  }

  const value = current ? answers[current.id] : undefined;
  return <section className="field-flow">
    <div className="field-progress-row"><span>{index + 1} of {template.items.length}</span><span>{current?.section}</span></div>
    <div className="field-progress"><i style={{ width: `${((index + 1) / template.items.length) * 100}%` }}/></div>
    <article className={`field-check-card ${value?.status === "DEFECT" ? "is-fail" : ""}`}>
      <small>{current?.target === "TRAILER" ? `TRAILER ${template.trailer?.registration ?? ""}` : template.vehicle.registration}</small>
      <h1>{current?.label}</h1>
      {current?.safetyCritical && <span className="field-safety-label">Safety item</span>}
    </article>
    {message && <p className="field-message">{message}</p>}
    {value?.status !== "DEFECT" ? <div className="field-answer-grid">
      <button className="field-pass" onClick={() => answer("PASS")}><Check/> PASS</button>
      <button className="field-fail" onClick={() => answer("DEFECT")}><AlertTriangle/> FAIL</button>
      <button className="field-na" onClick={() => answer("NA")}>N/A</button>
    </div> : <div className="field-fail-flow">
      <label className={`field-photo ${value.photoDataUrl ? "has-photo" : ""}`}><Camera/><strong>{value.photoDataUrl ? "Photo captured ✓" : "TAKE PHOTO"}</strong><small>Required for every failed item</small><input type="file" accept="image/*" capture="environment" onChange={event => void photo(event)}/></label>
      <div className="field-reasons">{quickReasons.map(reason => <button key={reason} type="button" className={value.note === reason ? "selected" : ""} onClick={() => setAnswers(values => ({ ...values, [current!.id]: { ...values[current!.id], note: reason } }))}>{reason}</button>)}</div>
      <label className="field-label">Short detail<textarea value={value.note ?? ""} onChange={event => setAnswers(values => ({ ...values, [current!.id]: { ...values[current!.id], note: event.target.value } }))} placeholder="What is wrong?"/></label>
      <div className="field-outcomes">{outcomeOptions.map(([severity, title, detail]) => <button key={severity} type="button" className={value.severity === severity ? `selected severity-${severity}` : ""} onClick={() => setAnswers(values => ({ ...values, [current!.id]: { ...values[current!.id], severity } }))}><strong>{title}</strong><small>{detail}</small></button>)}</div>
      <button className="field-next" onClick={nextAfterFail}>SAVE DEFECT & CONTINUE <ChevronRight/></button>
    </div>}
    <div className="field-nav-row"><button disabled={index === 0} onClick={() => setIndex(i => Math.max(0, i - 1))}><ChevronLeft/> Previous</button>{index < template.items.length - 1 && value?.status && value.status !== "DEFECT" && <button onClick={() => setIndex(i => i + 1)}>Next <ChevronRight/></button>}</div>
  </section>;
}

function BreakdownPanel({ summary, onDone }: { summary: DriverSummary; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ vehicleId: "", severity: "IMMOBILE", location: "", description: "", canMove: false, occupantsSafe: true, contactNumber: summary.driver.phone ?? "" });
  const [gpsStatus, setGpsStatus] = useState<"CAPTURED" | "UNAVAILABLE" | "DENIED">("UNAVAILABLE");
  const [gps, setGps] = useState<Gps | undefined>();
  const [photos, setPhotos] = useState<Array<{ dataUrl: string; capturedAt: string }>>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { void getGps().then(result => { setGpsStatus(result.status); setGps(result.gps); }); }, []);
  async function addPhoto(event: ChangeEvent<HTMLInputElement>) { if (!event.target.files?.[0]) return; setBusy(true); try { const dataUrl = await compressPhoto(event.target.files[0]); setPhotos(values => [...values, { dataUrl, capturedAt: new Date().toISOString() }].slice(0, 6)); } catch (error) { setMessage(error instanceof Error ? error.message : "Photo could not be saved."); } finally { setBusy(false); event.target.value = ""; } }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { const result = await api<{ offline?: boolean; vehicleOffRoad?: boolean }>("/driver-operations/field-breakdowns", { method: "POST", body: JSON.stringify({ ...form, gpsStatus, gps, photos }) }); setMessage(result.offline ? "BREAKDOWN SAVED ✓ Waiting for signal." : result.vehicleOffRoad ? "BREAKDOWN SENT ✓ DO NOT DRIVE. Office and workshop alerted." : "BREAKDOWN SENT ✓ Office and workshop alerted."); window.setTimeout(() => void onDone(), 900); } catch (error) { setMessage(error instanceof Error ? error.message : "Breakdown could not be reported."); } finally { setBusy(false); } }
  return <form className="field-flow" onSubmit={submit}>
    <div className="field-danger"><AlertTriangle/><div><strong>MAKE PEOPLE SAFE FIRST</strong><span>If there is immediate danger, call emergency services.</span></div></div>
    <h1>Report breakdown</h1>
    <label className="field-label">Vehicle<select required value={form.vehicleId} onChange={event => setForm(v => ({ ...v, vehicleId: event.target.value }))}><option value="">Choose vehicle…</option>{summary.vehicles.filter(v => v.type !== "TRAILER").map(v => <option key={v.id} value={v.id}>{v.registration}</option>)}</select></label>
    <div className="field-outcomes"><button type="button" className={form.severity === "IMMOBILE" ? "selected" : ""} onClick={() => setForm(v => ({ ...v, severity: "IMMOBILE" }))}><strong>Cannot move</strong></button><button type="button" className={form.severity === "UNSAFE" ? "selected" : ""} onClick={() => setForm(v => ({ ...v, severity: "UNSAFE" }))}><strong>Unsafe</strong></button><button type="button" className={form.severity === "LIMITED" ? "selected" : ""} onClick={() => setForm(v => ({ ...v, severity: "LIMITED" }))}><strong>Need advice</strong></button><button type="button" className={form.severity === "MINOR" ? "selected" : ""} onClick={() => setForm(v => ({ ...v, severity: "MINOR" }))}><strong>Minor</strong></button></div>
    <label className="field-label">Where are you? <input required value={form.location} onChange={event => setForm(v => ({ ...v, location: event.target.value }))} placeholder="Road, site, postcode or landmark"/></label>
    <div className="field-gps"><MapPin/><span>{gpsStatus === "CAPTURED" ? `GPS captured ±${Math.round(gps?.accuracy ?? 0)}m` : "GPS unavailable – continue anyway"}</span></div>
    <label className="field-label">What happened? <textarea required value={form.description} onChange={event => setForm(v => ({ ...v, description: event.target.value }))}/></label>
    <label className="field-photo"><Camera/><strong>ADD PHOTO</strong><small>{photos.length ? `${photos.length} attached` : "Optional but useful for office/workshop"}</small><input type="file" accept="image/*" capture="environment" onChange={event => void addPhoto(event)}/></label>
    <label className="field-declaration"><input type="checkbox" checked={form.occupantsSafe} onChange={event => setForm(v => ({ ...v, occupantsSafe: event.target.checked }))}/><span>Driver and occupants are currently safe</span></label>
    {message && <p className="field-message">{message}</p>}
    <button className="field-submit field-submit-danger" disabled={busy || !form.vehicleId}>{busy ? "Sending…" : "ALERT OFFICE & WORKSHOP"}</button>
  </form>;
}

function AdminPanel({ summary, onSaved }: { summary: DriverSummary; onSaved: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const upcoming = useMemo(() => summary.training.filter(item => item.status !== "CANCELLED").slice(0, 8), [summary.training]);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ type: "HOLIDAY", startsOn: today, endsOn: today, reason: "" });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { await api("/driver-operations/absences", { method: "POST", body: JSON.stringify(form) }); setMessage(t(form.type === "HOLIDAY" ? "admin.leaveSent" : "admin.sicknessSent")); setForm(current => ({ ...current, reason: "" })); await onSaved(); } catch (error) { setMessage(error instanceof Error ? error.message : t("admin.sendFailed")); } finally { setBusy(false); } }
  const localDate=(value:string)=>new Date(value).toLocaleDateString(locale,{day:"2-digit",month:"short",year:"numeric"});
  return <section className="field-flow"><div className="field-flow-title"><CalendarDays/><div><small>{t("admin.yourRecords")}</small><h1>{t("admin.myAdmin")}</h1></div></div>{message&&<p role="status" className="field-message">{message}</p>}<form className="driver-dark-card field-admin-request" onSubmit={submit}><h2>{t("admin.requestOrSick")}</h2><label className="field-label">{t("admin.action")}<select value={form.type} onChange={event=>setForm(current=>({...current,type:event.target.value}))}><option value="HOLIDAY">{t("admin.requestLeave")}</option><option value="SICKNESS">{t("admin.reportSickness")}</option></select></label><div className="form-grid"><label className="field-label">{t("admin.from")}<input required type="date" value={form.startsOn} onChange={event=>setForm(current=>({...current,startsOn:event.target.value}))}/></label><label className="field-label">{t("admin.to")}<input required type="date" value={form.endsOn} onChange={event=>setForm(current=>({...current,endsOn:event.target.value}))}/></label></div><label className="field-label">{t("admin.officeInfo")}<textarea value={form.reason} onChange={event=>setForm(current=>({...current,reason:event.target.value}))} placeholder={t(form.type==="HOLIDAY"?"admin.leavePlaceholder":"admin.sicknessPlaceholder")}/></label><button className="field-submit" disabled={busy}>{busy?t("admin.sending"):t(form.type==="HOLIDAY"?"admin.sendLeave":"admin.reportSickness")}</button></form><div className="field-admin-grid"><article><h2>{t("admin.training")}</h2>{upcoming.length ? upcoming.map(item => <div className="field-admin-row" key={item.id}><strong>{item.title}</strong><span>{item.status.replaceAll("_"," ")} · {formatDate(item.expiryDate ?? item.dueDate)}</span></div>) : <p>{t("admin.nothingDue")}</p>}</article><article><h2>{t("admin.leaveAbsence")}</h2>{summary.absences.length ? summary.absences.slice(0, 6).map(item => <div className="field-admin-row" key={item.id}><strong>{item.type.replaceAll("_"," ")}</strong><span>{localDate(item.startsOn)}–{localDate(item.endsOn)} · {item.status.replaceAll("_"," ")}</span>{item.officeNotes&&<small>{t("admin.office")}: {item.officeNotes}</small>}</div>) : <p>{t("admin.noRequests")}</p>}</article><article><h2>{t("admin.recentChecks")}</h2>{summary.checks.slice(0, 6).map(item => <div className="field-admin-row" key={item.id}><strong>{item.registration}</strong><span>{item.status.replaceAll("_", " ")} · {formatDate(item.completedAt)}</span></div>)}</article></div></section>;
}
