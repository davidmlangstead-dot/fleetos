import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileUp, Gauge, UserRound } from "lucide-react";
import { api, ACTIVE_WORKSPACE_KEY } from "../../lib/api";
import { supabase } from "../../lib/supabase";

type DriverOption = { id: string; label: string };
type LinkOptions = { drivers: DriverOption[] };
type Download = {
  id: string;
  driverId: string;
  driverName: string;
  documentId: string;
  storagePath: string;
  originalFilename: string;
  fileSize: number | null;
  downloadedAt: string;
  nextDueAt: string;
  daysRemaining: number;
  dueState: "CURRENT" | "DUE_SOON" | "OVERDUE";
  source: string;
  status: string;
  createdAt: string;
};

function cleanFilename(name: string) {
  const safe = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-160);
  return safe || "tachograph. ddd".replace(" ", "");
}

function stateLabel(item: Download) {
  if (item.dueState === "OVERDUE") return `${Math.abs(item.daysRemaining)} day${Math.abs(item.daysRemaining) === 1 ? "" : "s"} overdue`;
  if (item.dueState === "DUE_SOON") return item.daysRemaining === 0 ? "Due today" : `${item.daysRemaining} day${item.daysRemaining === 1 ? "" : "s"} remaining`;
  return `${item.daysRemaining} days remaining`;
}

export function TachographPage() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driverId, setDriverId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [downloadedAt, setDownloadedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [items, options] = await Promise.all([
        api<Download[]>("/tachograph"),
        api<LinkOptions>("/documents/link-options"),
      ]);
      setDownloads(items);
      setDrivers(options.drivers ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load tachograph downloads.");
    }
  }

  useEffect(() => { void load(); }, []);

  const latestByDriver = useMemo(() => {
    const map = new Map<string, Download>();
    for (const item of downloads) if (!map.has(item.driverId)) map.set(item.driverId, item);
    return [...map.values()].sort((a, b) => a.driverName.localeCompare(b.driverName));
  }, [downloads]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    const companyId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (!companyId) return setError("No active company workspace is selected.");
    if (!driverId) return setError("Choose the driver this card download belongs to.");
    if (!file) return setError("Choose the .ddd file exported by the tachograph reader software.");
    if (!/\.ddd$/i.test(file.name)) return setError("FleetOS currently accepts original .ddd driver-card download files only.");
    if (file.size > 20 * 1024 * 1024) return setError("Tachograph files must be 20 MB or smaller.");

    const path = `${companyId}/tachograph/${crypto.randomUUID()}-${cleanFilename(file.name)}`;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: storageError } = await supabase.storage.from("fleet-documents").upload(path, file, {
        upsert: false,
        contentType: "application/octet-stream",
      });
      if (storageError) throw storageError;

      try {
        const created = await api<Download>("/tachograph", {
          method: "POST",
          body: JSON.stringify({
            driverId,
            storagePath: path,
            originalFilename: file.name,
            fileSize: file.size,
            downloadedAt: new Date(downloadedAt).toISOString(),
          }),
        });
        setMessage(`${created.driverName} card download recorded. Next download due ${new Date(created.nextDueAt).toLocaleDateString("en-GB")}.`);
      } catch (apiError) {
        await supabase.storage.from("fleet-documents").remove([path]);
        throw apiError;
      }

      setFile(null);
      setDriverId("");
      setDownloadedAt(new Date().toISOString().slice(0, 16));
      const input = document.querySelector<HTMLInputElement>("#tachograph-file");
      if (input) input.value = "";
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not save the tachograph download.");
    } finally {
      setBusy(false);
    }
  }

  async function openFile(item: Download) {
    setError("");
    const { data, error: signedError } = await supabase.storage.from("fleet-documents").createSignedUrl(item.storagePath, 60);
    if (signedError || !data?.signedUrl) return setError(signedError?.message || "Could not open the original tachograph file.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return <section className="page">
    <div className="page-heading">
      <div><p className="eyebrow">Driver card evidence</p><h1>Tachograph downloads</h1><p className="subtle">Use the reader and download software the company already owns. Upload the original .ddd file here and FleetOS tracks the driver-card download schedule for both driver and office.</p></div>
      <div className="presence">{latestByDriver.length} drivers tracked</div>
    </div>

    {error && <p role="alert" className="form-message error">{error}</p>}
    {message && <p role="status" className="form-message">{message}</p>}

    <div className="metric-grid" style={{ marginBottom: 20 }}>
      <article className="metric-card"><div className="metric-icon blue"><Gauge size={21}/></div><div><p>Current</p><strong>{latestByDriver.filter(item => item.dueState === "CURRENT").length}</strong><small>More than 7 days remaining</small></div></article>
      <article className="metric-card"><div className="metric-icon orange"><Clock3 size={21}/></div><div><p>Due soon</p><strong>{latestByDriver.filter(item => item.dueState === "DUE_SOON").length}</strong><small>7 days or fewer remaining</small></div></article>
      <article className="metric-card"><div className="metric-icon red"><AlertTriangle size={21}/></div><div><p>Overdue</p><strong>{latestByDriver.filter(item => item.dueState === "OVERDUE").length}</strong><small>Needs a fresh card download</small></div></article>
    </div>

    <form className="panel" onSubmit={upload} style={{ padding: 18, marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}><FileUp size={20}/><div><h2>Record a driver-card download</h2><p className="subtle">The .ddd file remains the source evidence. FleetOS records and schedules it; it does not replace the statutory tachograph record.</p></div></div>
      <div className="form-grid">
        <label>Driver *<select required value={driverId} onChange={event => setDriverId(event.target.value)}><option value="">Choose driver</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.label}</option>)}</select></label>
        <label>Original .ddd file *<input id="tachograph-file" type="file" accept=".ddd,application/octet-stream" required onChange={event => setFile(event.target.files?.[0] ?? null)}/></label>
        <label>Downloaded at *<input type="datetime-local" required value={downloadedAt} onChange={event => setDownloadedAt(event.target.value)}/></label>
      </div>
      <p className="subtle">Private company storage · maximum 20 MB · next driver-card download is tracked at 28 calendar days from the recorded download time.</p>
      <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Upload and record"}</button>
    </form>

    <section className="panel">
      <div className="panel-heading"><div><h2>Driver download status</h2><p>The latest recorded card download for each driver.</p></div></div>
      <div style={{ display: "grid", gap: 10, padding: 16, borderTop: "1px solid #edf0f4" }}>
        {latestByDriver.length === 0 ? <div className="empty-state" style={{ margin: "40px auto" }}><UserRound size={28}/><h2>No card downloads recorded</h2><p>Upload the first .ddd file above.</p></div> : latestByDriver.map(item => <article key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220 }}><strong>{item.driverName}</strong><div className="subtle">Last download: {new Date(item.downloadedAt).toLocaleString("en-GB")}</div><div className="subtle">Next due: {new Date(item.nextDueAt).toLocaleDateString("en-GB")} · {item.originalFilename}</div></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`driver-status ${item.dueState === "CURRENT" ? "completed" : item.dueState === "OVERDUE" ? "cancelled" : "planned"}`}>{item.dueState === "CURRENT" ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>} {stateLabel(item)}</span>
            <button type="button" onClick={() => void openFile(item)}>Open source file</button>
          </div>
        </article>)}
      </div>
    </section>
  </section>;
}
