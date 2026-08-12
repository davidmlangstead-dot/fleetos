import { FormEvent, useEffect, useState } from "react";
import { Building2, MapPin, Plus } from "lucide-react";
import { api } from "../../lib/api";

type Depot = { id: string; name: string; address: string | null; postcode: string | null; phone: string | null; isActive: boolean };

export function DepotsPage() {
  const [items, setItems] = useState<Depot[]>([]);
  const [form, setForm] = useState({ name: "", address: "", postcode: "", phone: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() { try { setItems(await api<Depot[]>("/organisation/depots")); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Could not load depots and sites"); } }
  useEffect(() => { void load(); }, []);
  async function submit(e: FormEvent) { e.preventDefault(); if (!form.name.trim()) return setError("Depot or site name is required."); setBusy(true); setError(""); try { await api("/organisation/depots", { method: "POST", body: JSON.stringify(form) }); setForm({ name: "", address: "", postcode: "", phone: "" }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Could not create depot/site"); } finally { setBusy(false); } }
  async function toggle(item: Depot) { setBusy(true); try { await api(`/organisation/depots/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) }); await load(); } catch (err) { setError(err instanceof Error ? err.message : "Could not update depot/site"); } finally { setBusy(false); } }
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">Organisation</p><h1>Depots & sites</h1><p className="subtle">Build the operating locations that vehicles, people, workshop work and compliance records can be organised around.</p></div><div className="presence">{items.filter(x=>x.isActive).length} active</div></div>
    {error && <p role="alert" className="form-message error">{error}</p>}
    <section className="panel" style={{ marginBottom: 18 }}><div className="panel-heading"><div><h2>Add depot or site</h2><p>Enter it once; FleetOS can reuse this location across the operation.</p></div></div><form onSubmit={submit} style={{ display:"grid",gap:12,padding:16 }}><div className="form-grid"><label>Name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Main depot" /></label><label>Postcode<input value={form.postcode} onChange={e=>setForm({...form,postcode:e.target.value})} /></label><label>Address<input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} /></label><label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} /></label></div><button className="primary-button" disabled={busy}><Plus size={17}/>{busy?" Saving…":" Add depot/site"}</button></form></section>
    <section className="panel"><div className="panel-heading"><div><h2>Operating locations</h2><p>Archived locations remain in history instead of being silently deleted.</p></div></div><div className="job-list">{items.map(item=><div className="job-row" key={item.id} style={{justifyContent:"space-between",opacity:item.isActive?1:.6}}><div style={{display:"flex",gap:12,alignItems:"center"}}><div className="metric-icon blue"><Building2 size={19}/></div><div><strong>{item.name}</strong><p><MapPin size={13} style={{verticalAlign:"middle"}}/> {item.address || item.postcode || "Address not recorded"}</p></div></div><button className="secondary-button" disabled={busy} onClick={()=>void toggle(item)}>{item.isActive?"Archive":"Restore"}</button></div>)}{!items.length&&<div className="empty-state"><h2>No depots or sites yet</h2><p>Add the first operating location above.</p></div>}</div></section>
  </section>;
}
