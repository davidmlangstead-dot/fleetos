import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, ClipboardCheck, MessageSquare, ShieldAlert, Truck, Users, Wrench } from "lucide-react";
import { api } from "../../lib/api";

type Job = { id: string; reference: string | null; collectionAddress: string | null; deliveryAddress: string | null; scheduledAt: string; status: string; driver: { firstName: string; lastName: string } | null };
type Attention = { critical: number; dueSoon: number; vehicleDates: { overdue: number; dueSoon: number }; driverDates: { overdue: number; dueSoon: number }; tachograph: { overdue: number; dueSoon: number } };
type Commercial = { vehicleLimit: number; vehicleUsage: number };
type Dashboard = { vehicles: number; activeJobs: number; overdueCompliance: number; openDefects: number; jobs: Job[]; attention: Attention; commercial: Commercial | null };
type AlertItem = { id: string; severity: "INFO" | "WARNING" | "CRITICAL"; title: string; detail: string | null; href: string };
type AlertFeed = { total: number; critical: number; items: AlertItem[] };
type CheckRecord = { id: string; status: string; completedAt: string; registration: string; firstName: string; lastName: string };
type Breakdown = { id: string; severity: string; status: string; registration: string; firstName: string; lastName: string; location: string; reportedAt: string };
type DriverOps = { checks: CheckRecord[]; breakdowns: Breakdown[] };

const emptyAttention: Attention = { critical: 0, dueSoon: 0, vehicleDates: { overdue: 0, dueSoon: 0 }, driverDates: { overdue: 0, dueSoon: 0 }, tachograph: { overdue: 0, dueSoon: 0 } };

export function DashboardPageClean() {
  const [data, setData] = useState<Dashboard>({ vehicles: 0, activeJobs: 0, overdueCompliance: 0, openDefects: 0, jobs: [], attention: emptyAttention, commercial: null });
  const [alerts, setAlerts] = useState<AlertFeed>({ total: 0, critical: 0, items: [] });
  const [driverOps, setDriverOps] = useState<DriverOps>({ checks: [], breakdowns: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [dashboard, alertFeed, ops] = await Promise.all([
        api<Dashboard>("/dashboard"),
        api<AlertFeed>("/notifications").catch(() => ({ total: 0, critical: 0, items: [] })),
        api<DriverOps>("/driver-operations/office").catch(() => ({ checks: [], breakdowns: [] })),
      ]);
      setData(dashboard); setAlerts(alertFeed); setDriverOps(ops);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Today could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const openBreakdowns = useMemo(() => driverOps.breakdowns.filter(item => !["RESOLVED", "CANCELLED"].includes(item.status)), [driverOps.breakdowns]);
  const problemChecks = useMemo(() => driverOps.checks.filter(item => item.status !== "ROADWORTHY").slice(0, 5), [driverOps.checks]);
  const todayJobs = useMemo(() => data.jobs.filter(job => new Date(job.scheduledAt).toDateString() === new Date().toDateString()).slice(0, 8), [data.jobs]);

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Today</p><h1>What needs attention</h1><p className="subtle">Only the things that need action. Everything else stays in its module.</p></div></div>
    {error && <p role="alert" className="form-message error">{error}</p>}

    <div className="metric-grid">
      <Link to="/jobs" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}><div className="metric-icon violet"><BriefcaseBusiness size={21}/></div><div><p>Live jobs</p><strong>{data.activeJobs}</strong><small>{todayJobs.length} scheduled today</small></div></Link>
      <Link to="/driver-operations" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}><div className="metric-icon red"><ShieldAlert size={21}/></div><div><p>Open breakdowns</p><strong>{openBreakdowns.length}</strong><small>Driver reports needing response</small></div></Link>
      <Link to="/workshop" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}><div className="metric-icon orange"><Wrench size={21}/></div><div><p>Open defects</p><strong>{data.openDefects}</strong><small>Workshop attention</small></div></Link>
      <Link to="/compliance" className="metric-card" style={{ textDecoration: "none", color: "inherit" }}><div className="metric-icon red"><AlertTriangle size={21}/></div><div><p>Compliance overdue</p><strong>{data.overdueCompliance}</strong><small>{data.attention.dueSoon} due soon</small></div></Link>
    </div>

    <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-heading"><div><h2>Action now</h2><p>Critical and warning items from across the business.</p></div></div>
      {alerts.items.length ? <div className="office-record-list">{alerts.items.slice(0, 8).map(item => <Link key={item.id} to={item.href} style={{ textDecoration: "none", color: "inherit" }}><article className={item.severity === "CRITICAL" ? "unsafe" : ""}><div><strong>{item.title}</strong>{item.detail && <p>{item.detail}</p>}</div><span className={`driver-status ${item.severity.toLowerCase()}`}>{item.severity}</span></article></Link>)}</div> : <p className="subtle">No urgent alerts right now.</p>}
    </section>

    {(openBreakdowns.length > 0 || problemChecks.length > 0) && <section className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-heading"><div><h2>From drivers</h2><p>Checks and breakdowns arrive here automatically.</p></div><Link className="text-button" to="/driver-operations">Open checks & breakdowns</Link></div>
      <div className="office-record-list">
        {openBreakdowns.slice(0, 4).map(item => <Link key={item.id} to="/driver-operations" style={{ textDecoration: "none", color: "inherit" }}><article className={["UNSAFE", "IMMOBILE"].includes(item.severity) ? "unsafe" : ""}><div><strong>{item.registration} · breakdown</strong><p>{item.firstName} {item.lastName} · {item.location}</p></div><span className={`driver-status ${item.status.toLowerCase()}`}>{item.status.replaceAll("_", " ")}</span></article></Link>)}
        {problemChecks.map(item => <Link key={item.id} to="/driver-operations" style={{ textDecoration: "none", color: "inherit" }}><article className={item.status === "UNSAFE" ? "unsafe" : ""}><div><strong>{item.registration} · driver check</strong><p>{item.firstName} {item.lastName} · {new Date(item.completedAt).toLocaleString("en-GB")}</p></div><span className={`driver-status ${item.status.toLowerCase()}`}>{item.status.replaceAll("_", " ")}</span></article></Link>)}
      </div>
    </section>}

    <div className="dashboard-grid">
      <section className="panel jobs-panel"><div className="panel-heading"><div><h2>Today’s jobs</h2><p>What the team is doing today.</p></div><Link className="text-button" to="/jobs">Open jobs</Link></div><div className="job-list">{loading && <p className="empty-line">Loading…</p>}{!loading && !todayJobs.length && <p className="empty-line">No jobs scheduled today.</p>}{todayJobs.map(job => <div className="job-row" key={job.id}><time>{new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><div><strong>{job.reference || "Job"}</strong><p>{job.collectionAddress || job.deliveryAddress || "Site not set"}</p></div><div className="job-driver">{job.driver ? `${job.driver.firstName} ${job.driver.lastName}` : "Unassigned"}</div><span className="status success">{job.status.replaceAll("_", " ")}</span></div>)}</div></section>
      <section className="panel attention-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Common office actions only.</p></div></div>
        <Link to="/jobs" className="attention-item" style={{ textDecoration: "none" }}><span className="attention-icon good"><BriefcaseBusiness size={18}/></span><div><strong>Create or assign job</strong><p>Plan work and send it to staff.</p></div><ArrowRight size={17}/></Link>
        <Link to="/personal" className="attention-item" style={{ textDecoration: "none" }}><span className="attention-icon good"><Users size={18}/></span><div><strong>Staff</strong><p>People, training, leave and sickness.</p></div><ArrowRight size={17}/></Link>
        <Link to="/vehicles" className="attention-item" style={{ textDecoration: "none" }}><span className="attention-icon good"><Truck size={18}/></span><div><strong>Vehicles</strong><p>Fleet records and dates.</p></div><ArrowRight size={17}/></Link>
        <Link to="/messages" className="attention-item" style={{ textDecoration: "none" }}><span className="attention-icon good"><MessageSquare size={18}/></span><div><strong>Messages</strong><p>Talk to the team.</p></div><ArrowRight size={17}/></Link>
        <Link to="/driver-operations" className="attention-item" style={{ textDecoration: "none" }}><span className="attention-icon good"><ClipboardCheck size={18}/></span><div><strong>Checks & breakdowns</strong><p>See driver submissions.</p></div><ArrowRight size={17}/></Link>
      </section>
    </div>
  </section>;
}
