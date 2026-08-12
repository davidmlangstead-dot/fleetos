import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CircleAlert, Truck } from "lucide-react";
import { api } from "../../lib/api";

type Job = { id: string; reference: string; collectionAddress: string; deliveryAddress: string; scheduledAt: string; status: string; driver: { firstName: string; lastName: string } | null };
type Dashboard = { vehicles: number; activeJobs: number; overdueCompliance: number; openDefects: number; jobs: Job[] };

export function DashboardPageClean() {
  const [data, setData] = useState<Dashboard>({ vehicles: 0, activeJobs: 0, overdueCompliance: 0, openDefects: 0, jobs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Dashboard>("/dashboard").then(setData).catch((err: unknown) => setError(err instanceof Error ? err.message : "Unable to load dashboard")).finally(() => setLoading(false));
  }, []);

  const metrics = [
    ["Vehicles on road", data.vehicles, "Active vehicle records", Truck, "blue", "/vehicles"],
    ["Live jobs", data.activeJobs, "Planned, assigned or moving", ArrowRight, "violet", "/jobs"],
    ["Open defects", data.openDefects, "Need workshop attention", CircleAlert, "orange", "/workshop"],
    ["Compliance overdue", data.overdueCompliance, "Requires attention", AlertTriangle, "red", "/compliance"],
  ] as const;

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Fleet operations</p><h1>Your dashboard</h1><p className="subtle">Only your company’s recorded data appears here.</p></div></div>
    {error && <p role="alert" className="form-message error">{error}</p>}
    <div className="metric-grid">{metrics.map(([label, value, note, Icon, tone, to]) => <Link to={to} key={label} className="metric-card" style={{ textDecoration: "none", color: "inherit" }}><div className={`metric-icon ${tone}`}><Icon size={21} /></div><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></Link>)}</div>
    <div className="dashboard-grid">
      <section className="panel jobs-panel"><div className="panel-heading"><div><h2>Upcoming jobs</h2><p>Work assigned to your company.</p></div><Link className="text-button" to="/jobs">View jobs</Link></div><div className="job-list">{loading && <p className="empty-line">Loading your jobs…</p>}{!loading && data.jobs.length === 0 && <p className="empty-line">No jobs recorded yet.</p>}{data.jobs.map(job => <div className="job-row" key={job.id}><time>{new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><div><strong>{job.reference}</strong><p>{job.collectionAddress} to {job.deliveryAddress}</p></div><div className="job-driver">{job.driver ? `${job.driver.firstName} ${job.driver.lastName}` : "Unassigned"}</div><span className="status success">{job.status}</span></div>)}</div></section>
      <section className="panel attention-panel"><div className="panel-heading"><div><h2>Build your records</h2><p>Start with the information you actually have.</p></div></div><Link to="/vehicles" className="attention-item" style={{ textDecoration: "none" }}><span className="attention-icon good"><Truck size={18} /></span><div><strong>Add your first vehicle</strong><p>Build your live fleet register.</p></div><ArrowRight size={17} /></Link><Link to="/compliance" className="attention-item" style={{ textDecoration: "none" }}><span className="attention-icon warning"><CircleAlert size={18} /></span><div><strong>Record compliance information</strong><p>Only recorded evidence will be shown.</p></div><ArrowRight size={17} /></Link></section>
    </div>
  </section>;
}
