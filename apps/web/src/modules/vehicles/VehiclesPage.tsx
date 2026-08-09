import { useEffect, useState } from "react";
import { Search, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";

interface Vehicle {
  id: string;
  registration: string;
  fleetNumber?: string | null;
  vin?: string | null;
  type: string;
  status: string;
}

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [reg, setReg] = useState("");
  const [fleet, setFleet] = useState("");
  const [type, setType] = useState("TRUCK");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setVehicles(await api<Vehicle[]>("/vehicles"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load vehicles");
    }
  }

  useEffect(() => { void load(); }, []);

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Vehicle>("/vehicles", {
        method: "POST",
        body: JSON.stringify({
          registration: reg.trim().toUpperCase(),
          fleetNumber: fleet.trim() || undefined,
          type,
        }),
      });
      setReg(""); setFleet(""); setType("TRUCK"); setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save vehicle");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/vehicles/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete vehicle");
    }
  }

  const filtered = vehicles.filter(v => v.registration.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Fleet operations</p><h1>Vehicles</h1><p className="subtle">Manage your fleet register.</p></div>
        <button className="primary-button" onClick={() => setShowForm(true)}><Plus size={18} /> Add vehicle</button>
      </div>
      {error && <p role="alert" className="subtle">{error}</p>}
      {showForm && <section className="panel" style={{ marginBottom: 24 }}><div className="panel-heading"><h2>Add vehicle</h2></div><form onSubmit={addVehicle} style={{ display: "grid", gap: 12, padding: 16 }}>
        <label>Registration<input required value={reg} onChange={e => setReg(e.target.value)} placeholder="AB12 CDE" /></label>
        <label>Fleet number<input value={fleet} onChange={e => setFleet(e.target.value)} placeholder="Optional" /></label>
        <label>Type<select value={type} onChange={e => setType(e.target.value)}><option value="TRUCK">Truck</option><option value="VAN">Van</option><option value="TRAILER">Trailer</option><option value="CAR">Car</option><option value="OTHER">Other</option></select></label>
        <div style={{ display: "flex", gap: 8 }}><button className="primary-button" disabled={busy} type="submit">{busy ? "Saving…" : "Save vehicle"}</button><button type="button" className="switch-mode" onClick={() => setShowForm(false)}>Cancel</button></div>
      </form></section>}
      <section className="panel"><div className="search" style={{ padding: 16 }}><Search size={19} /><input placeholder="Search vehicles…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {filtered.length === 0 ? <div className="empty-state"><h2>No vehicles yet</h2><p>Add your first vehicle to build your fleet register.</p><button className="primary-button" onClick={() => setShowForm(true)}><Plus size={18} /> Add vehicle</button></div> : <div className="job-list">{filtered.map(v => <div className="job-row" key={v.id} style={{ justifyContent: "space-between" }}><div><strong>{v.registration}</strong><p>{v.type}{v.fleetNumber ? ` · Fleet ${v.fleetNumber}` : ""}</p></div><button className="icon-button" onClick={() => remove(v.id)} title="Delete"><Trash2 size={16} /></button></div>)}</div>}
      </section>
    </section>
  );
}
