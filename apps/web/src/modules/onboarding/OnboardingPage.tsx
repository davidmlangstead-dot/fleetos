import { FormEvent, useState } from "react";
import { ArrowRight, Building2, CheckCircle2 } from "lucide-react";
import { api, ACTIVE_WORKSPACE_KEY } from "../../lib/api";

type Workspace = { id: string; name: string; slug: string; role: string };
type Props = { onComplete: (workspace: Workspace) => void };

export function OnboardingPage({ onComplete }: Props) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Company or fleet name is required.");
    setBusy(true); setError("");
    try {
      const created = await api<Workspace>("/company/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), address: address.trim(), postcode: postcode.trim(), phone: phone.trim() }),
      });
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, created.id);
      onComplete(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create your FleetOS workspace.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page" style={{ alignItems: "flex-start", paddingTop: 64 }}>
    <section className="auth-card" style={{ maxWidth: 720, width: "100%" }}>
      <div className="brand auth-brand"><span className="brand-mark">F</span><span>FleetOS</span></div>
      <p className="eyebrow">Step 1 of 1 · Company setup</p>
      <h1>Set up your FleetOS workspace</h1>
      <p className="subtle">We only ask for information we will actually save and use. You can add vehicles, people and compliance records once the workspace opens.</p>

      <div className="panel" style={{ padding: 16, margin: "20px 0", display: "flex", gap: 12 }}>
        <Building2 size={22}/><div><strong>Your company becomes the tenant boundary</strong><p className="subtle" style={{ margin: "4px 0 0" }}>Users, vehicles, jobs, defects and compliance records are kept inside this workspace.</p></div>
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <label>Company / fleet name<input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Langstead Transport Ltd" /></label>
        <label>Business address<input maxLength={240} value={address} onChange={e => setAddress(e.target.value)} placeholder="Optional" /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>Postcode<input maxLength={20} value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="Optional" /></label>
          <label>Phone<input maxLength={40} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" /></label>
        </div>
        {error && <p className="form-message error">{error}</p>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? "Creating workspace…" : <>Create workspace <ArrowRight size={18}/></>}</button>
      </form>

      <div style={{ display: "grid", gap: 8, marginTop: 20, color: "#475569", fontSize: 14 }}>
        <span><CheckCircle2 size={16} style={{ verticalAlign: "middle", marginRight: 7 }}/>You become Company Admin.</span>
        <span><CheckCircle2 size={16} style={{ verticalAlign: "middle", marginRight: 7 }}/>No demo company or fake fleet data is created.</span>
        <span><CheckCircle2 size={16} style={{ verticalAlign: "middle", marginRight: 7 }}/>This setup only appears when the account has no company membership.</span>
      </div>
    </section>
  </main>;
}
