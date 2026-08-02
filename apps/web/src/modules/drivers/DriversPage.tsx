import { useEffect, useState } from "react";
import { Search, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  licence_number?: string;
  phone?: string;
  email?: string;
  status: string;
}

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    const companyId = sessionData.session?.user.id;
    if (!companyId) return;
    const { data } = await supabase.from("drivers").select("*").eq("company_id", companyId).order("last_name");
    setDrivers(data ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function addDriver(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const companyId = sessionData.session?.user.id;
    if (!companyId) return;
    await supabase.from("drivers").insert({
      company_id: companyId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      status: "ACTIVE",
    });
    setFirstName(""); setLastName(""); setShowForm(false);
    setBusy(false);
    void load();
  }

  async function remove(id: string) {
    await supabase.from("drivers").delete().eq("id", id);
    void load();
  }

  const filtered = drivers.filter(d =>
    `${d.first_name} ${d.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Drivers</h1>
          <p className="subtle">Manage your driver records.</p>
        </div>
        <button className="primary-button" onClick={() => setShowForm(true)}><Plus size={18} /> Add driver</button>
      </div>

      {showForm && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-heading"><h2>Add driver</h2></div>
          <form onSubmit={addDriver} style={{ display: "grid", gap: 12, padding: 16 }}>
            <label>First name<input required value={firstName} onChange={e => setFirstName(e.target.value)} /></label>
            <label>Last name<input required value={lastName} onChange={e => setLastName(e.target.value)} /></label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary-button" disabled={busy} type="submit">{busy ? "Saving…" : "Save driver"}</button>
              <button type="button" className="switch-mode" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="search" style={{ padding: 16 }}>
          <Search size={19} />
          <input placeholder="Search drivers…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>No drivers yet</h2>
            <p>Add your first driver to the team.</p>
            <button className="primary-button" onClick={() => setShowForm(true)}><Plus size={18} /> Add driver</button>
          </div>
        ) : (
          <div className="job-list">
            {filtered.map(d => (
              <div className="job-row" key={d.id} style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{d.first_name} {d.last_name}</strong>
                  <p>{d.licence_number || "No licence on file"}{d.phone ? ` · ${d.phone}` : ""}</p>
                </div>
                <button className="icon-button" onClick={() => remove(d.id)} title="Delete"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}