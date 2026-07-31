import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CircleAlert, Truck } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface Summary { vehicles: number; activeJobs: number; overdueCompliance: number; openDefects: number }
interface Job { id: string; reference: string; collectionAddress: string; deliveryAddress: string; scheduledAt: string; status: string; driver: { firstName: string; lastName: string } | null }

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary>({ vehicles: 0, activeJobs: 0, overdueCompliance: 0, openDefects: 0 });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const companyId = sessionData.session?.user.id;
      if (!companyId) return;

      const [{ count: vCount }, { count: jCount }, { data: jobRows }] = await Promise.all([
        supabase.from("vehicles").select("*", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "ACTIVE"),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("company_id", companyId).in("status", ["PLANNED", "ASSIGNED", "IN_PROGRESS"]),
        supabase.from("jobs").select("*").eq("company_id", companyId).order("collection_date_time", { ascending: true }).limit(5),
      ]);

      setSummary({
        vehicles: vCount ?? 0,
        activeJobs: jCount ?? 0,
        overdueCompliance: 0,
        openDefects: 0,
      });

      const mappedJobs: Job[] = (jobRows ?? []).map((j: any) => ({
        id: j.id,
        reference: j.reference ?? j.job_number ?? "—",
        collectionAddress: j.collection_address ?? "—",
        deliveryAddress: j.delivery_address ?? "—",
        scheduledAt: j.collection_date_time ?? j.created_at,
        status: j.status ?? "PLANNED",
        driver: null,
      }));

      setJobs(mappedJobs);
      setLoading(false);
    }
    void load();
  }, []);

  const metrics = [
    { label: "Vehicles on road", value: summary.vehicles, note: "Active vehicle records", icon: Truck, tone: "blue" },
    { label: "Live jobs", value: summary.activeJobs, note: "Planned, assigned or moving", icon: ArrowRight, tone: "violet" },
    { label: "Open defects", value: summary.openDefects, note: "Need workshop attention", icon: CircleAlert, tone: "orange" },
    { label: "Compliance overdue", value: summary.overdueCompliance, note: "Requires attention", icon: AlertTriangle, tone: "red" },
  ];

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Your live dashboard</h1>
          <p className="subtle">Only your company’s real data appears here.</p>
        </div>
        <button className="primary-button">+ Create job</button>
      </div>
      <div className="metric-grid">
        {metrics.map(({ label, value, note, icon: Icon, tone }) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon ${tone}`}><Icon size={21} /></div>
            <div><p>{label}</p><strong>{value}</strong><small>{note}</small></div>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel jobs-panel">
          <div className="panel-heading">
            <div><h2>Upcoming jobs</h2><p>Work assigned to your company.</p></div>
          </div>
          <div className="job-list">
            {loading && <p className="empty-line">Loading your jobs…</p>}
            {!loading && jobs.length === 0 && <p className="empty-line">No jobs yet. Create your first job when you are ready.</p>}
            {jobs.map(job => (
              <div className="job-row" key={job.id}>
                <time>{new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                <div><strong>{job.reference}</strong><p>{job.collectionAddress} to {job.deliveryAddress}</p></div>
                <div className="job-driver">{job.driver ? `${job.driver.firstName} ${job.driver.lastName}` : "Unassigned"}</div>
                <span className="status success">{job.status}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div><h2>Start with real records</h2><p>Your workspace is private and ready.</p></div>
          </div>
          <div className="attention-item">
            <span className="attention-icon good"><Truck size={18} /></span>
            <div><strong>Add your first vehicle</strong><p>Build your live fleet register.</p></div>
            <ArrowRight size={17} />
          </div>
          <div className="attention-item">
            <span className="attention-icon warning"><CircleAlert size={18} /></span>
            <div><strong>Set compliance dates</strong><p>Get reminders before expiry.</p></div>
            <ArrowRight size={17} />
          </div>
        </section>
      </div>
    </section>
  );
}