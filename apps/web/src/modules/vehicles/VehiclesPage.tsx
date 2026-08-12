import { useEffect, useState } from "react";
import { Search, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { VehicleWizard } from "./VehicleWizard";

type Vehicle = {
  id: string;
  registration: string;
  fleetNumber?: string | null;
  vin?: string | null;
  type: string;
  status: string;
  make?: string | null;
  model?: string | null;
  motDue?: string | null;
  insuranceDue?: string | null;
};

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setVehicles(await api<Vehicle[]>("/vehicles"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load vehicles.");
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = vehicles.filter((v) => `${v.registration} ${v.make ?? ""} ${v.model ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Fleet operations</p><h1>Vehicles</h1><p className="subtle">Your live vehicle register. Only recorded information is shown.</p></div>
        <button className="primary-button" onClick={() => setShowWizard(true)}><Plus size={18} /> Add vehicle</button>
      </div>
      {error && <p role="alert" className="form-message error">{error}</p>}
      {showWizard && <VehicleWizard onCancel={() => setShowWizard(false)} onComplete={() => { setShowWizard(false); void load(); }} />}
      {!showWizard && <section className="panel">
        <div className="search" style={{ padding: 16 }}><Search size={19} /><input placeholder="Search vehicles…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {filtered.length === 0 ? <div className="empty-state"><h2>No vehicles recorded</h2><p>There is no vehicle data to display yet.</p><button className="primary-button" onClick={() => setShowWizard(true)}><Plus size={18} /> Add your first vehicle</button></div> :
          <div className="job-list">{filtered.map((v) => <div className="job-row" key={v.id} style={{ justifyContent: "space-between" }}><div><strong>{v.registration}</strong><p>{v.type} · {v.make || "Make not recorded"} {v.model || ""}{v.fleetNumber ? ` · Fleet ${v.fleetNumber}` : ""}</p></div><button className="icon-button" title="Delete" disabled><Trash2 size={16} /></button></div>)}</div>}
      </section>}
    </section>
  );
}
