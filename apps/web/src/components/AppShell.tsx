import { useEffect, useState } from "react";
import { Bell, ClipboardList, Gauge, Menu, MessageCircle, ShieldCheck, Truck, Users, Wrench } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";

const nav = [
  ["/", "Today", Gauge],
  ["/jobs", "Jobs", ClipboardList],
  ["/vehicles", "Vehicles", Truck],
  ["/drivers", "Drivers", Users],
  ["/workshop", "Workshop", Wrench],
  ["/compliance", "Compliance", ShieldCheck],
  ["/messages", "Messages", MessageCircle],
] as const;

export function AppShell() {
  const [company, setCompany] = useState<{ name: string } | null>(null);

  useEffect(() => {
    async function loadCompany() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const { data } = await supabase
        .from("companies")
        .select("name")
        .eq("owner_id", userId)
        .maybeSingle();
      if (data) setCompany(data);
    }
    void loadCompany();
  }, []);

  const companyName = company?.name ?? "Your Company";
  const initials = companyName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">F</span>
          <span>FleetOS</span>
        </div>
        <nav>
          {nav.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="company-dot">{initials}</div>
          <div>
            <strong>{companyName}</strong>
            <small>Transport Manager</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation">
            <Menu />
          </button>
          <div className="presence">
            <span className="online-dot" />
            All systems operational
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications">
              <Bell size={20} />
            </button>
            <button className="avatar">DM</button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}