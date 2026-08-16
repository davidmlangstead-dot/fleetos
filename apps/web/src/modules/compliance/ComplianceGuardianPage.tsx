import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, ClipboardCheck, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

type GuardianSeverity = "CRITICAL" | "OVERDUE" | "DUE_SOON" | "MISSING_DATA" | "ATTENTION";

type GuardianAlert = {
  id: string;
  severity: GuardianSeverity;
  kind: string;
  label: string;
  subjectType: string;
  subjectId?: string;
  subjectLabel?: string;
  dueDate?: string;
  daysUntilDue?: number;
  action: string;
  href: string;
};

type Guardian = {
  generatedAt: string;
  company: {
    name: string;
    usesHgv: boolean;
    operatorLicenceNumber: string | null;
    operatorLicenceType: string | null;
    complianceSchemes: string[];
  };
  health: {
    score: number;
    status: "GREEN" | "AMBER" | "RED";
  };
  summary: {
    critical: number;
    overdue: number;
    dueSoon: number;
    missingData: number;
    attention: number;
    openDefects: number;
  };
  alerts: GuardianAlert[];
};

function dueText(alert: GuardianAlert) {
  if (!alert.dueDate) return "No date recorded";
  if (alert.daysUntilDue === undefined) return new Date(alert.dueDate).toLocaleDateString();
  if (alert.daysUntilDue < 0) return `${Math.abs(alert.daysUntilDue)} day${Math.abs(alert.daysUntilDue) === 1 ? "" : "s"} overdue`;
  if (alert.daysUntilDue === 0) return "Due today";
  return `Due in ${alert.daysUntilDue} day${alert.daysUntilDue === 1 ? "" : "s"}`;
}

function severityLabel(severity: GuardianSeverity) {
  if (severity === "MISSING_DATA") return "DATA GAP";
  if (severity === "DUE_SOON") return "DUE SOON";
  return severity;
}

function QueueRow({ alert }: { alert: GuardianAlert }) {
  const urgent = alert.severity === "CRITICAL" || alert.severity === "OVERDUE";
  const Icon = alert.severity === "DUE_SOON" ? CalendarClock : alert.severity === "MISSING_DATA" ? ClipboardCheck : urgent ? ShieldAlert : AlertTriangle;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 12, alignItems: "start", padding: 16, borderTop: "1px solid rgba(148,163,184,.2)" }}>
      <Icon size={20} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong>{alert.label}</strong>
          <span className="subtle" style={{ fontSize: 12, fontWeight: 700 }}>{severityLabel(alert.severity)}</span>
        </div>
        <div className="subtle" style={{ marginTop: 4 }}>{alert.kind.replaceAll("_", " ")} · {dueText(alert)}</div>
        <p style={{ margin: "8px 0 0" }}>{alert.action}</p>
      </div>
      <Link className="secondary-button" to={alert.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", whiteSpace: "nowrap" }}>
        Open <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

function QueueSection({ title, description, items, empty }: { title: string; description: string; items: GuardianAlert[]; empty: string }) {
  return (
    <section className="panel" style={{ overflow: "hidden" }}>
      <div className="panel-heading" style={{ padding: 18 }}>
        <div>
          <h2>{title}</h2>
          <p className="subtle">{description}</p>
        </div>
        <strong>{items.length}</strong>
      </div>
      {items.length ? items.map((alert) => <QueueRow key={alert.id} alert={alert} />) : (
        <div style={{ padding: 26, textAlign: "center" }}>
          <ShieldCheck size={26} aria-hidden="true" />
          <p style={{ marginBottom: 0 }}>{empty}</p>
        </div>
      )}
    </section>
  );
}

export function ComplianceGuardianPage() {
  const [data, setData] = useState<Guardian | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setData(await api<Guardian>("/compliance/guardian"));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Operator Licence Guardian");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const today = data?.alerts.filter((alert) => alert.severity === "CRITICAL" || alert.severity === "OVERDUE" || alert.severity === "ATTENTION") ?? [];
  const next30 = data?.alerts.filter((alert) => alert.severity === "DUE_SOON") ?? [];
  const gaps = data?.alerts.filter((alert) => alert.severity === "MISSING_DATA") ?? [];
  const urgentCount = (data?.summary.critical ?? 0) + (data?.summary.overdue ?? 0);

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operator Licence Guardian</p>
          <h1>Compliance Inbox</h1>
          <p className="subtle">One operational queue for recorded fleet, driver, maintenance, tachograph and defect risks.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" /> {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {error && <div className="panel" style={{ padding: 14, marginBottom: 16 }}><strong>Guardian could not load.</strong> {error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 18 }}>
        <div className="panel" style={{ padding: 18 }}>
          <span className="subtle">Operational health</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><h2 style={{ margin: "6px 0 0" }}>{data?.health.score ?? "—"}</h2><strong>/ 100</strong></div>
          <div className="subtle">{data ? `${data.health.status} record health` : "Checking records"}</div>
        </div>
        <div className="panel" style={{ padding: 18 }}>
          <span className="subtle">Urgent now</span>
          <h2 style={{ margin: "6px 0 0" }}>{urgentCount}</h2>
          <div className="subtle">Critical + overdue</div>
        </div>
        <div className="panel" style={{ padding: 18 }}>
          <span className="subtle">Next 30 days</span>
          <h2 style={{ margin: "6px 0 0" }}>{data?.summary.dueSoon ?? 0}</h2>
          <div className="subtle">Upcoming recorded dates</div>
        </div>
        <div className="panel" style={{ padding: 18 }}>
          <span className="subtle">Data gaps</span>
          <h2 style={{ margin: "6px 0 0" }}>{data?.summary.missingData ?? 0}</h2>
          <div className="subtle">Records needing completion</div>
        </div>
        <div className="panel" style={{ padding: 18 }}>
          <span className="subtle">Open defects</span>
          <h2 style={{ margin: "6px 0 0" }}>{data?.summary.openDefects ?? 0}</h2>
          <div className="subtle">Unresolved defect records</div>
        </div>
      </div>

      <section className="panel" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: 6 }}>Operator record</p>
            <h2 style={{ marginTop: 0 }}>{data?.company.name ?? "Active company"}</h2>
            {data?.company.usesHgv ? (
              <p style={{ marginBottom: 0 }}>
                Operator licence: <strong>{data.company.operatorLicenceNumber || "not recorded"}</strong>{data.company.operatorLicenceType ? ` · ${data.company.operatorLicenceType}` : ""}
              </p>
            ) : <p className="subtle" style={{ marginBottom: 0 }}>HGV operator-licence monitoring is not enabled for this company record.</p>}
          </div>
          <div style={{ maxWidth: 520 }}>
            <strong>What the score means</strong>
            <p className="subtle" style={{ marginBottom: 0 }}>It measures exceptions and record completeness inside FleetOS. It is an operational warning system, not a legal determination that the operator is compliant.</p>
          </div>
        </div>
        {!!data?.company.complianceSchemes.length && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>{data.company.complianceSchemes.map((scheme) => <span key={scheme} className="subtle"><strong>{scheme}</strong></span>)}</div>}
      </section>

      <div style={{ display: "grid", gap: 18 }}>
        <QueueSection title="Do today" description="Critical, overdue and unresolved items that deserve attention first." items={today} empty="No urgent recorded exceptions are currently in the queue." />
        <QueueSection title="Next 30 days" description="Upcoming recorded dates so the office can book work before it becomes overdue." items={next30} empty="Nothing recorded is due within the next 30 days." />
        <QueueSection title="Complete the record" description="Missing dates or schedules that stop FleetOS from monitoring the operation properly." items={gaps} empty="No monitored record gaps were found." />
      </div>

      {data?.generatedAt && <p className="subtle" style={{ marginTop: 16 }}>Last checked {new Date(data.generatedAt).toLocaleString()}.</p>}
    </section>
  );
}
