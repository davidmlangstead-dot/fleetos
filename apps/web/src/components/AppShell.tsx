import { useEffect, useState } from "react";
import { Bell, ClipboardList, Gauge, Menu, MessageCircle, ShieldCheck, Truck, Users, Wrench, UserRound, Plus, Clock3 } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { api, ACTIVE_WORKSPACE_KEY } from "../lib/api";

const nav = [
  ["/", "Today", Gauge], ["/driver", "Driver Today", Gauge], ["/hours", "Hours Board", Clock3],
  ["/jobs", "Jobs", ClipboardList], ["/vehicles", "Vehicles", Truck], ["/drivers", "Drivers", Users],
  ["/personal", "Personal", UserRound], ["/workshop", "Workshop", Wrench], ["/compliance", "Compliance", ShieldCheck],
  ["/messages", "Messages", MessageCircle],
] as const;
type Workspace = { id: string; name: string; slug: string; role: string };

export function AppShell() {
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  async function load() { const [current, all] = await Promise.all([api<{ id: string; name: string }>("/company"), api<Workspace[]>("/company/workspaces")]); setCompany(current); setWorkspaces(all); }
  useEffect(() => { void load().catch((error) => console.error("FleetOS workspace load failed:", error)); }, []);
  function switchWorkspace(id: string) { localStorage.setItem(ACTIVE_WORKSPACE_KEY, id); window.location.href = "/"; }
  async function addWorkspace() { const name = window.prompt("Company / fleet name"); if (!name?.trim()) return; const created = await api<Workspace>("/company/workspaces", { method: "POST", body: JSON.stringify({ name: name.trim() }) }); switchWorkspace(created.id); }
  const companyName = company?.name ?? "FleetOS"; const initials = companyName.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">F</span><span>FleetOS</span></div><div style={{ padding: "0 12px 14px" }}><select aria-label="Company workspace" value={company?.id ?? ""} onChange={(e) => switchWorkspace(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8 }}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select><button onClick={() => void addWorkspace()} style={{ width: "100%", marginTop: 8 }}><Plus size={15} /> Add company</button></div><nav>{nav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={20} /><span>{label}</span></NavLink>)}</nav><div className="sidebar-bottom"><div className="company-dot">{initials}</div><div><strong>{companyName}</strong><small>Company workspace</small></div></div></aside><main><header className="topbar"><button className="mobile-menu" aria-label="Open navigation"><Menu /></button><div className="presence">{companyName}</div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={20} /></button><button className="avatar" aria-label="Account">{initials || "FO"}</button></div></header><Outlet /></main></div>;
}
