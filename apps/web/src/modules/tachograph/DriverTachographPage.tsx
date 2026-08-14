import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
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

  return <section className="page driver-page">
    <div className="page-heading"><div><p className="eyebrow">My driver card</p><h1>Tachograph download status</h1><p className="subtle">This shows the card-download evidence recorded by your company. Your tachograph and original download file remain the source record.</p></div><Link className="secondary-button" to="/driver">Back to Driver Today</Link></div>
    {error && <p role="alert" className="form-message error">{error}</p>}

    {!latest ? <section className="panel driver-form-card"><Clock3 size={28}/><h2>No card download recorded yet</h2><p className="subtle">Ask the office to upload the .ddd file produced by the company’s existing card reader software.</p></section> : <>
      <section className={`panel driver-callout ${latest.dueState === "OVERDUE" ? "safety-stop" : ""}`}>
        {latest.dueState === "CURRENT" ? <CheckCircle2 size={28}/> : <AlertTriangle size={28}/>}<div><h2>{stateText(latest)}</h2><p>Last card download: {new Date(latest.downloadedAt).toLocaleString("en-GB")}</p><p>Next scheduled download: {new Date(latest.nextDueAt).toLocaleDateString("en-GB")}</p></div>
      </section>
      <section className="panel driver-form-card"><h2>Recent card downloads</h2><div className="driver-list">{items.map(item => <article key={item.id}><strong>{new Date(item.downloadedAt).toLocaleDateString("en-GB")} · {stateText(item)}</strong><span>{item.originalFilename}</span></article>)}</div></section>
    </>}
  </section>;
}
