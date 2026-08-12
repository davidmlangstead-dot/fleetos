import { useEffect, useState } from "react";
import { History, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";

type AuditEvent = { id:string; actorEmail:string|null; action:string; entityType:string; entityId:string|null; summary:string; metadata:unknown; createdAt:string };

export function AuditPage(){
  const [items,setItems]=useState<AuditEvent[]>([]); const [error,setError]=useState("");
  async function load(){ try{ setItems(await api<AuditEvent[]>("/organisation/audit?limit=150")); setError(""); }catch(e){ setError(e instanceof Error?e.message:"Could not load audit trail"); } }
  useEffect(()=>{ void load(); },[]);
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">Security & evidence</p><h1>Audit trail</h1><p className="subtle">A tenant-scoped record of important changes made in FleetOS.</p></div><button className="secondary-button" onClick={()=>void load()}>Refresh</button></div>
    {error&&<p role="alert" className="form-message error">{error}</p>}
    <section className="panel"><div className="panel-heading"><div><h2>Recent events</h2><p>Designed for accountability, incident review and compliance evidence.</p></div><ShieldCheck size={20}/></div><div className="job-list">{items.map(item=><div className="job-row" key={item.id} style={{alignItems:"flex-start"}}><div className="metric-icon blue"><History size={18}/></div><div style={{flex:1}}><strong>{item.summary}</strong><p>{item.entityType} · {item.action}{item.actorEmail?` · ${item.actorEmail}`:""}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div></div>)}{!items.length&&<div className="empty-state"><h2>No audit events yet</h2><p>Important changes will appear here as the system is used.</p></div>}</div></section>
  </section>;
}
