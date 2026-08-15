import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

type Download = {
  id: string;
  driverName: string;
  originalFilename: string;
  fileSize: number | null;
  downloadedAt: string;
  nextDueAt: string;
  daysRemaining: number;
  dueState: "CURRENT" | "DUE_SOON" | "OVERDUE";
  status: string;
};

function stateText(item: Download) {
  if (item.dueState === "OVERDUE") return `${Math.abs(item.daysRemaining)} day${Math.abs(item.daysRemaining) === 1 ? "" : "s"} overdue`;
  if (item.dueState === "DUE_SOON") return item.daysRemaining === 0 ? "Due today" : `Due in ${item.daysRemaining} day${item.daysRemaining === 1 ? "" : "s"}`;
  return `Current · ${item.daysRemaining} days remaining`;
}

export function DriverTachographPage() {
  const [items, setItems] = useState<Download[]>([]);
  const [error, setError] = useState("");
  const latest = items[0] ?? null;

  useEffect(() => {
    void api<Download[]>("/tachograph/me").then(setItems).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Could not load your tachograph download status."));
  }, []);

  return <main className="driver-field-app driver-field-subpage">
    <header className="driver-field-header">
      <div><small>FleetOS Driver</small><strong>My tachograph</strong></div>
      <Link className="driver-field-header-link" to="/driver"><ChevronLeft size={18}/> Today</Link>
    </header>
    <section className="field-flow driver-dark-page">
      <div className="field-flow-title"><Clock3/><div><small>My driver card</small><h1>Tachograph status</h1></div></div>
      <p className="field-helper">Card-download evidence recorded by your company. Your tachograph and original download file remain the source record.</p>
      {error && <p role="alert" className="field-message">{error}</p>}

      {!latest ? <section className="driver-dark-card driver-dark-empty"><Clock3 size={34}/><h2>No card download recorded yet</h2><p>Ask the office to upload the .ddd file produced by the company’s existing card reader software.</p></section> : <>
        <section className={`driver-dark-card driver-tacho-state ${latest.dueState === "OVERDUE" ? "is-danger" : latest.dueState === "DUE_SOON" ? "is-warning" : "is-good"}`}>
          {latest.dueState === "CURRENT" ? <CheckCircle2 size={34}/> : <AlertTriangle size={34}/>}<div><small>Current status</small><h2>{stateText(latest)}</h2><p>Last card download: {new Date(latest.downloadedAt).toLocaleString("en-GB")}</p><p>Next scheduled download: {new Date(latest.nextDueAt).toLocaleDateString("en-GB")}</p></div>
        </section>
        <section className="driver-dark-card"><h2>Recent card downloads</h2><div className="driver-dark-list">{items.map(item => <article key={item.id}><strong>{new Date(item.downloadedAt).toLocaleDateString("en-GB")}</strong><span>{stateText(item)}</span><small>{item.originalFilename}</small></article>)}</div></section>
      </>}
    </section>
  </main>;
}
