import { useEffect, useMemo, useState } from "react";
import { Bell, Building2, ClipboardList, Gauge, History, MapPin, Menu, MessageCircle, ShieldCheck, Truck, Users, Wrench, UserRound, Plus, Clock3, Stethoscope } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api, ACTIVE_WORKSPACE_KEY } from "../lib/api";

type Role = "DRIVER" | "WORKSHOP_TECHNICIAN" | "TRANSPORT_PLANNER" | "TRANSPORT_MANAGER" | "OFFICE_STAFF" | "FINANCE" | "COMPANY_ADMIN" | "PLATFORM_ADMIN";
type Workspace = { id: string; name: string; slug: string; role: Role };
type NavItem = readonly [string, string, typeof Gauge, readonly Role[]];
type AlertItem = { id: string; kind: "COMPLIANCE" | "DEFECT" | "MEDIC"; severity: "INFO" | "WARNING" | "CRITICAL"; title: string; detail: string | null; occurredAt: string; href: string };
type AlertFeed = { total: number; critical: number; items: AlertItem[] };

const management: readonly Role[] = ["TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const workshop: readonly Role[] = ["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const vehicleReaders: readonly Role[] = ["WORKSHOP_TECHNICIAN", ...management];
const peopleManagers: readonly Role[] = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const companyManagers: readonly Role[] = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const registerUsers: readonly Role[] = ["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const documentUsers: readonly Role[] = ["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const reportUsers: readonly Role[] = ["TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const marketplaceUsers: readonly Role[] = ["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const everyone: readonly Role[] = ["DRIVER", "WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN"];

const nav: readonly NavItem[] = [
  ["/", "Today", Gauge, management],
  ["/driver", "Driver Today", Gauge, ["DRIVER"]],
  ["/hours", "Hours Board", Clock3, management],
  ["/jobs", "Jobs", ClipboardList, management],
  ["/vehicles", "Vehicles", Truck, vehicleReaders],
  ["/drivers", "Drivers", Users, management],
  ["/personal", "Personal", UserRound, peopleManagers],
  ["/workshop", "Workshop", Wrench, workshop],
  ["/compliance", "Compliance", ShieldCheck, vehicleReaders],
  ["/documents", "Documents", ClipboardList, documentUsers],
  ["/registers", "Registers", ClipboardList, registerUsers],
  ["/reports", "Reports", Gauge, reportUsers],
  ["/marketplace", "Marketplace", MessageCircle, marketplaceUsers],
  ["/organisation/depots", "Depots & Sites", MapPin, companyManagers],
  ["/settings/company", "Company Settings", Building2, companyManagers],
  ["/settings/audit", "Audit Trail", History, companyManagers],
  ["/settings/medic", "FleetOS Medic", Stethoscope, companyManagers],
  ["/messages", "Messages", MessageCircle, everyone],
] as const;

const roleLabels: Record<Role,string> = {
  DRIVER: "Driver", WORKSHOP_TECHNICIAN: "Workshop", TRANSPORT_PLANNER: "Transport planner",
  TRANSPORT_MANAGER: "Transport manager", OFFICE_STAFF: "Office", FINANCE: "Finance",
  COMPANY_ADMIN: "Company admin", PLATFORM_ADMIN: "Platform admin",
};

function routeRoles(pathname: string) {
  if (pathname.startsWith("/registers/")) return registerUsers;
  const exact = nav.find(([path]) => path === pathname);
  return exact?.[3] ?? null;
}

export function AppShell() {
  const location = useLocation();
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [alerts, setAlerts] = useState<AlertFeed>({ total: 0, critical: 0, items: [] });
  const [alertsOpen, setAlertsOpen] = useState(false);
  const activeWorkspace = useMemo(() => workspaces.find((item) => item.id === company?.id) ?? null, [workspaces, company]);
  const visibleNav = useMemo(() => nav.filter(([, , , roles]) => activeWorkspace ? roles.includes(activeWorkspace.role) : false), [activeWorkspace]);

  async function load() {
    const [current, all] = await Promise.all([api<{ id: string; name: string }>("/company"), api<Workspace[]>("/company/workspaces")]);
    setCompany(current);
    setWorkspaces(all);
    if (!localStorage.getItem(ACTIVE_WORKSPACE_KEY)) localStorage.setItem(ACTIVE_WORKSPACE_KEY, current.id);
    const feed = await api<AlertFeed>("/notifications");
    setAlerts(feed);
  }
  useEffect(() => { void load().catch((error) => console.error("FleetOS workspace load failed:", error)); }, []);

  function switchWorkspace(id: string) {
    const selected = workspaces.find((item) => item.id === id);
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
    window.location.href = selected?.role === "DRIVER" ? "/driver" : "/";
  }
  async function addWorkspace() {
    const name = window.prompt("Company / fleet name");
    if (!name?.trim()) return;
    const created = await api<Workspace>("/company/workspaces", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
    switchWorkspace(created.id);
  }

  const companyName = company?.name ?? "FleetOS";
  const initials = companyName.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  const role = activeWorkspace?.role;
  const allowedRoles = routeRoles(location.pathname);
  const accessDenied = !!role && !!allowedRoles && !allowedRoles.includes(role);

  return <div className="app-shell"><aside className="sidebar">
    <div className="brand"><span className="brand-mark">F</span><span>FleetOS</span></div>
    <div style={{ padding: "0 12px 14px" }}>
      <select aria-label="Company workspace" value={company?.id ?? ""} onChange={(e) => switchWorkspace(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8 }}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
      {role !== "DRIVER" && <button onClick={() => void addWorkspace()} style={{ width: "100%", marginTop: 8 }}><Plus size={15} /> Add company</button>}
    </div>
    <nav>{visibleNav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="company-dot">{initials}</div><div><strong>{companyName}</strong><small>{role ? roleLabels[role] : "Company workspace"}</small></div></div>
  </aside><main><header className="topbar"><button className="mobile-menu" aria-label="Open navigation"><Menu /></button><div className="presence">{companyName}{role ? ` · ${roleLabels[role]}` : ""}</div><div className="top-actions" style={{ position: "relative" }}><button className="icon-button" aria-label={`Notifications${alerts.total ? ` (${alerts.total})` : ""}`} onClick={() => setAlertsOpen((open) => !open)} style={{ position: "relative" }}><Bell size={20} />{alerts.total > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, padding: "0 4px", fontSize: 10, lineHeight: "17px", background: alerts.critical > 0 ? "#b91c1c" : "#334155", color: "white" }}>{Math.min(alerts.total, 99)}</span>}</button>{alertsOpen && <div style={{ position: "absolute", right: 44, top: 42, width: 340, maxWidth: "85vw", maxHeight: 430, overflowY: "auto", background: "white", color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 18px 45px rgba(15,23,42,.18)", zIndex: 50, padding: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px 10px" }}><strong>Fleet alerts</strong><small>{alerts.total ? `${alerts.total} active` : "All clear"}</small></div>{alerts.items.length === 0 ? <p style={{ margin: 8, color: "#64748b" }}>No active alerts for your role.</p> : alerts.items.map((item) => <button key={item.id} onClick={() => { setAlertsOpen(false); window.location.href = item.href; }} style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderTop: "1px solid #f1f5f9", background: "transparent", padding: "10px 8px", cursor: "pointer" }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: item.severity === "CRITICAL" ? "#b91c1c" : "#a16207" }}>{item.severity}</span><strong style={{ fontSize: 13 }}>{item.title}</strong></div>{item.detail && <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>{item.detail}</div>}</button>)}</div>}<button className="avatar" aria-label="Account">{initials || "FO"}</button></div></header>{accessDenied ? <main className="loading-page"><div><h1>Access denied</h1><p>Your role does not have access to this FleetOS area.</p><button onClick={() => { window.location.href = role === "DRIVER" ? "/driver" : "/"; }}>Return to your dashboard</button></div></main> : <Outlet />}</main></div>;
}
