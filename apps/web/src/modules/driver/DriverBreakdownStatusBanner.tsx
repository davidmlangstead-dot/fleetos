import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Truck } from "lucide-react";
import { api } from "../../lib/api";
import "./driver-breakdown-status.css";

type Breakdown = {
  id: string;
  severity: string;
  status: string;
  location: string;
  description: string;
  reportedAt: string;
  resolutionNotes: string | null;
  registration: string;
};

type DriverSummary = { breakdowns: Breakdown[] };

const VISIBLE_FOR_MS = 24 * 60 * 60 * 1000;

function copyFor(status: string) {
  switch (status) {
    case "RECOVERY_ARRANGED":
      return { title: "Recovery arranged", detail: "Help is on the way. Stay somewhere safe and follow any office instructions.", tone: "recovery" };
    case "ACKNOWLEDGED":
      return { title: "Office has acknowledged your breakdown", detail: "Your alert has been seen. Keep the vehicle safe and wait for the next update.", tone: "acknowledged" };
    case "RESOLVED":
      return { title: "Breakdown resolved", detail: "The office has marked this breakdown as resolved.", tone: "resolved" };
    case "CANCELLED":
      return { title: "Breakdown cancelled", detail: "The office has cancelled this breakdown response.", tone: "cancelled" };
    default:
      return { title: "Breakdown reported", detail: "Office and workshop have your alert. Waiting for a response.", tone: "reported" };
  }
}

export function DriverBreakdownStatusBanner() {
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (document.documentElement.dataset.fleetosRole !== "DRIVER" || !navigator.onLine) {
      setBreakdown(null);
      return;
    }
    setRefreshing(true);
    try {
      const data = await api<DriverSummary>("/driver-operations/me");
      const recent = data.breakdowns.find(item => Date.now() - new Date(item.reportedAt).getTime() <= VISIBLE_FOR_MS) ?? null;
      setBreakdown(recent);
    } catch {
      // Keep the last known status on screen if a background refresh fails.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const onRoleChange = () => void refresh();
    const onOnline = () => void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("fleetos:role", onRoleChange);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    }, 10_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("fleetos:role", onRoleChange);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  if (!breakdown || document.documentElement.dataset.fleetosRole !== "DRIVER") return null;
  const copy = copyFor(breakdown.status);
  const Icon = breakdown.status === "RESOLVED" ? CheckCircle2 : breakdown.status === "RECOVERY_ARRANGED" ? Truck : AlertTriangle;

  return <aside className={`driver-breakdown-live driver-breakdown-${copy.tone}`} role="status" aria-live={breakdown.status === "RECOVERY_ARRANGED" ? "assertive" : "polite"}>
    <Icon aria-hidden="true" />
    <div className="driver-breakdown-copy">
      <small>{breakdown.registration} · {breakdown.status.replaceAll("_", " ")}</small>
      <strong>{copy.title}</strong>
      <span>{copy.detail}</span>
      {breakdown.resolutionNotes && <em>Office: {breakdown.resolutionNotes}</em>}
    </div>
    <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh breakdown status">
      <RefreshCw className={refreshing ? "spin" : ""} />
      <span>{refreshing ? "Checking" : "Refresh"}</span>
    </button>
  </aside>;
}
