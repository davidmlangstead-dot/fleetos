import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { BrandLogo, PoweredBy, useBranding } from "../../lib/branding";

type Props = {
  onBack: () => void;
  onLogin: () => void;
  onSelectPlan: (plan: string) => void;
};

const plans = [
  { name: "Starter", fleet: "1–5 vehicles", price: 79, note: "For owner-drivers and small operators." },
  { name: "Growth", fleet: "6–15 vehicles", price: 129, note: "For growing fleets coordinating drivers and office work.", featured: true },
  { name: "Business", fleet: "16–30 vehicles", price: 179, note: "For established teams needing stronger operational control." },
  { name: "Pro", fleet: "31–50 vehicles", price: 249, note: "For larger fleets running more people, jobs and compliance." },
] as const;

const included = [
  "Vehicles, staff and company records",
  "Jobs, driver workflow and customer reports",
  "Defects, workshop and compliance records",
  "Quotes, invoices and accountable audit trail",
];

export function PricingPage({ onBack, onLogin, onSelectPlan }: Props) {
  const { branding } = useBranding();

  return <main className="pricing-page">
    <header className="landing-header">
      <div className="brand"><BrandLogo /></div>
      <div className="landing-actions">
        <button className="switch-mode" onClick={onBack}><ArrowLeft size={16}/> Back</button>
        <button className="secondary-button" onClick={onLogin}>Sign in</button>
      </div>
    </header>

    <section className="pricing-hero">
      <p className="eyebrow">Simple fleet pricing</p>
      <h1>Choose the size that fits your operation.</h1>
      <p className="landing-lead">Start with the fleet you have today. No payment is taken during setup.</p>
    </section>

    <section className="founder-offer panel">
      <div className="founder-icon"><Sparkles size={22}/></div>
      <div>
        <p className="eyebrow">Founding customer offer</p>
        <h2>£99/month early-adopter plan</h2>
        <p className="subtle">A limited launch option for early companies helping shape {branding.name}. We’ll confirm eligibility before billing begins.</p>
      </div>
      <button className="primary-button" onClick={() => onSelectPlan("FOUNDING_99")}>Choose founding plan <ArrowRight size={17}/></button>
    </section>

    <section className="pricing-grid" aria-label="Fleet pricing plans">
      {plans.map((plan) => <article key={plan.name} className={`panel pricing-card${plan.featured ? " featured" : ""}`}>
        {plan.featured && <span className="pricing-badge">Popular</span>}
        <p className="eyebrow">{plan.name}</p>
        <h2>{plan.fleet}</h2>
        <div className="pricing-price"><strong>£{plan.price}</strong><span>/month</span></div>
        <p className="subtle pricing-note">{plan.note}</p>
        <div className="pricing-included">
          {included.map((item) => <span key={item}><CheckCircle2 size={16}/>{item}</span>)}
        </div>
        <button className={plan.featured ? "primary-button" : "secondary-button"} onClick={() => onSelectPlan(`${plan.name.toUpperCase()}_${plan.price}`)}>Choose {plan.name}</button>
      </article>)}

      <article className="panel pricing-card enterprise-card">
        <p className="eyebrow">Enterprise</p>
        <h2>50+ vehicles</h2>
        <div className="pricing-price"><strong>Talk to us</strong></div>
        <p className="subtle pricing-note">For larger fleets, white-label requirements or more complex operations.</p>
        <div className="pricing-included">
          {included.map((item) => <span key={item}><CheckCircle2 size={16}/>{item}</span>)}
        </div>
        <button className="secondary-button" onClick={() => onSelectPlan("ENTERPRISE")}>Start a conversation</button>
      </article>
    </section>

    <section className="pricing-footer">
      <p className="subtle">Plan choice is saved on this device for setup. Billing is not activated at this stage.</p>
      <PoweredBy />
    </section>
  </main>;
}
