import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { BrandLogo, BrandSupport, PoweredBy, useBranding } from "../../lib/branding";

type Props = { initialMode?: "login" | "signup"; onBack?: () => void };

export function AuthPage({ initialMode = "login", onBack }: Props) {
  const { branding } = useBranding();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: "https://fleetos-orpin-one.vercel.app" },
        });

    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage(`If this is a new email address, check your inbox to confirm it. If you already have a ${branding.name} account, choose Sign in below — a second signup email may not be sent.`);
      return;
    }

    window.location.reload();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        {onBack && <button className="switch-mode" onClick={onBack} style={{ marginBottom: 18 }}><ArrowLeft size={16}/> Back to {branding.name}</button>}
        <div className="brand auth-brand"><BrandLogo /></div>
        <p className="eyebrow">{branding.tagline}</p>
        <h1>{mode === "login" ? "Welcome back" : `Create your ${branding.name} account`}</h1>
        <p className="subtle">{mode === "login" ? "Existing account? Enter your email and password — no email link is required." : `Only use Create account for a brand-new email. Existing ${branding.name} users should use Sign in.`}</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.co.uk" /></label>
          <label>Password<input type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
          {message && <p className="form-message">{message}</p>}
          <button className="primary-button auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        {!branding.companySlug && <button className="switch-mode" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
          {mode === "login" ? `New to ${branding.name}? Create an account` : "Already have an account? Sign in"}
        </button>}
        <BrandSupport />
        <PoweredBy />
      </section>
    </main>
  );
}

