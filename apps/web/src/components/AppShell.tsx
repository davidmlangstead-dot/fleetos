import { useEffect, useMemo, useState } from "react";
import { Bell, Building2, ClipboardList, Gauge, History, MapPin, Menu, MessageCircle, ShieldCheck, Truck, Users, Wrench, UserRound, Plus, Clock3, Stethoscope } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { api, ACTIVE_WORKSPACE_KEY } from "../lib/api";

type Role = "DRIVER" | "WORKSHOP_TECHNICIAN" | "TRANSPORT_PLANNER" | "TRANSPORT_MANAGER" | "OFFICE_STAFF" | "FINANCE" | "COMPANY_ADMIN" | "PLATFORM_ADMIN";
type Workspace = { id: string; name: string; slug: string; role: Role };
type NavItem = readonly [string, string, typeof Gauge, readonly Role[]];

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

export function AppShell() {
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const activeWorkspace = useMemo(() => workspaces.find((item) => item.id === company?.id) ?? null, [workspaces, company]);
  const visibleNav = useMemo(() => nav.filter(([, , , roles]) => activeWorkspace ? roles.includes(activeWorkspace.role) : false), [activeWorkspace]);

  async function load() {
    const [current, all] = await Promise.all([api<{ id: string; name: string }>("/company"), api<Workspace[]>("/company/workspaces")]);
    setCompany(current); setWorkspaces(all);
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

  return <div className="app-shell"><aside className="sidebar">
    <div className="brand"><span className="brand-mark">F</span><span>FleetOS</span></div>
    <div style={{ padding: "0 12px 14px" }}>
      <select aria-label="Company workspace" value={company?.id ?? ""} onChange={(e) => switchWorkspace(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8 }}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
      {role !== "DRIVER" && <button onClick={() => void addWorkspace()} style={{ width: "100%", marginTop: 8 }}><Plus size={15} /> Add company</button>}
    </div>
    <nav>{visibleNav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="company-dot">{initials}</div><div><strong>{companyName}</strong><small>{role ? roleLabels[role] : "Company workspace"}</small></div></div>
  </aside><main><header className="topbar"><button className="mobile-menu" aria-label="Open navigation"><Menu /></button><div className="presence">{companyName}{role ? ` · ${roleLabels[role]}` : ""}</div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={20} /></button><button className="avatar" aria-label="Account">{initials || "FO"}</button></div></header><Outlet /></main></div>;
}
