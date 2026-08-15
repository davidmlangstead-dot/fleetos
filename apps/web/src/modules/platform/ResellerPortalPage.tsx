export function ResellerPortalPage() {
  return <div className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">White label</p><h1>Reseller Portal</h1><p>Agent-facing control for branded customer fleets without exposing FleetOS platform administration.</p></div></div>
    <div className="action-grid">
      <article className="action-card"><strong>Customer companies</strong><span>Create and manage the companies sold through this reseller account.</span></article>
      <article className="action-card"><strong>Branding</strong><span>Product name, logo, colours, support details and approved white-label presentation.</span></article>
      <article className="action-card"><strong>Trials & packages</strong><span>Start approved trials and assign packages within platform-set limits.</span></article>
      <article className="action-card"><strong>Wholesale billing</strong><span>Track the reseller wholesale amount separately from the end-customer retail price.</span></article>
    </div>
    <section className="dashboard-section">
      <p className="eyebrow">Permission boundary</p><h2>What resellers cannot change</h2>
      <p>Security policy, tenant isolation, database rules, platform legal controls, core audit behaviour, infrastructure and master billing configuration stay under the FleetOS platform owner.</p>
    </section>
  </div>;
}
