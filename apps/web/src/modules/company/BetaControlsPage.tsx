import { useEffect, useState } from "react";
import { CalendarClock, FlaskConical, Save, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";

type Control = {
  subscriptionPlan: "EARLY_ACCESS" | "STARTER" | "GROWTH" | "ENTERPRISE";
  subscriptionStatus: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
  betaEnabled: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialExpired: boolean;
  trialDaysRemaining: number | null;
  featureFlags: Record<string, boolean>;
};

function toLocalDate(value: string | null) { return value ? value.slice(0, 10) : ""; }

export function BetaControlsPage() {
  const [control, setControl] = useState<Control | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try { setControl(await api<Control>("/commercial")); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load beta controls."); }
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    if (!control) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const trialEndsAt = control.trialEndsAt ? new Date(`${toLocalDate(control.trialEndsAt)}T23:59:59.000Z`).toISOString() : null;
      setControl(await api<Control>("/commercial", { method: "PATCH", body: JSON.stringify({
        betaEnabled: control.betaEnabled, subscriptionPlan: control.subscriptionPlan,
        subscriptionStatus: control.subscriptionStatus, trialEndsAt, featureFlags: control.featureFlags,
      }) }));
      setMessage("Beta and trial controls saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save beta controls."); }
    finally { setBusy(false); }
  }

  if (!control) return <section className="page"><div className="panel" style={{ padding: 24 }}>{error || "Loading beta controls…"}</div></section>;
  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Commercial controls</p><h1>Beta & trial</h1><p className="subtle">Control this company’s early-access state without changing its operational records.</p></div></div>
    {error && <p className="form-message error">{error}</p>}{message && <p className="form-message">{message}</p>}
    <div style={{ display: "grid", gap: 18 }}>
      <section className="panel" style={{ padding: 18 }}><div className="panel-heading"><div><h2><FlaskConical size={18}/> Beta access</h2><p>Use this while a company is testing FleetOS.</p></div></div><label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={control.betaEnabled} onChange={(e) => setControl({ ...control, betaEnabled: e.target.checked })}/> Beta access enabled</label></section>
      <section className="panel" style={{ padding: 18 }}><div className="panel-heading"><div><h2><CalendarClock size={18}/> Subscription window</h2><p>{control.subscriptionStatus === "TRIAL" ? `${control.trialDaysRemaining ?? 0} day(s) remaining` : "Trial countdown is not active"}</p></div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <label>Status<select value={control.subscriptionStatus} onChange={(e) => setControl({ ...control, subscriptionStatus: e.target.value as Control["subscriptionStatus"] })}><option value="TRIAL">Trial</option><option value="ACTIVE">Active</option><option value="PAST_DUE">Past due</option><option value="CANCELLED">Cancelled</option></select></label>
        <label>Plan<select value={control.subscriptionPlan} onChange={(e) => setControl({ ...control, subscriptionPlan: e.target.value as Control["subscriptionPlan"] })}><option value="EARLY_ACCESS">Early access</option><option value="STARTER">Starter</option><option value="GROWTH">Growth</option><option value="ENTERPRISE">Enterprise</option></select></label>
        <label>Trial end date<input type="date" value={toLocalDate(control.trialEndsAt)} onChange={(e) => setControl({ ...control, trialEndsAt: e.target.value ? `${e.target.value}T23:59:59.000Z` : null })}/></label>
      </div></section>
      <section className="panel" style={{ padding: 18 }}><div style={{ display: "flex", gap: 10, alignItems: "center" }}><ShieldCheck size={18}/><div><strong>Operational data is not deleted when a trial ends.</strong><div className="subtle">Status controls access/commercial state only; records remain intact for a deliberate conversion or offboarding process.</div></div></div></section>
      <div><button disabled={busy} onClick={() => void save()}><Save size={16}/> {busy ? "Saving…" : "Save controls"}</button></div>
    </div>
  </section>;
}
