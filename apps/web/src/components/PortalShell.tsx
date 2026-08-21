import { Building2, CircleDollarSign, Gauge, LogOut, Palette, Store, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { signOutCurrentDevice } from "../lib/session";

type NavItem = readonly [string, string, typeof Gauge];

const managerNav: readonly NavItem[] = [
  ["/", "Overview", Gauge],
  ["/customers", "Customers", Building2],
  ["/resellers", "Resellers", Store],
  ["/money", "Money", CircleDollarSign],
] as const;

const resellerNav: readonly NavItem[] = [
  ["/", "Portfolio", Users],
  ["/branding", "Branding", Palette],
] as const;

function PortalShell({ title, subtitle, nav }: { title: string; subtitle: string; nav: readonly NavItem[] }) {
  return <div className="app-shell portal-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">FO</span><span>{title}</span></div>
      <div style={{padding:"0 18px 18px",color:"rgba(255,255,255,.68)",fontSize:12,lineHeight:1.45}}>{subtitle}</div>
      <nav>{nav.map(([to,label,Icon])=><NavLink key={to} to={to} end={to==="/"} className={({isActive})=>`nav-item ${isActive?"active":""}`}><Icon size={20}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="company-dot">FO</div><div><strong>{title}</strong><small>{subtitle}</small></div></div>
    </aside>
    <main>
      <header className="topbar"><div className="presence">{title}</div><div className="top-actions"><button className="secondary-button" onClick={()=>void signOutCurrentDevice()}><LogOut size={16}/> Sign out</button></div></header>
      <Outlet />
    </main>
  </div>;
}

export function ManagerShell(){
  return <PortalShell title="FleetOS Manager" subtitle="Owner-only platform control" nav={managerNav}/>;
}

export function ResellerShell(){
  return <PortalShell title="White-label Portal" subtitle="Reseller-only commercial workspace" nav={resellerNav}/>;
}

