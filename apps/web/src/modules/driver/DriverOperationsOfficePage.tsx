import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { api } from "../../lib/api";

type CheckItem = { id: string; status: string; note?: string; severity?: string };
type CheckRecord = {
  id: string; status: string; nilDefect: boolean; roadworthyConfirmed: boolean; odometer: number | null;
  location: string | null; items: CheckItem[]; signatureName: string; completedAt: string; durationSeconds: number;
  registration: string; trailerRegistration: string | null; firstName: string; lastName: string;
};
type Breakdown = {
  id: string; severity: string; status: string; location: string; description: string; canMove: boolean;
  occupantsSafe: boolean; contactNumber: string | null; reportedAt: string; resolutionNotes: string | null;
  registration: string; firstName: string; lastName: string;
};
type OfficeData = { checks: CheckRecord[]; breakdowns: Breakdown[]; canManage: boolean };

const statusLabel = (value: string) => value.replaceAll("_", " ");

export function DriverOperationsOfficePage() {
  const [data, setData] = useState<OfficeData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try { setData(await api<OfficeData>("/driver-operations/office")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load checks and breakdowns."); }
  }

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    openBreakdowns: data?.breakdowns.filter(item => !["RESOLVED", "CANCELLED"].includes(item.status)).length ?? 0,
    unsafeChecks: data?.checks.filter(item => item.status === "UNSAFE").length ?? 0,
    defectChecks: data?.checks.filter(item => item.status === "DEFECTS_REPORTED").length ?? 0,
  }), [data]);

  async function updateBreakdown(id: string, body: object) {
    setBusy(true); setError("");
    try { await api(`/driver-operations/breakdowns/${id}`, { method: "PATCH", body: JSON.stringify(body) }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the breakdown."); }
    finally { setBusy(false); }
  }

  if (!data) return <main className="loading-page"><div><RefreshCw className="spin"/><h1>Loading checks & breakdowns</h1>{error && <p role="alert">{error}</p>}</div></main>;

  return <section className="page driver-page">
    <div className="page-heading">
      <div><p className="eyebrow">Office control</p><h1>Checks & Breakdowns</h1><p className="subtle">Driver reports arrive here. Clean checks stay recorded; defects and breakdowns rise to the top.</p></div>
      <button className="secondary-button" onClick={() => void load()}><RefreshCw size={17}/> Refresh</button>
    </div>
    {error && <p role="alert" className="form-message error">{error}</p>}

    <div className="driver-metrics">
      <article className="panel"><span>Open breakdowns</span><strong>{summary.openBreakdowns}</strong></article>
      <article className="panel"><span>Unsafe checks</span><strong>{summary.unsafeChecks}</strong></article>
      <article className="panel"><span>Checks with defects</span><strong>{summary.defectChecks}</strong></article>
    </div>

    <section className="panel driver-form-card">
      <div className="panel-heading"><div><h2><ShieldAlert size={19}/> Breakdown response</h2><p>Newest unresolved reports first.</p></div></div>
      {data.breakdowns.length ? <div className="office-record-list">{data.breakdowns.map(item => <article key={item.id} className={["UNSAFE", "IMMOBILE"].includes(item.severity) && !["RESOLVED", "CANCELLED"].includes(item.status) ? "unsafe" : ""}>
        <div><strong>{item.registration} · {item.firstName} {item.lastName}</strong><span>{statusLabel(item.severity)} · {new Date(item.reportedAt).toLocaleString("en-GB")}</span><p>{item.location} · {item.description}</p><small>{item.occupantsSafe ? "Occupants safe" : "Occupant safety needs confirmation"} · {item.canMove ? "Driver says vehicle can move" : "Vehicle cannot move"}{item.contactNumber ? ` · ${item.contactNumber}` : ""}</small></div>
        <div className="office-actions"><span className={`driver-status ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>
          {item.status === "REPORTED" && <button disabled={busy} onClick={() => void updateBreakdown(item.id, { status: "ACKNOWLEDGED" })}>Acknowledge</button>}
          {["REPORTED", "ACKNOWLEDGED"].includes(item.status) && <button disabled={busy} onClick={() => void updateBreakdown(item.id, { status: "RECOVERY_ARRANGED" })}>Recovery arranged</button>}
          {!["RESOLVED", "CANCELLED"].includes(item.status) && <button className="primary-button" disabled={busy} onClick={() => { const notes = window.prompt("Resolution notes"); if (notes !== null) void updateBreakdown(item.id, { status: "RESOLVED", resolutionNotes: notes }); }}>Resolve</button>}
        </div>
      </article>)}</div> : <p className="subtle">No breakdown reports.</p>}
    </section>

    <section className="panel driver-form-card">
      <div className="panel-heading"><div><h2><ClipboardCheck size={19}/> Driver checks</h2><p>Every submitted walkaround is retained here for the office.</p></div></div>
      {data.checks.length ? <div className="office-record-list">{data.checks.map(item => { const defects = item.items.filter(answer => answer.status === "DEFECT"); return <details key={item.id} className={item.status === "UNSAFE" ? "unsafe" : ""}>
        <summary><div><strong>{item.registration}{item.trailerRegistration ? ` + ${item.trailerRegistration}` : ""}</strong><span>{item.firstName} {item.lastName} · {new Date(item.completedAt).toLocaleString("en-GB")}</span></div><span className={`driver-status ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></summary>
        <div className="record-detail"><p>Signed by <strong>{item.signatureName}</strong> · {Math.max(1, Math.round(item.durationSeconds / 60))} minutes · odometer {item.odometer ?? "not entered"} · {item.location || "location not entered"}</p>{item.nilDefect ? <p><CheckCircle2 size={16}/> Nil-defect declaration recorded.</p> : <div><strong>{defects.length} defect{defects.length === 1 ? "" : "s"} reported</strong>{defects.map(defect => <p key={defect.id}><AlertTriangle size={15}/> {defect.id.replaceAll("-", " ")}: {defect.note} ({statusLabel(defect.severity ?? "assessment required")})</p>)}</div>}</div>
      </details>; })}</div> : <p className="subtle">No driver checks recorded yet.</p>}
    </section>
  </section>;
}
