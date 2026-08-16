import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, ClipboardList, FileText, Gauge, ShieldCheck, UserRound, Wrench } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";

type PassportEvent = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string;
  status?: string;
  href?: string;
};

type VehiclePassport = {
  vehicle: {
    id: string;
    registration: string;
    fleetNumber?: string | null;
    vin?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    type: string;
    status: string;
    mileage?: number | null;
    fuelType?: string | null;
    colour?: string | null;
    depot?: string | null;
  };
  summary: {
    completeness: number;
    documents: number;
    defects: number;
    openDefects: number;
    jobs: number;
    complianceItems: number;
    maintenancePlans: number;
    workOrders: number;
  };
  current: {
    motDue?: string | null;
    taxDue?: string | null;
    insuranceDue?: string | null;
    tachoCalibrationDue?: string | null;
  };
  timeline: PassportEvent[];
};

type DriverPassport = {
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    licenceNumber?: string | null;
    tachoCardNumber?: string | null;
    isActive: boolean;
  };
  summary: {
    completeness: number;
    documents: number;
    jobs: number;
    complianceItems: number;
    tachographDownloads: number;
  };
  current: {
    licenceExpiry?: string | null;
    cpcExpiry?: string | null;
    tachoCardExpiry?: string | null;
    medicalDue?: string | null;
    nextTachographDownload?: string | null;
  };
  timeline: PassportEvent[];
};

function displayDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Not recorded";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="panel" style={{ padding: 16 }}><span className="subtle">{label}</span><h2 style={{ margin: "6px 0 0" }}>{value}</h2></div>;
}

function RecordDate({ label, value }: { label: string; value?: string | null }) {
  return <div style={{ padding: "12px 0", borderTop: "1px solid rgba(148,163,184,.2)" }}><div className="subtle">{label}</div><strong>{displayDate(value)}</strong></div>;
}

function Timeline({ events }: { events: PassportEvent[] }) {
  if (!events.length) return <div className="empty-state"><h2>No history recorded yet</h2><p>The passport will grow automatically as FleetOS records work, documents and compliance events.</p></div>;
  return <div>{events.map((item, index) => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "112px minmax(0,1fr) auto", gap: 14, padding: 14, borderTop: index ? "1px solid rgba(148,163,184,.2)" : "none", alignItems: "start" }}><div className="subtle">{new Date(item.at).toLocaleDateString()}<br/><small>{item.kind.replaceAll("_", " ")}</small></div><div><strong>{item.title}</strong>{item.detail && <p className="subtle" style={{ margin: "4px 0 0" }}>{item.detail}</p>}</div><div style={{ display: "flex", gap: 8, alignItems: "center" }}>{item.status && <span className="subtle"><strong>{item.status.replaceAll("_", " ")}</strong></span>}{item.href && <Link className="secondary-button" to={item.href} style={{ textDecoration: "none" }}>Open</Link>}</div></div>)}</div>;
}

function PassportHeader({ eyebrow, title, subtitle, backTo }: { eyebrow: string; title: string; subtitle: string; backTo: string }) {
  return <div className="page-heading"><div><Link to={backTo} className="subtle" style={{ display: "inline-flex", gap: 6, alignItems: "center", textDecoration: "none", marginBottom: 8 }}><ArrowLeft size={16}/> Back</Link><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtle">{subtitle}</p></div></div>;
}

export function VehiclePassportPage() {
  const { id } = useParams();
  const [data, setData] = useState<VehiclePassport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!id) return; void api<VehiclePassport>(`/passports/vehicle/${id}`).then(setData).catch((err) => setError(err instanceof Error ? err.message : "Could not load vehicle passport")); }, [id]);
  if (error) return <section className="page"><PassportHeader eyebrow="Fleet Passport" title="Vehicle passport unavailable" subtitle={error} backTo="/vehicles" /></section>;
  if (!data) return <section className="page"><PassportHeader eyebrow="Fleet Passport" title="Loading vehicle passport" subtitle="Collecting the vehicle's connected FleetOS history." backTo="/vehicles" /></section>;
  const v = data.vehicle;
  return <section className="page">
    <PassportHeader eyebrow="Fleet Passport" title={v.registration} subtitle={`${v.make || "Make not recorded"} ${v.model || ""} · ${v.type.replaceAll("_", " ")} · ${v.status.replaceAll("_", " ")}`} backTo="/vehicles" />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}><Stat label="Record completeness" value={`${data.summary.completeness}%`} /><Stat label="Jobs" value={data.summary.jobs}/><Stat label="Documents" value={data.summary.documents}/><Stat label="Open defects" value={data.summary.openDefects}/><Stat label="Work orders" value={data.summary.workOrders}/></div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(260px,.6fr)", gap: 18, alignItems: "start" }}>
      <section className="panel"><div className="panel-heading" style={{ padding: 18 }}><div><p className="eyebrow">Permanent history</p><h2>Vehicle timeline</h2><p className="subtle">Generated from connected records; FleetOS does not invent missing events.</p></div><ClipboardList size={22}/></div><Timeline events={data.timeline}/></section>
      <div style={{ display: "grid", gap: 18 }}>
        <section className="panel" style={{ padding: 18 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={20}/><h2 style={{ margin: 0 }}>Current dates</h2></div><RecordDate label="MOT / annual test" value={data.current.motDue}/><RecordDate label="Tax" value={data.current.taxDue}/><RecordDate label="Insurance" value={data.current.insuranceDue}/><RecordDate label="Tachograph calibration" value={data.current.tachoCalibrationDue}/></section>
        <section className="panel" style={{ padding: 18 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Gauge size={20}/><h2 style={{ margin: 0 }}>Vehicle identity</h2></div><p><strong>Fleet no.</strong><br/><span className="subtle">{v.fleetNumber || "Not recorded"}</span></p><p><strong>VIN</strong><br/><span className="subtle">{v.vin || "Not recorded"}</span></p><p><strong>Mileage</strong><br/><span className="subtle">{v.mileage?.toLocaleString() || "Not recorded"}</span></p><p style={{ marginBottom: 0 }}><strong>Depot</strong><br/><span className="subtle">{v.depot || "Not recorded"}</span></p></section>
      </div>
    </div>
  </section>;
}

export function DriverPassportPage() {
  const { id } = useParams();
  const [data, setData] = useState<DriverPassport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!id) return; void api<DriverPassport>(`/passports/driver/${id}`).then(setData).catch((err) => setError(err instanceof Error ? err.message : "Could not load driver passport")); }, [id]);
  if (error) return <section className="page"><PassportHeader eyebrow="Driver Passport" title="Driver passport unavailable" subtitle={error} backTo="/drivers" /></section>;
  if (!data) return <section className="page"><PassportHeader eyebrow="Driver Passport" title="Loading driver passport" subtitle="Collecting the driver's connected FleetOS history." backTo="/drivers" /></section>;
  const d = data.driver;
  const name = `${d.firstName} ${d.lastName}`;
  return <section className="page">
    <PassportHeader eyebrow="Driver Passport" title={name} subtitle={`${d.isActive ? "Active" : "Inactive"} driver · operational credentials and FleetOS history`} backTo="/drivers" />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}><Stat label="Record completeness" value={`${data.summary.completeness}%`} /><Stat label="Jobs" value={data.summary.jobs}/><Stat label="Documents" value={data.summary.documents}/><Stat label="Compliance records" value={data.summary.complianceItems}/><Stat label="Tacho downloads" value={data.summary.tachographDownloads}/></div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(260px,.6fr)", gap: 18, alignItems: "start" }}>
      <section className="panel"><div className="panel-heading" style={{ padding: 18 }}><div><p className="eyebrow">Operational history</p><h2>Driver timeline</h2><p className="subtle">Only records held by this company are shown.</p></div><CalendarDays size={22}/></div><Timeline events={data.timeline}/></section>
      <div style={{ display: "grid", gap: 18 }}>
        <section className="panel" style={{ padding: 18 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={20}/><h2 style={{ margin: 0 }}>Current credentials</h2></div><RecordDate label="Driving licence" value={data.current.licenceExpiry}/><RecordDate label="Driver CPC" value={data.current.cpcExpiry}/><RecordDate label="Tachograph card" value={data.current.tachoCardExpiry}/><RecordDate label="Medical" value={data.current.medicalDue}/><RecordDate label="Next tacho download" value={data.current.nextTachographDownload}/></section>
        <section className="panel" style={{ padding: 18 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><UserRound size={20}/><h2 style={{ margin: 0 }}>Driver identity</h2></div><p><strong>Licence</strong><br/><span className="subtle">{d.licenceNumber || "Not recorded"}</span></p><p><strong>Tacho card</strong><br/><span className="subtle">{d.tachoCardNumber || "Not recorded"}</span></p><p><strong>Email</strong><br/><span className="subtle">{d.email || "Not recorded"}</span></p><p style={{ marginBottom: 0 }}><strong>Phone</strong><br/><span className="subtle">{d.phone || "Not recorded"}</span></p></section>
      </div>
    </div>
  </section>;
}
