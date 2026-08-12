import { ArrowRight, CheckCircle2, ShieldCheck, Truck, Users, Wrench } from "lucide-react";

type Props = { onLogin: () => void; onSignup: () => void };

const features = [
  [Truck, "Fleet operations", "Vehicles, jobs, defects and compliance in one workspace."],
  [Users, "Driver-first", "Give drivers a focused day view while office teams keep operational control."],
  [Wrench, "Workshop connected", "Defects move from driver report to workshop action without duplicate entry."],
  [ShieldCheck, "Compliance-by-design", "Recorded dates, evidence and exceptions are surfaced clearly and audibly."],
] as const;

export function LandingPage({ onLogin, onSignup }: Props) {
  return <main style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a" }}>
    <header style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div className="brand"><span className="brand-mark">F</span><span>FleetOS</span></div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="switch-mode" onClick={onLogin}>Sign in</button>
        <button className="primary-button" onClick={onSignup}>Start FleetOS</button>
      </div>
    </header>

    <section style={{ maxWidth: 1180, margin: "0 auto", padding: "88px 24px 72px", display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(320px,.9fr)", gap: 54, alignItems: "center" }}>
      <div>
        <p className="eyebrow">Driver-first fleet management</p>
        <h1 style={{ fontSize: "clamp(44px,6vw,76px)", lineHeight: .98, letterSpacing: "-.055em", margin: "14px 0 24px", maxWidth: 760 }}>Run the fleet without losing sight of the people driving it.</h1>
        <p style={{ fontSize: 20, lineHeight: 1.6, color: "#475569", maxWidth: 700 }}>FleetOS brings drivers, office, workshop and compliance into one connected operating system for growing fleets.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 30 }}>
          <button className="primary-button" onClick={onSignup}>Create your workspace <ArrowRight size={18}/></button>
          <button className="secondary-button" onClick={onLogin}>Sign in</button>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 28, color: "#475569", fontSize: 14 }}>
          <span><CheckCircle2 size={16} style={{ verticalAlign: "middle", marginRight: 6 }}/>One company setup</span>
          <span><CheckCircle2 size={16} style={{ verticalAlign: "middle", marginRight: 6 }}/>Role-based access</span>
          <span><CheckCircle2 size={16} style={{ verticalAlign: "middle", marginRight: 6 }}/>No fake operational data</span>
        </div>
      </div>

      <div className="panel" style={{ padding: 28, borderRadius: 24, boxShadow: "0 24px 70px rgba(15,23,42,.12)" }}>
        <p className="eyebrow">One operational picture</p>
        <h2 style={{ fontSize: 30, margin: "8px 0 18px" }}>Enter once. Reuse everywhere.</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {features.map(([Icon, title, text]) => <div key={title} style={{ display: "flex", gap: 14, padding: 14, borderRadius: 14, background: "#f8fafc" }}><div className="metric-icon blue"><Icon size={19}/></div><div><strong>{title}</strong><p className="subtle" style={{ margin: "5px 0 0" }}>{text}</p></div></div>)}
        </div>
      </div>
    </section>

    <section style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 24px 88px" }}>
      <div className="panel" style={{ padding: "34px 38px", display: "flex", gap: 24, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div><p className="eyebrow">Built for real operations</p><h2 style={{ margin: "7px 0" }}>Start with your company. Build the records you actually have.</h2><p className="subtle">FleetOS does not invent compliance or operational status. Your workspace grows from recorded evidence.</p></div>
        <button className="primary-button" onClick={onSignup}>Get started <ArrowRight size={18}/></button>
      </div>
    </section>
  </main>;
}
