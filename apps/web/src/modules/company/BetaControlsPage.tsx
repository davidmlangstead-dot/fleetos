import { useEffect, useState } from "react";
import { CalendarClock, FlaskConical, Save, ShieldCheck, Truck } from "lucide-react";
import { ACTIVE_WORKSPACE_KEY, api } from "../../lib/api";

type Control = {
  subscriptionPlan: "EARLY_ACCESS" | "STARTER" | "GROWTH" | "ENTERPRISE";
  subscriptionStatus: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
  betaEnabled: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialExpired: boolean;
  trialDaysRemaining: number | null;
  readOnly: boolean;
  vehicleLimit: number;
  vehicleUsage: number;
  vehiclesAvailable: number;
  vehicleLimitReached: boolean;
  commitmentMonths: 12 | 24 | 36;
  commitmentStartedAt: string | null;
  commitmentEndsAt: string | null;
  featureFlags: Record<string, boolean>;
};
type Workspace = { id: string; role: string };

function toLocalDate(value: string | null) { return value ? value.slice(0, 10) : ""; }

export function BetaControlsPage() {
  const [control, setControl] = useState<Control | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const [nextControl, workspaces] = await Promise.all([api<Control>("/commercial"), api<Workspace[]>("/company/workspaces")]);
      const activeId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
      const active = workspaces.find((item) => item.id === activeId) ?? workspaces[0];
      setPlatformAdmin(active?.role === "PLATFORM_ADMIN");
      setControl(nextControl);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load plan and trial information."); }
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    if (!control || !platformAdmin) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const trialEndsAt = control.trialEndsAt ? new Date(`${toLocalDate(control.trialEndsAt)}T23:59:59.000Z`).toISOString() : null;
      setControl(await api<Control>("/commercial", { method: "PATCH", body: JSON.stringify({
        betaEnabled: control.betaEnabled, subscriptionPlan: control.subscriptionPlan,
        subscriptionStatus: control.subscriptionStatus, trialEndsAt, vehicleLimit: control.vehicleLimit,
        commitmentMonths: control.commitmentMonths, featureFlags: control.featureFlags,
      }) }));
      setMessage("Commercial controls saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save commercial controls."); }
    finally { setBusy(false); }
  }

  if (!control) return <section className="page"><div className="panel" style={{ padding: 24 }}>{error || "Loading plan and trial…"}</div></section>;
  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Plan & access</p><h1>Trial, subscription & vehicle allowance</h1><p className="subtle">Commercial access is separated from the operational record. Records stay available even when normal editing becomes read-only.</p></div></div>
    {error && <p className="form-message error">{error}</p>}{message && <p className="form-message">{message}</p>}
    <div style={{ display: "grid", gap: 18 }}>
      {control.readOnly && <section className="panel" style={{padding:18}}><div style={{display:"flex",gap:10,alignItems:"center"}}><ShieldCheck size={18}/><div><strong>This workspace is currently read-only.</strong><div className="subtle">Viewing remains available. Defect, walkaround and breakdown safety reporting remain writable.</div></div></div></section>}
      <section className="panel" style={{ padding: 18 }}><div className="panel-heading"><div><h2><CalendarClock size={18}/> 90-day trial</h2><p>{control.subscriptionStatus === "TRIAL" ? `${control.trialDaysRemaining ?? 0} day(s) remaining` : `Status: ${control.subscriptionStatus.toLowerCase().replaceAll("_", " ")}`}</p></div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}><div><small className="subtle">Started</small><strong style={{display:"block"}}>{control.trialStartedAt ? new Date(control.trialStartedAt).toLocaleDateString("en-GB") : "Not started"}</strong></div><div><small className="subtle">Ends</small><strong style={{display:"block"}}>{control.trialEndsAt ? new Date(control.trialEndsAt).toLocaleDateString("en-GB") : "Not set"}</strong></div><div><small className="subtle">Plan</small><strong style={{display:"block"}}>{control.subscriptionPlan.replaceAll("_", " ")}</strong></div></div></section>
      <section className="panel" style={{padding:18}}><div className="panel-heading"><div><h2><CalendarClock size={18}/> Paid commitment</h2><p>{control.commitmentMonths}-month commercial term once paid access is activated.</p></div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}><div><small className="subtle">Started</small><strong style={{display:"block"}}>{control.commitmentStartedAt?new Date(control.commitmentStartedAt).toLocaleDateString("en-GB"):"Starts on paid activation"}</strong></div><div><small className="subtle">Ends</small><strong style={{display:"block"}}>{control.commitmentEndsAt?new Date(control.commitmentEndsAt).toLocaleDateString("en-GB"):"Not activated"}</strong></div></div></section>
      <section className="panel" style={{ padding: 18 }}><div className="panel-heading"><div><h2><Truck size={18}/> Vehicle allowance</h2><p>{control.vehicleUsage} of {control.vehicleLimit} vehicle slots used.</p></div></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}><div><small className="subtle">Vehicles</small><strong style={{display:"block"}}>{control.vehicleUsage} / {control.vehicleLimit}</strong></div><div><small className="subtle">Available</small><strong style={{display:"block"}}>{control.vehiclesAvailable}</strong></div><div><small className="subtle">Capacity</small><strong style={{display:"block"}}>{control.vehicleLimitReached ? "Upgrade required" : "Available"}</strong></div></div>{control.vehicleLimitReached && <p className="form-message" style={{marginTop:14}}>Your vehicle allowance is full. Existing vehicle records remain available; adding another vehicle requires the next plan allowance.</p>}</section>
      {control.betaEnabled && <section className="panel" style={{ padding: 18 }}><div style={{display:"flex",gap:10,alignItems:"center"}}><FlaskConical size={18}/><div><strong>Beta access enabled</strong><div className="subtle">This workspace is participating in FleetOS early access.</div></div></div></section>}
      {platformAdmin && <section className="panel" style={{ padding: 18 }}><div className="panel-heading"><div><h2><ShieldCheck size={18}/> Platform administration</h2><p>Only FleetOS platform administration can change billing state, commitment or capacity. Stripe can take over activation later.</p></div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <label>Status<select value={control.subscriptionStatus} onChange={(e) => setControl({ ...control, subscriptionStatus: e.target.value as Control["subscriptionStatus"] })}><option value="TRIAL">Trial</option><option value="ACTIVE">Active</option><option value="PAST_DUE">Past due</option><option value="CANCELLED">Cancelled</option></select></label>
        <label>Plan<select value={control.subscriptionPlan} onChange={(e) => setControl({ ...control, subscriptionPlan: e.target.value as Control["subscriptionPlan"] })}><option value="EARLY_ACCESS">Early access</option><option value="STARTER">Starter</option><option value="GROWTH">Growth</option><option value="ENTERPRISE">Enterprise</option></select></label>
        <label>Commitment<select value={control.commitmentMonths} onChange={(e)=>setControl({...control,commitmentMonths:Number(e.target.value) as 12|24|36})}><option value={12}>12 months</option><option value={24}>24 months</option><option value={36}>36 months</option></select></label>
        <label>Vehicle limit<input type="number" min={1} max={100000} value={control.vehicleLimit} onChange={(e) => setControl({ ...control, vehicleLimit: Number(e.target.value) || 1 })}/></label>
        <label>Trial end date<input type="date" value={toLocalDate(control.trialEndsAt)} onChange={(e) => setControl({ ...control, trialEndsAt: e.target.value ? `${e.target.value}T23:59:59.000Z` : null })}/></label>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={control.betaEnabled} onChange={(e) => setControl({ ...control, betaEnabled: e.target.checked })}/> Beta access enabled</label>
      </div><div style={{marginTop:14}}><button disabled={busy} onClick={() => void save()}><Save size={16}/> {busy ? "Saving…" : "Save commercial controls"}</button></div></section>}
      <section className="panel" style={{ padding: 18 }}><div style={{ display: "flex", gap: 10, alignItems: "center" }}><ShieldCheck size={18}/><div><strong>Operational data is never deleted automatically when a trial ends or a plan is downgraded.</strong><div className="subtle">FleetOS preserves records for viewing, export, conversion or deliberate offboarding.</div></div></div></section>
    </div>
  </section>;
}
