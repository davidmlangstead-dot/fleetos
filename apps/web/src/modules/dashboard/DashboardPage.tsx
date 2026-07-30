import { AlertTriangle, ArrowRight, CircleAlert, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

type Summary = { vehicles: number; activeJobs: number; overdueCompliance: number; openDefects: number };
type Job = { id: string; reference: string; collectionAddress: string; deliveryAddress: string; scheduledAt: string; status: string; driver: { firstName: string; lastName: string } | null };

export function DashboardPage() {
  const summary = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Summary>("/dashboard") });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api<Job[]>("/jobs") });
  const data = summary.data;
  const metrics = [
    { label: "Vehicles on road", value: data?.vehicles ?? "-", note: "Active vehicle records", icon: Truck, tone: "blue" },
    { label: "Live jobs", value: data?.activeJobs ?? "-", note: "Planned, assigned or moving", icon: ArrowRight, tone: "violet" },
    { label: "Open defects", value: data?.openDefects ?? "-", note: "Need workshop attention", icon: CircleAlert, tone: "orange" },
    { label: "Compliance overdue", value: data?.overdueCompliance ?? "-", note: "Requires attention", icon: AlertTriangle, tone: "red" },
  ];
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">Fleet operations</p><h1>Your live dashboard</h1><p className="subtle">Only your company’s real data appears here.</p></div><button className="primary-button">+ Create job</button></div><div className="metric-grid">{metrics.map(({ label, value, note, icon: Icon, tone }) => <article className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon size={21}/></div><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>)}</div><div className="dashboard-grid"><section className="panel jobs-panel"><div className="panel-heading"><div><h2>Upcoming jobs</h2><p>Work assigned to your company.</p></div></div><div className="job-list">{jobs.isLoading && <p className="empty-line">Loading your jobs…</p>}{jobs.data?.length === 0 && <p className="empty-line">No jobs yet. Create your first job when you are ready.</p>}{jobs.data?.slice(0, 5).map(job => <div className="job-row" key={job.id}><time>{new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><div><strong>{job.reference}</strong><p>{job.collectionAddress} to {job.deliveryAddress}</p></div><div className="job-driver">{job.driver ? `${job.driver.firstName} ${job.driver.lastName}` : "Unassigned"}</div><span className="status success">{job.status}</span></div>)}</div></section><section className="panel attention-panel"><div className="panel-heading"><div><h2>Start with real records</h2><p>Your workspace is private and ready.</p></div></div><div className="attention-item"><span className="attention-icon good"><Truck size={18}/></span><div><strong>Add your first vehicle</strong><p>Build your live fleet register.</p></div><ArrowRight size={17}/></div><div className="attention-item"><span className="attention-icon warning"><CircleAlert size={18}/></span><div><strong>Set compliance dates</strong><p>Get reminders before expiry.</p></div><ArrowRight size={17}/></div></section></div></section>;
}
