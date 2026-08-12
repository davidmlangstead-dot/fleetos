import { useEffect, useState } from "react";
import { Search, Plus } from "lucide-react";
import { api } from "../../lib/api";

type JobRow = {
  id: string;
  reference?: string | null;
  jobNumber?: string | null;
  customerName?: string | null;
  collectionAddress?: string | null;
  deliveryAddress?: string | null;
  status: string;
  scheduledAt?: string | null;
};

export function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setJobs(await api<JobRow[]>("/jobs"));
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load jobs");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const filtered = jobs.filter((job) => {
    const reference = job.reference ?? job.jobNumber ?? "";
    return reference.toLowerCase().includes(search.toLowerCase()) || (job.customerName ?? "").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Jobs</h1>
          <p className="subtle">Track collections and deliveries in the active company workspace.</p>
        </div>
        <button className="primary-button"><Plus size={18} /> Create job</button>
      </div>
      {error && <div className="panel" style={{ padding: 14, marginBottom: 16, color: "#991b1b" }}>{error}</div>}
      <section className="panel">
        <div className="search" style={{ padding: 16 }}>
          <Search size={19} />
          <input placeholder="Search jobs…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading && <p className="empty-line" style={{ padding: 24 }}>Loading jobs…</p>}
        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <h2>No jobs yet</h2>
            <p>Create your first delivery or collection job.</p>
            <button className="primary-button"><Plus size={18} /> Create job</button>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="job-list">
            {filtered.map((job) => (
              <div className="job-row" key={job.id}>
                <div>
                  <strong>{job.reference ?? job.jobNumber ?? "—"}</strong>
                  <p>{job.customerName || "No customer"} · {job.collectionAddress || "Collection not set"} → {job.deliveryAddress || "Delivery not set"}</p>
                </div>
                <span className={`status ${job.status === "DELIVERED" ? "success" : "warning"}`}>{job.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
