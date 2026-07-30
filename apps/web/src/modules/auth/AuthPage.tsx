import { useState } from "react";
import { supabase } from "../../lib/supabase";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const result = mode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    setMessage(mode === "signup" && !result.data.session ? "Check your email to confirm your account, then sign in." : "Signed in successfully.");
  }
  return <main className="auth-page"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">F</span><span>FleetOS</span></div><p className="eyebrow">Transport operations, made simpler</p><h1>{mode === "login" ? "Welcome back" : "Start your FleetOS workspace"}</h1><p className="subtle">{mode === "login" ? "Sign in to get back to your operation." : "Create the first account for your company."}</p><form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.co.uk"/></label><label>Password<input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"/></label>{message && <p className="form-message">{message}</p>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button></form><button className="switch-mode" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "New to FleetOS? Create an account" : "Already have an account? Sign in"}</button></section></main>;
}
