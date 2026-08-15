import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Commercial = {
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  trialEndsAt?: string | null;
  vehicleLimit?: number;
  commitmentMonths?: number;
};

type Workspace = { id: string; name: string; slug: string; role: string };

export function PlatformControlPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [commercial, setCommercial] = useState<Commercial | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      api<Workspace[]>("/company/workspaces"),
      api<Commercial>("/commercial"),
    ]).then(([companies, billing]) => {
      setWorkspaces(companies);
      setCommercial(billing);
    }).catch((err) => setError(err instanceof Error ? err.message : "Unable to load platform controls"));
  }, []);

  return <div className="page-shell">
    <div className="page-heading">
      <div><p className="eyebrow">Platform owner</p><h1>FleetOS Control</h1><p>Your private control room for customers, resellers, subscriptions and platform health.</p></div>
    </div>
    {error && <p className="form-message">{error}</p>}
    <div className="stats-grid">
      <article className="stat-card"><span>Accessible workspaces</span><strong>{workspaces.length}</strong><small>Companies attached to this account</small></article>
      <article className="stat-card"><span>Current plan</span><strong>{commercial?.subscriptionPlan ?? "—"}</strong><small>{commercial?.subscriptionStatus ?? "Commercial state"}</small></article>
      <article className="stat-card"><span>Vehicle allowance</span><strong>{commercial?.vehicleLimit ?? "—"}</strong><small>Server-enforced allowance</small></article>
      <article className="stat-card"><span>Commitment</span><strong>{commercial?.commitmentMonths ? `${commercial.commitmentMonths} months` : "12 months"}</strong><small>Standard paid term</small></article>
    </div>
    <section className="dashboard-section">
      <div className="section-heading"><div><p className="eyebrow">Commercial control</p><h2>What you control here</h2></div></div>
      <div className="action-grid">
        <a className="action-card" href="/settings/beta"><strong>Subscriptions & trials</strong><span>90-day trials, plan status and vehicle allowances.</span></a>
        <a className="action-card" href="/reseller"><strong>Resellers & white label</strong><span>Create agent channels, branding boundaries and wholesale relationships.</span></a>
        <a className="action-card" href="/settings/medic"><strong>Platform health</strong><span>Open FleetOS Medic and operational safeguards.</span></a>
        <a className="action-card" href="/settings/audit"><strong>Audit trail</strong><span>Review recorded company activity.</span></a>
      </div>
    </section>
    <section className="dashboard-section">
      <div className="section-heading"><div><p className="eyebrow">Architecture</p><h2>One platform, separated control planes</h2></div></div>
      <p>Customers use the normal FleetOS dashboard. Platform owners use <strong>/control</strong>. Resellers use <strong>/reseller</strong>. The routes live in the same application but remain permission-gated by role.</p>
    </section>
  </div>;
}
