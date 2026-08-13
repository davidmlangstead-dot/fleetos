import { useEffect, useState } from "react";
import { CheckCircle2, CloudOff, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { syncPendingChanges } from "../lib/api";
import {
  discardOfflineMutation,
  getOfflineSnapshot,
  listOfflineMutations,
  OFFLINE_STATE_EVENT,
  type OfflineMutation,
  type OfflineSnapshot,
  retryOfflineMutation,
} from "../lib/offline";

const initial: OfflineSnapshot = { online: navigator.onLine, syncing: false, pending: 0, failed: 0, lastSyncedAt: null };

function friendlyPath(item: OfflineMutation) {
  if (item.path.startsWith("/operations/maintenance")) return "Workshop change";
  if (item.path.startsWith("/operations/defects")) return "Defect change";
  if (item.path.startsWith("/operations/driver-hours")) return "Driver hours";
  if (item.path.startsWith("/registers")) return "Register change";
  if (item.path.startsWith("/messages")) return "Message change";
  if (item.path.startsWith("/vehicles")) return "Vehicle change";
  if (item.path.startsWith("/drivers")) return "Driver change";
  if (item.path.startsWith("/jobs")) return "Job change";
  return "FleetOS change";
}

export function OfflineStatus() {
  const [state, setState] = useState(initial);
  const [items, setItems] = useState<OfflineMutation[]>([]);
  const [open, setOpen] = useState(false);

  async function refresh() {
    const [snapshot, mutations] = await Promise.all([getOfflineSnapshot(), listOfflineMutations().catch(() => [])]);
    setState(snapshot);
    setItems(mutations);
  }

  useEffect(() => {
    const update = () => { void refresh(); };
    void refresh();
    window.addEventListener(OFFLINE_STATE_EVENT, update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener(OFFLINE_STATE_EVENT, update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function retryAll() {
    for (const item of items.filter((entry) => entry.state === "failed")) await retryOfflineMutation(item.id);
    await syncPendingChanges();
    await refresh();
  }

  async function discard(item: OfflineMutation) {
    if (!window.confirm(`Discard this unsent ${friendlyPath(item).toLowerCase()}? This cannot be recovered.`)) return;
    await discardOfflineMutation(item.id);
    await refresh();
  }

  const attention = state.failed > 0;
  const label = !state.online ? "Offline" : state.syncing ? "Syncingâ€¦" : attention ? `${state.failed} needs attention` : state.pending ? `${state.pending} queued` : "Synced";
  const Icon = !state.online ? CloudOff : attention ? TriangleAlert : state.syncing || state.pending ? RefreshCw : CheckCircle2;
  const colour = !state.online ? "#92400e" : attention ? "#b91c1c" : "#166534";

  return <div style={{ position: "relative" }}>
    <button onClick={() => setOpen((value) => !value)} aria-label={`Connection status: ${label}`} style={{ display: "flex", alignItems: "center", gap: 6, border: 0, background: "transparent", color: colour, fontSize: 12, fontWeight: 700, padding: "7px 8px", cursor: "pointer" }}>
      <Icon size={16} className={state.syncing ? "spin" : undefined} /> <span>{label}</span>
    </button>
    {open && <div style={{ position: "absolute", right: 0, top: 38, width: 330, maxWidth: "85vw", maxHeight: 430, overflowY: "auto", background: "white", color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 18px 45px rgba(15,23,42,.18)", zIndex: 60, padding: 12 }}>
      <strong>{state.online ? "FleetOS sync" : "Working offline"}</strong>
      <p style={{ margin: "6px 0 12px", color: "#64748b", fontSize: 12 }}>{state.online ? "Saved changes sync automatically and are protected from duplicates." : "Your changes stay safely on this device and will send when the connection returns."}</p>
      {items.length === 0 ? <p style={{ color: "#166534", fontSize: 13 }}>Everything is up to date.</p> : items.map((item) => <div key={item.id} style={{ borderTop: "1px solid #f1f5f9", padding: "10px 0", display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div><strong style={{ fontSize: 13 }}>{friendlyPath(item)}</strong><div style={{ color: item.state === "failed" ? "#b91c1c" : "#64748b", fontSize: 11 }}>{item.state === "failed" ? item.lastError ?? "Needs attention" : `Waiting to sync Â· ${new Date(item.createdAt).toLocaleString("en-GB")}`}</div></div>
        <button aria-label={`Discard ${friendlyPath(item)}`} onClick={() => void discard(item)} style={{ border: 0, background: "transparent", color: "#64748b", padding: 4 }}><Trash2 size={15}/></button>
      </div>)}
      {(state.pending > 0 || state.failed > 0) && <button onClick={() => void retryAll()} disabled={!state.online || state.syncing} style={{ width: "100%", marginTop: 10 }}><RefreshCw size={15}/> Retry now</button>}
    </div>}
  </div>;
}

