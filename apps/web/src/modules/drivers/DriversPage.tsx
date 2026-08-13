import { useEffect, useState } from "react";
import { Search, UserPlus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  licenceNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
};

export function DriversPage() {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setDrivers(await api<Driver[]>("/drivers"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load drivers");
    }
  }

  useEffect(() => { void load(); }, []);

  async function remove(id: string) {
    if (!window.confirm("Archive this driver? Their historical records will be kept.")) return;
    try {
      await api<void>(`/drivers/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not archive driver");
    }
  }

  const filtered = drivers.filter((d) =>
    `${d.firstName} ${d.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Fleet operations</p>
          <h1>Drivers</h1>
          <p className="subtle">Drivers are created once in Personal, together with their staff details, compliance information and FleetOS login.</p>
        </div>
        <button className="primary-button" onClick={() => navigate("/personal")}><UserPlus size={18} /> Add driver in Personal</button>
      </div>

      {error && <div className="panel" style={{ marginBottom: 16, padding: 14, color: "#991b1b" }}>{error}</div>}

      <section className="panel">
        <div className="search" style={{ padding: 16 }}>
          <Search size={19} />
          <input placeholder="Search drivers…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h2>No active drivers yet</h2>
            <p>Add the person in Personal and choose Driver. FleetOS will create their staff record, driver record and optional login together.</p>
            <button className="primary-button" onClick={() => navigate("/personal")}><UserPlus size={18} /> Add driver in Personal</button>
          </div>
        ) : (
          <div className="job-list">
            {filtered.map((d) => (
              <div className="job-row" key={d.id} style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{d.firstName} {d.lastName}</strong>
                  <p>{d.licenceNumber || "No licence on file"}{d.phone ? ` · ${d.phone}` : ""}</p>
                </div>
                <button className="icon-button" onClick={() => void remove(d.id)} title="Archive"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
