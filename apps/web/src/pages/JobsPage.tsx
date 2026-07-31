import { useEffect, useState } from "react";
import { Search, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface JobRow {
  id: string;
  reference: string;
  customer_name: string;
  collection_address: string;
  delivery_address: string;
  status: string;
  collection_date_time: string;
}

export function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const companyId = sessionData.session?.user.id;
      if (!companyId) return;
      const { data } = await supabase.from("jobs").select("*").eq("company_id", companyId).order("collection_date_time", { ascending: false }).limit(50);
      setJobs(data ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = jobs.filter(j =>
    j.reference?.toLowerCase().includes(search.toLowerCase()) ||
    j.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Jobs</h1>
          <p className="subtle">Track collections and deliveries.</p>
        </div>
        <button className="primary-button"><Plus size={18} /> Create job</button>
      </div>
      <section className="panel">
        <div className="search" style={{ padding: 16 }}>
          <Search size={19} />
          <input placeholder="Search jobs…" value={search} onChange={e => setSearch(e.target.value)} />
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
            {filtered.map(job => (
              <div className="job-row" key={job.id}>
                <div>
                  <strong>{job.reference || "—"}</strong>
                  <p>{job.customer_name} · {job.collection_address} → {job.delivery_address}</p>
                </div>
                <span className={`status ${job.status === "COMPLETED" ? "success" : "warning"}`}>{job.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}