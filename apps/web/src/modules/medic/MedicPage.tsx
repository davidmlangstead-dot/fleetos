import { useEffect, useState } from "react";
import { Activity, CheckCircle2, CloudOff, RefreshCw, ShieldAlert, Stethoscope, TriangleAlert } from "lucide-react";
import { api, ACTIVE_WORKSPACE_KEY, syncPendingChanges } from "../../lib/api";
import { getOfflineSnapshot, OFFLINE_STATE_EVENT, type OfflineSnapshot } from "../../lib/offline";

type Check = { key: string; label: string; status: "HEALTHY" | "DEGRADED"; detail: string; latencyMs?: number };
type Incident = {
  id: string; severity: "INFO" | "WARNING" | "CRITICAL"; status: "OPEN" | "RECOVERED" | "RESOLVED";
  code: string; source: string; summary: string; detail: string | null; recovery: string | null;
  createdAt: string; resolvedAt: string | null;
};
type Status = {
  overall: "HEALTHY" | "ATTENTION" | "DEGRADED";
  checkedAt: string;
  openIncidents: number;
  authority: { observe: boolean; safeRecovery: boolean; destructiveRecovery: boolean; automaticDeployments: boolean; automaticSecurityChanges: boolean };
  checks: Check[];
  recentIncidents: Incident[];
};

const initialSync: OfflineSnapshot = { online: navigator.onLine, syncing: false, pending: 0, failed: 0, lastSyncedAt: null };

export function MedicPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [localSync, setLocalSync] = useState(initialSync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true); setError("");
    try {
      const [remote, local] = await Promise.all([api<Status>("/medic/status"), getOfflineSnapshot()]);
      setStatus(remote); setLocalSync(local);
    } catch (e) { setError(e instanceof Error ? e.message : "Medic could not complete its checks."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const updateSync = (event: Event) => setLocalSync((event as CustomEvent<OfflineSnapshot>).detail);
    void load();
    window.addEventListener(OFFLINE_STATE_EVENT, updateSync);
    return () => window.removeEventListener(OFFLINE_STATE_EVENT, updateSync);
  }, []);

  async function retrySync() {
    setBusy(true); setError("");
    try { await syncPendingChanges(); setLocalSync(await getOfflineSnapshot()); }
    catch (e) { setError(e instanceof Error ? e.message : "Queued changes could not be synced."); }
    finally { setBusy(false); }
  }

  async function safeClientReset() {
    setBusy(true); setError("");
    try {
      await api("/medic/events", { method: "POST", body: JSON.stringify({
        severity: "INFO", code: "CLIENT_CACHE_RESET", source: "medic-ui",
        summary: "Safe client cache reset requested.",
        recovery: "Cleared FleetOS static caches and stale workspace selection; authentication credentials and queued offline work were not intentionally removed.",
        recovered: true,
      }) });
    } catch { /* Recovery must still work when incident logging is unavailable. */ }

    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith("fleetos-")).map((key) => caches.delete(key)));
      }
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear the local FleetOS cache.");
      setBusy(false);
    }
  }

  async function resolveIncident(id: string) {
    setBusy(true); setError("");
    try { await api(`/medic/incidents/${id}/resolve`, { method: "PATCH" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not resolve this incident."); setBusy(false); }
  }

  const overallIcon = status?.overall === "HEALTHY" ? <CheckCircle2 size={28}/> : status?.overall === "DEGRADED" ? <ShieldAlert size={28}/> : <TriangleAlert size={28}/>;
  const syncHealthy = localSync.online && localSync.pending === 0 && localSync.failed === 0;

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Reliability & diagnostics</p><h1>FleetOS Medic</h1><p className="subtle">Medic observes, diagnoses and performs only pre-approved safe recovery. It cannot delete customer data, change security, rewrite code or deploy production by itself.</p></div>
      <button className="primary-button" onClick={() => void load()} disabled={busy}><RefreshCw size={16}/> {busy ? "Checking…" : "Run diagnosis"}</button>
    </div>

    {error && <div className="panel" style={{padding:14,marginBottom:16,borderColor:"#dc2626",color:"#991b1b"}}>{error}</div>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginBottom:18}}>
      <article className="panel" style={{padding:18}}><div style={{display:"flex",gap:12,alignItems:"center"}}>{overallIcon}<div><p className="eyebrow">Overall health</p><h2 style={{margin:0}}>{status?.overall ?? "CHECKING"}</h2></div></div><p className="subtle">{status ? `${status.openIncidents} open incident${status.openIncidents === 1 ? "" : "s"}.` : "Running checks…"}</p></article>
      <article className="panel" style={{padding:18}}><div style={{display:"flex",gap:12,alignItems:"center"}}><Stethoscope size={28}/><div><p className="eyebrow">Medic authority</p><h2 style={{margin:0}}>Controlled</h2></div></div><p className="subtle">Observe + safe recovery enabled. Destructive recovery, automatic deployments and security changes are blocked.</p></article>
      <article className="panel" style={{padding:18}}><div style={{display:"flex",gap:12,alignItems:"center"}}>{syncHealthy ? <CheckCircle2 size={28}/> : <CloudOff size={28}/>}<div><p className="eyebrow">This device</p><h2 style={{margin:0}}>{!localSync.online ? "OFFLINE" : localSync.failed ? "ATTENTION" : localSync.pending ? "SYNCING" : "SYNCED"}</h2></div></div><p className="subtle">{localSync.pending} queued · {localSync.failed} needs attention.</p>{(localSync.pending > 0 || localSync.failed > 0) && <button disabled={busy || !localSync.online} onClick={() => void retrySync()}><RefreshCw size={15}/> Retry sync</button>}</article>
    </div>

    <section className="panel" style={{marginBottom:18}}><div className="panel-heading"><div><h2>Live checks</h2><p className="subtle">A green check means Medic actually exercised that dependency for this request.</p></div></div>
      <div style={{display:"grid",gap:10,padding:16}}>{status?.checks.map(check => <article key={check.key} style={{display:"flex",gap:12,alignItems:"flex-start",border:"1px solid #e5e7eb",borderRadius:12,padding:14}}>
        {check.status === "HEALTHY" ? <CheckCircle2 size={20}/> : <TriangleAlert size={20}/>}<div><strong>{check.label} · {check.status}</strong><div className="subtle">{check.detail}{check.latencyMs !== undefined ? ` · ${check.latencyMs} ms` : ""}</div></div>
      </article>) ?? <p className="subtle">Waiting for diagnosis.</p>}</div>
    </section>

    <section className="panel" style={{marginBottom:18}}><div className="panel-heading"><div><h2>Safe recovery</h2><p className="subtle">These actions are deliberately narrow. They do not change database records, queued offline work, roles, RLS, secrets or deployments.</p></div></div>
      <div style={{padding:16,display:"flex",gap:10,flexWrap:"wrap"}}><button onClick={() => void safeClientReset()} disabled={busy}><Activity size={16}/> Clear stale app cache & workspace state</button></div>
    </section>

    <section className="panel"><div className="panel-heading"><div><h2>Incident ledger</h2><p className="subtle">What Medic saw, what recovered, and what still needs human attention.</p></div></div>
      <div style={{display:"grid",gap:10,padding:16}}>{status?.recentIncidents.length ? status.recentIncidents.map(item => <article key={item.id} style={{border:"1px solid #e5e7eb",borderRadius:12,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}><div><strong>{item.summary}</strong><div className="subtle">{item.source} · {item.code} · {new Date(item.createdAt).toLocaleString("en-GB")}</div></div><span className="presence">{item.severity} · {item.status}</span></div>
        {item.detail && <p>{item.detail}</p>}{item.recovery && <p className="subtle"><strong>Recovery:</strong> {item.recovery}</p>}
        {item.status === "OPEN" && <button disabled={busy} onClick={() => void resolveIncident(item.id)}>Mark resolved</button>}
      </article>) : <p className="subtle">No Medic incidents recorded for this company yet.</p>}</div>
    </section>
  </section>;
}
