export function AccountsPage() {
  return <div className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">Operational accounts</p><h1>Accounts</h1><p>Run the commercial records inside FleetOS, then hand clean accountant-ready records to the finance team or accounting package.</p></div></div>
    <div className="action-grid">
      <article className="action-card"><strong>Quotes & invoices</strong><span>Prepare customer quotes, invoices and credit notes linked to jobs.</span></article>
      <article className="action-card"><strong>Purchases & expenses</strong><span>Capture supplier invoices, driver expenses, fuel, repairs, parts and workshop spend.</span></article>
      <article className="action-card"><strong>Payments & debtors</strong><span>Track what has been paid, what is outstanding and customer balances.</span></article>
      <article className="action-card"><strong>Job & vehicle costing</strong><span>Allocate income and expenditure to the work and vehicles that created it.</span></article>
      <article className="action-card"><strong>Supporting evidence</strong><span>Keep receipts, invoices and supporting documents attached to the commercial record.</span></article>
      <article className="action-card"><strong>Accounts handover</strong><span>Prepare sales, purchases, VAT breakdowns, balances, payments and audit data for export.</span></article>
    </div>
    <section className="dashboard-section"><p className="eyebrow">Boundary</p><h2>Accountant-ready, not direct HMRC filing</h2><p>This area is designed as the operational finance layer. The statutory accounting package or accounts team remains responsible for reconciliation, final accounts and HMRC-facing submissions.</p></section>
  </div>;
}
