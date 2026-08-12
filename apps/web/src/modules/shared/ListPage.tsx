import { Link } from "react-router-dom";
import { Search } from "lucide-react";

const routeByTitle: Record<string, string> = { Jobs: "/jobs", Workshop: "/workshop", Compliance: "/compliance", Messages: "/messages" };

export function ListPage({ title, description, action }: { title: string; description: string; action: string }) {
  const route = routeByTitle[title] ?? "/";
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">Fleet operations</p><h1>{title}</h1><p className="subtle">{description}</p></div><Link className="primary-button" to={route}>+ {action}</Link></div><section className="panel empty-panel"><div className="search"><Search size={19}/><input placeholder={`Search ${title.toLowerCase()}…`}/></div><div className="empty-state"><h2>{title}, without the clutter</h2><p>This module is ready for its first live records. Its API boundary and data model are already in place.</p><Link className="primary-button" to={route}>+ {action}</Link></div></section></section>;
}
