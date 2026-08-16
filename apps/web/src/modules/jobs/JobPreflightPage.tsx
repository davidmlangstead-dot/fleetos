import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck, Truck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

type JobRow = {
  id: string;
  reference: string;
  title: string;
  customerName: string;
  status: string;
  scheduledStart: string | null;
  registration: string | null;
  assignments: Array<{ id: string; name: string }>;
};

type CheckStatus = "PASS" | "WARN" | "BLOCK" | "INFO";
type PreflightCheck = { id: string; area: string; status: CheckStatus; title: string; detail: string; href?: string };
type Preflight = {
  generatedAt: string;
  decision: "READY" | "REVIEW" | "BLOCKED";
  summary: { blockers: number; warnings: number; passed: number; information: number };
  job: {
    id: string;
    reference: string | null;
    title: string | null;
    status: string;
    jobTypeName: string | null;
    trade: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    registration: string | null;
    driver: string | null;
    assignedPeople: Array<{ id: string; name: string }>;
  };
  checks: PreflightCheck[];
  note: string;
};

const activeStatuses = new Set(["DRAFT", "PLANNED", "ASSIGNED", "SCHEDULED", "DISPATCHED"]);
const label = (value: string) => value.replaceAll("_", " ");
const when = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Unscheduled";

function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === "PASS") return <CheckCircle2 size={20} aria-hidden="true" />;
  if (status === "BLOCK") return <CircleAlert size={20} aria-hidden="true" />;
  if (status === "WARN") return <AlertTriangle size={20} aria-hidden="true" />;
  return <ShieldCheck size={20} aria-hidden="true" />;
}

function CheckGroup({ title, checks }: { title: string; checks: PreflightCheck[] }) {
  if (!checks.length) return null;
  return <section className="panel" style={{ overflow: "hidden" }}><div className="panel-heading" style={{ padding: 18 }}><h2>{title}</h2><strong>{checks.length}</strong></div>{checks.map((check, index) => <div key={check.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 12, padding: 15, alignItems: "start", borderTop: index ? "1px solid rgba(148,163,184,.2)" : "none" }}><CheckIcon status={check.status}/><div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><strong>{check.title}</strong><span className="subtle"><strong>{check.status}</strong></span></div><p className="subtle" style={{ margin: "5px 0 0" }}>{check.detail}</p></div>{check.href && <Link className="secondary-button" to={check.href} style={{ textDecoration: "none" }}>Open</Link>}</div>)}</section>;
}

export function JobPreflightPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [result, setResult] = useState<Preflight | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<JobRow[]>("/jobs").then((rows) => {
      setJobs(rows);
      const first = rows.find((job) => activeStatuses.has(job.status));
      if (first) setSelectedId(first.id);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load jobs")).finally(() => setLoading(false));
  }, []);

  const selected = useMemo(() => jobs.find((job) => job.id === selectedId) ?? null, [jobs, selectedId]);

  async function check() {
    if (!selectedId) return;
    setChecking(true); setError("");
    try { setResult(await api<Preflight>(`/eligibility/job/${selectedId}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not run dispatch preflight"); setResult(null); }
    finally { setChecking(false); }
  }

  const blockers = result?.checks.filter((item) => item.status === "BLOCK") ?? [];
  const warnings = result?.checks.filter((item) => item.status === "WARN") ?? [];
  const passes = result?.checks.filter((item) => item.status === "PASS") ?? [];
  const info = result?.checks.filter((item) => item.status === "INFO") ?? [];

  return <section className="page">
    <div className="page-heading"><div><Link to="/jobs" className="subtle" style={{ display: "inline-flex", gap: 6, alignItems: "center", textDecoration: "none", marginBottom: 8 }}><ArrowLeft size={16}/> Back to jobs</Link><p className="eyebrow">Dispatch preflight</p><h1>Can this driver and vehicle do this job?</h1><p className="subtle">Check the records FleetOS already holds before the office dispatches work.</p></div></div>

    {error && <p role="alert" className="form-message error">{error}</p>}

    <section className="panel" style={{ padding: 18, marginBottom: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "end" }}>
        <label>Job<select value={selectedId} disabled={loading || checking} onChange={(event) => { setSelectedId(event.target.value); setResult(null); }}><option value="">Choose a job</option>{jobs.filter((job) => activeStatuses.has(job.status)).map((job) => <option key={job.id} value={job.id}>{job.reference} · {job.title} · {job.customerName}</option>)}</select></label>
        <button className="primary-button" disabled={!selectedId || checking} onClick={() => void check()}><RefreshCw size={17}/> {checking ? "Checking…" : "Run preflight"}</button>
      </div>
      {selected && <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14 }}><span><CalendarClock size={15} style={{ verticalAlign: "middle" }}/> {when(selected.scheduledStart)}</span><span><Truck size={15} style={{ verticalAlign: "middle" }}/> {selected.registration || "No vehicle"}</span><span><UserRound size={15} style={{ verticalAlign: "middle" }}/> {selected.assignments.map((person) => person.name).join(", ") || "No team"}</span></div>}
    </section>

    {result && <>
      <section className="panel" style={{ padding: 18, marginBottom: 18 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "center" }}><div><p className="eyebrow">Preflight result</p><h2 style={{ margin: "4px 0" }}>{result.decision === "READY" ? "Ready on recorded checks" : result.decision === "REVIEW" ? "Review before dispatch" : "Blocked on recorded checks"}</h2><p className="subtle" style={{ marginBottom: 0 }}>{result.job.reference || "Job"} · {result.job.registration || "No vehicle"} · {result.job.driver || "No linked driver"}</p></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><span><strong>{result.summary.blockers}</strong> blockers</span><span><strong>{result.summary.warnings}</strong> warnings</span><span><strong>{result.summary.passed}</strong> passed</span></div></div><p style={{ marginBottom: 0, marginTop: 14 }}>{result.note}</p></section>
      <div style={{ display: "grid", gap: 18 }}><CheckGroup title="Blockers" checks={blockers}/><CheckGroup title="Review" checks={warnings}/><CheckGroup title="Passed checks" checks={passes}/><CheckGroup title="Information" checks={info}/></div>
      <p className="subtle" style={{ marginTop: 16 }}>Checked {new Date(result.generatedAt).toLocaleString("en-GB")}.</p>
    </>}
  </section>;
}
