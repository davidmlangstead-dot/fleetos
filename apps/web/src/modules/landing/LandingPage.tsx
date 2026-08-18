import { ArrowRight, CheckCircle2, ShieldCheck, Truck, Users, Wrench } from "lucide-react";
import { BrandLogo, BrandSupport, PoweredBy, useBranding } from "../../lib/branding";

type Props = { onLogin: () => void; onSignup: () => void };

const features = [
  [Truck, "Fleet operations", "Vehicles, jobs, defects and compliance in one workspace."],
  [Users, "Driver-first", "Give drivers a focused day view while office teams keep operational control."],
  [Wrench, "Workshop connected", "Defects move from driver report to workshop action without duplicate entry."],
  [ShieldCheck, "Compliance-by-design", "Recorded dates, evidence and exceptions are surfaced clearly and audibly."],
] as const;

export function LandingPage({ onLogin, onSignup }: Props) {
  const { branding } = useBranding();
  return <main className="landing-page">
    <header className="landing-header">
      <div className="brand"><BrandLogo /></div>
      <div className="landing-actions">
        <button className="switch-mode" onClick={onLogin}>Sign in</button>
        {!branding.companySlug && <button className="primary-button" onClick={onSignup}>Start {branding.name}</button>}
      </div>
    </header>

    <section className="landing-hero">
      <div>
        <p className="eyebrow">Driver-first fleet management</p>
        <h1>Run the fleet without losing sight of the people driving it.</h1>
        <p className="landing-lead">{branding.tagline}. Drivers, office, workshop and compliance stay connected in one operating system.</p>
        <div className="landing-actions landing-hero-actions">
          {!branding.companySlug && <button className="primary-button" onClick={onSignup}>Create your workspace <ArrowRight size={18}/></button>}
          <button className="secondary-button" onClick={onLogin}>Sign in</button>
        </div>
        <div className="landing-checks">
          <span><CheckCircle2 size={16}/>One company setup</span>
          <span><CheckCircle2 size={16}/>Role-based access</span>
          <span><CheckCircle2 size={16}/>No fake operational data</span>
        </div>
      </div>

      <div className="panel landing-preview">
        <p className="eyebrow">One operational picture</p>
        <h2>Enter once. Reuse everywhere.</h2>
        <div className="landing-feature-list">
          {features.map(([Icon, title, text]) => <div key={title} className="landing-feature"><div className="metric-icon blue"><Icon size={19}/></div><div><strong>{title}</strong><p className="subtle">{text}</p></div></div>)}
        </div>
      </div>
    </section>

    <section className="landing-footer-section">
      <div className="panel landing-cta">
        <div><p className="eyebrow">Built for real operations</p><h2>Start with your company. Build the records you actually have.</h2><p className="subtle">{branding.name} does not invent compliance or operational status. Your workspace grows from recorded evidence.</p><BrandSupport /><PoweredBy /></div>
        {!branding.companySlug && <button className="primary-button" onClick={onSignup}>Get started <ArrowRight size={18}/></button>}
      </div>
    </section>
  </main>;
}
