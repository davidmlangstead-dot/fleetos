import { useEffect, useState } from "react";
import { Search, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";

interface Driver { id: string; firstName: string; lastName: string; licenceNumber?: string | null; phone?: string | null; email?: string | null; isActive: boolean; }

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]); const [search, setSearch] = useState(""); const [showForm, setShowForm] = useState(false); const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function load() { try { setError(null); setDrivers(await api<Driver[]>("/drivers")); } catch (err) { setError(err instanceof Error ? err.message : "Unable to load drivers"); } }
  useEffect(() => { void load(); }, []);
  async function addDriver(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(null); try { await api("/drivers", { method: "POST", body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }) }); setFirstName(""); setLastName(""); setShowForm(false); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to save driver"); } finally { setBusy(false); } }
  async function remove(id: string) { try { await api(`/drivers/${id}`, { method: "DELETE" }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to delete driver"); } }
  const filtered = drivers.filter(d => `${d.firstName} ${d.lastName}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">Fleet operations</p><h1>Drivers</h1><p className="subtle">Manage your driver records.</p></div><button className="primary-button" onClick={() => setShowForm(true)}><Plus size={18} /> Add driver</button></div>
    {error && <p role="alert" className="subtle">{error}</p>}
    {showForm && <section className="panel" style={{ marginBottom: 24 }}><div className="panel-heading"><h2>Add driver</h2></div><form onSubmit={addDriver} style={{ display: "grid", gap: 12, padding: 16 }}><label>First name<input required value={firstName} onChange={e => setFirstName(e.target.value)} /></label><label>Last name<input required value={lastName} onChange={e => setLastName(e.target.value)} /></label><div style={{ display: "flex", gap: 8 }}><button className="primary-button" disabled={busy} type="submit">{busy ? "Saving…" : "Save driver"}</button><button type="button" className="switch-mode" onClick={() => setShowForm(false)}>Cancel</button></div></form></section>}
    <section className="panel"><div className="search" style={{ padding: 16 }}><Search size={19} /><input placeholder="Search drivers…" value={search} onChange={e => setSearch(e.target.value)} /></div>{filtered.length === 0 ? <div className="empty-state"><h2>No drivers yet</h2><p>Add your first driver to the team.</p><button className="primary-button" onClick={() => setShowForm(true)}><Plus size={18} /> Add driver</button></div> : <div className="job-list">{filtered.map(d => <div className="job-row" key={d.id} style={{ justifyContent: "space-between" }}><div><strong>{d.firstName} {d.lastName}</strong><p>{d.licenceNumber || "No licence on file"}{d.phone ? ` · ${d.phone}` : ""}</p></div><button className="icon-button" onClick={() => remove(d.id)} title="Delete"><Trash2 size={16} /></button></div>)}</div>}</section></section>;
}
