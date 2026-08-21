import { useEffect, useMemo, useState } from "react";
import { Bell, Building2, ClipboardList, Clock3, Gauge, History, LogOut, MapPin, Menu, MessageCircle, Plus, ShieldAlert, ShieldCheck, Truck, UserRound, Users, Wrench, X } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api, ACTIVE_WORKSPACE_KEY } from "../lib/api";
import { OfflineStatus } from "./OfflineStatus";
import { BrandLogo, PoweredBy, useBranding } from "../lib/branding";
import { useI18n } from "../lib/i18n";
import { signOutCurrentDevice } from "../lib/session";

type Role = "DRIVER" | "WORKSHOP_TECHNICIAN" | "TRANSPORT_PLANNER" | "TRANSPORT_MANAGER" | "OFFICE_STAFF" | "FINANCE" | "COMPANY_ADMIN" | "PLATFORM_ADMIN";
type Workspace = { id: string; name: string; slug: string; role: Role };
type NavItem = readonly [string, string, typeof Gauge, readonly Role[]];
type AlertItem = { id: string; kind: "COMPLIANCE" | "DEFECT" | "MAINTENANCE" | "MEDIC" | "DRIVER" | "JOB" | "TACHOGRAPH"; severity: "INFO" | "WARNING" | "CRITICAL"; title: string; detail: string | null; occurredAt: string; href: string };
type AlertFeed = { total: number; critical: number; items: AlertItem[] };
type PlatformIdentity = { isPlatformOwner: boolean };
type ResellerMembership = { id: string; role: string };

const OWNER_HOST = "fleetos-davidmlangstead-dots-projects.vercel.app";
const RESELLER_HOST = "fleetos-git-main-davidmlangstead-dots-projects.vercel.app";
const management: readonly Role[] = ["TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const workshop: readonly Role[] = ["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const vehicleReaders: readonly Role[] = ["WORKSHOP_TECHNICIAN", ...management];
const peopleManagers: readonly Role[] = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const companyManagers: readonly Role[] = ["TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const registerUsers: readonly Role[] = ["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const tachographUsers: readonly Role[] = ["WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const everyone: readonly Role[] = ["DRIVER", "WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "FINANCE", "COMPANY_ADMIN", "PLATFORM_ADMIN"];
const driverAppUsers: readonly Role[] = ["DRIVER", "WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN"];

const officeNav: readonly NavItem[] = [
  ["/", "Today", Gauge, management],
  ["/hours", "Hours Board", Clock3, management],
  ["/tachograph", "Tacho", Clock3, tachographUsers],
  ["/jobs", "Jobs", ClipboardList, management],
  ["/messages", "Messages", MessageCircle, everyone],
  ["/vehicles", "Vehicles", Truck, vehicleReaders],
  ["/personal", "Staff", Users, peopleManagers],
  ["/workshop", "Workshop", Wrench, workshop],
  ["/driver-operations", "Checks & Breakdowns", ShieldAlert, management],
  ["/compliance", "Compliance", ShieldCheck, vehicleReaders],
  ["/settings/company", "Settings", Building2, companyManagers],
  ["/settings/audit", "Audit Trail", History, companyManagers],
  ["/organisation/depots", "Depots & Sites", MapPin, companyManagers],
] as const;

const driverNav: readonly NavItem[] = [
  ["/driver", "Today", Gauge, ["DRIVER"]],
  ["/driver/tachograph", "My Tacho", Clock3, ["DRIVER"]],
  ["/my-work", "My Work", ClipboardList, ["DRIVER"]],
  ["/messages", "Messages", MessageCircle, ["DRIVER"]],
] as const;

const roleLabels: Record<Role, string> = {
  DRIVER: "Driver", WORKSHOP_TECHNICIAN: "Workshop", TRANSPORT_PLANNER: "Transport planner",
  TRANSPORT_MANAGER: "Transport manager", OFFICE_STAFF: "Office", FINANCE: "Finance",
  COMPANY_ADMIN: "Company admin", PLATFORM_ADMIN: "Platform admin",
};

function routeRoles(pathname: string) {
  if (pathname.startsWith("/control") || pathname.startsWith("/reseller")) return null;
  if (pathname.startsWith("/registers/")) return registerUsers;
  if (pathname === "/settings/security" || pathname === "/settings/accessibility") return everyone;
  if (pathname === "/driver" || pathname === "/driver/tachograph" || pathname === "/my-work") return driverAppUsers;
  const allNav = [...officeNav, ...driverNav];
  return allNav.find(([path]) => path === pathname)?.[3] ?? null;
}

export function AppShell() {
  const { branding } = useBranding();
  const { t } = useI18n();
  const location = useLocation();
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [platformOwner, setPlatformOwner] = useState(false);
  const [resellerAccess, setResellerAccess] = useState(false);
  const [alerts, setAlerts] = useState<AlertFeed>({ total: 0, critical: 0, items: [] });
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const activeWorkspace = useMemo(() => workspaces.find((item) => item.id === company?.id) ?? null, [workspaces, company]);
  const visibleNav = useMemo(() => {
    if (!activeWorkspace) return [];
    const source = activeWorkspace.role === "DRIVER" ? driverNav : officeNav;
    return source.filter(([, , , roles]) => roles.includes(activeWorkspace.role));
  }, [activeWorkspace]);

  async function load() {
    const [platform, resellerMemberships] = await Promise.all([
      api<PlatformIdentity>("/platform/me"),
      api<ResellerMembership[]>("/resellers/mine"),
    ]);
    setPlatformOwner(platform.isPlatformOwner);
    setResellerAccess(resellerMemberships.length > 0);

    try {
      const [current, all] = await Promise.all([
        api<{ id: string; name: string }>("/company"),
        api<Workspace[]>("/company/workspaces"),
      ]);
      setCompany(current);
      setWorkspaces(all);
      if (!localStorage.getItem(ACTIVE_WORKSPACE_KEY)) localStorage.setItem(ACTIVE_WORKSPACE_KEY, current.id);
      try { setAlerts(await api<AlertFeed>("/notifications")); } catch { setAlerts({ total: 0, critical: 0, items: [] }); }
    } catch {
      setCompany(null);
      setWorkspaces([]);
      setAlerts({ total: 0, critical: 0, items: [] });
    }
  }

  useEffect(() => { void load().catch((error) => console.error("Rivetway identity load failed:", error)); }, []);

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

  const companyName = company?.name ?? (resellerAccess ? "Reseller portal" : branding.name);
  const initials = companyName.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  const role = activeWorkspace?.role;
  const allowedRoles = routeRoles(location.pathname);
  const ownerRoute = location.pathname === "/control" || location.pathname.startsWith("/control/");
  const resellerJoinRoute = location.pathname.startsWith("/reseller/join");
  const resellerRoute = !resellerJoinRoute && (location.pathname === "/reseller" || location.pathname.startsWith("/reseller/"));
  const onOwnerHost = window.location.hostname === OWNER_HOST;
  const onResellerHost = window.location.hostname === RESELLER_HOST;
  const inDriverMode = location.pathname === "/driver" || location.pathname.startsWith("/driver/") || location.pathname === "/my-work";
  const canUseDriverMode = !!role && role !== "DRIVER" && driverAppUsers.includes(role);
  const accessDenied = ownerRoute
    ? !(onOwnerHost && platformOwner)
    : resellerRoute
      ? !(onResellerHost && (platformOwner || resellerAccess))
      : !!role && !!allowedRoles && !allowedRoles.includes(role);

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="brand"><BrandLogo /><button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X /></button></div>
      {workspaces.length > 0 && <div style={{ padding: "0 12px 14px" }}>
        <select aria-label="Company workspace" value={company?.id ?? ""} onChange={(event) => switchWorkspace(event.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8 }}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
        {role !== "DRIVER" && <button onClick={() => void addWorkspace()} style={{ width: "100%", marginTop: 8 }}><Plus size={15} /> Add company</button>}
      </div>}
      <nav>
        {visibleNav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/" || to === "/driver"} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={20} /><span>{to === "/messages" ? t("nav.messages") : label}</span></NavLink>)}
        {!company && resellerAccess && onResellerHost && <NavLink to="/reseller" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Building2 size={20}/><span>Reseller Portal</span></NavLink>}
      </nav>
      <div className="sidebar-bottom"><div className="company-dot">{initials}</div><div><strong>{companyName}</strong><small>{role ? roleLabels[role] : resellerAccess ? "Reseller account" : platformOwner ? "Rivetway owner" : "Account"}</small><PoweredBy /></div></div>
    </aside>
    {mobileOpen && <button className="mobile-overlay" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main>
      <header className="topbar">
        <button className="mobile-menu" aria-label={t("shell.openNav")} onClick={() => setMobileOpen(true)}><Menu /></button>
        <div className="presence">{companyName}{role ? ` · ${roleLabels[role]}` : ""}</div>
        <div className="top-actions" style={{ position: "relative" }}>
          <OfflineStatus />
          {company && <button className="icon-button" aria-label={`Notifications${alerts.total ? ` (${alerts.total})` : ""}`} onClick={() => { setAccountOpen(false); setAlertsOpen((open) => !open); }} style={{ position: "relative" }}><Bell size={20} />{alerts.total > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, padding: "0 4px", fontSize: 10, lineHeight: "17px", background: alerts.critical > 0 ? "#b91c1c" : "#334155", color: "white" }}>{Math.min(alerts.total, 99)}</span>}</button>}
          {alertsOpen && <div style={{ position: "absolute", right: 44, top: 42, width: 340, maxWidth: "85vw", maxHeight: 430, overflowY: "auto", background: "white", color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 18px 45px rgba(15,23,42,.18)", zIndex: 50, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px 10px" }}><strong>Fleet alerts</strong><small>{alerts.total ? `${alerts.total} active` : "All clear"}</small></div>
            {alerts.items.length === 0 ? <p style={{ margin: 8, color: "#64748b" }}>No active alerts for your role.</p> : alerts.items.map((item) => <button key={item.id} onClick={() => { setAlertsOpen(false); window.location.href = item.href; }} style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderTop: "1px solid #f1f5f9", background: "transparent", padding: "10px 8px", cursor: "pointer" }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: item.severity === "CRITICAL" ? "#b91c1c" : "#a16207" }}>{item.severity}</span><strong style={{ fontSize: 13 }}>{item.title}</strong></div>{item.detail && <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>{item.detail}</div>}</button>)}
          </div>}
          <button className="avatar" aria-label="Account menu" aria-expanded={accountOpen} onClick={() => { setAlertsOpen(false); setAccountOpen((open) => !open); }}>{initials || "RW"}</button>
          {accountOpen && <div className="account-menu">
            {canUseDriverMode && <button onClick={() => { setAccountOpen(false); window.location.href = inDriverMode ? "/" : "/driver"; }}><Truck size={16} /> {inDriverMode ? "Back to office" : "Driver mode"}</button>}
            {role && companyManagers.includes(role) && <button onClick={() => { setAccountOpen(false); window.location.href = "/settings/company"; }}><Building2 size={16} /> {t("shell.companySettings")}</button>}
            <button onClick={() => { setAccountOpen(false); window.location.href = "/settings/security"; }}><ShieldCheck size={16} /> Security & sign-in</button>
            <button onClick={() => { setAccountOpen(false); window.location.href = "/settings/accessibility"; }}><UserRound size={16} /> {t("shell.accessibility")}</button>
            <button onClick={() => { setAccountOpen(false); void signOutCurrentDevice(); }}><LogOut size={16} /> {t("shell.signOut")}</button>
          </div>}
        </div>
      </header>
      {accessDenied ? <main className="loading-page"><div><h1>{t("shell.accessDenied")}</h1><p>{t("shell.accessDeniedDetail")}</p><button onClick={() => { window.location.href = role === "DRIVER" ? "/driver" : resellerAccess && !company && onResellerHost ? "/reseller" : "/"; }}>{t("shell.return")}</button></div></main> : <Outlet />}
    </main>
  </div>;
}

