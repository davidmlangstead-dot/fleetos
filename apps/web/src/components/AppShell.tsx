import { useEffect, useState } from "react";
import { Bell, ClipboardList, Gauge, Menu, MessageCircle, ShieldCheck, Truck, Users, Wrench, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../lib/api";

const nav = [
  ["/", "Today", Gauge],
  ["/jobs", "Jobs", ClipboardList],
  ["/vehicles", "Vehicles", Truck],
  ["/drivers", "Drivers", Users],
  ["/personal", "Personal", UserRound],
  ["/workshop", "Workshop", Wrench],
  ["/compliance", "Compliance", ShieldCheck],
  ["/messages", "Messages", MessageCircle],
] as const;

export function AppShell() {
  const [company, setCompany] = useState<{ name: string } | null>(null);

  useEffect(() => {
    void api<{ name: string }>("/company")
      .then(setCompany)
      .catch((error) => console.error("FleetOS company load failed:", error));
  }, []);

  const companyName = company?.name ?? "Your company";
  const initials = companyName.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">F</span><span>FleetOS</span></div>
        <nav>{nav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
        <div className="sidebar-bottom"><div className="company-dot">{initials}</div><div><strong>{companyName}</strong><small>Company workspace</small></div></div>
      </aside>
      <main>
        <header className="topbar"><button className="mobile-menu" aria-label="Open navigation"><Menu /></button><div className="presence">FleetOS workspace</div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={20} /></button><button className="avatar" aria-label="Account">DM</button></div></header>
        <Outlet />
      </main>
    </div>
  );
}
