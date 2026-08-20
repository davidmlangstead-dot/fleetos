import { useMemo, useState } from "react";
import { ArrowLeft, Fingerprint, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { authFeatures, supabase } from "../../lib/supabase";
import { BrandLogo, BrandSupport, PoweredBy, useBranding } from "../../lib/branding";

type Props = { initialMode?: "login" | "signup"; onBack?: () => void; allowSignup?: boolean };

type OAuthProvider = "azure" | "google";

function cleanEmail(value: string) {
  return value.trim().replace(/\s+/g, "");
}

export function AuthPage({ initialMode = "login", onBack, allowSignup = true }: Props) {
  const { branding } = useBranding();
  const [mode, setMode] = useState<"login" | "signup">(allowSignup ? initialMode : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const normalizedEmail = useMemo(() => cleanEmail(email), [email]);
  const looksLikeTruncatedMicrosoft = /@[^@]+\.onmicrosoft$/i.test(normalizedEmail);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    if (looksLikeTruncatedMicrosoft) {
      setBusy(false);
      setMessage(`That Microsoft address looks incomplete. Check the ending — it will usually finish with .onmicrosoft.com. Rivetway is currently seeing: ${normalizedEmail}`);
      return;
    }
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      : await supabase.auth.signUp({ email: normalizedEmail, password, options: { emailRedirectTo: window.location.origin + window.location.pathname + window.location.search } });
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (mode === "signup" && !result.data.session) {
      setMessage(`Check ${normalizedEmail} for the confirmation message. If the account already exists but is unconfirmed, use Resend confirmation below.`);
      return;
    }
    setMessage("Signed in. Opening your workspace…");
  }

  async function oauth(provider: OAuthProvider) {
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + window.location.pathname + window.location.search,
        scopes: provider === "azure" ? "email openid profile" : undefined,
      },
    });
    if (error) { setBusy(false); setMessage(error.message); }
  }

  async function passkey() {
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) setMessage(error.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey sign-in could not start on this device.");
    } finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!normalizedEmail) { setMessage("Enter your email address first, then choose Forgot password."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: window.location.origin });
    setBusy(false);
    setMessage(error ? error.message : `If ${normalizedEmail} is an active account, a password reset email has been sent.`);
  }

  async function resendConfirmation() {
    if (!normalizedEmail) { setMessage("Enter the email address you used to create the account first."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.resend({ type: "signup", email: normalizedEmail, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    setMessage(error ? error.message : `A fresh confirmation message has been requested for ${normalizedEmail}.`);
  }

  const socialEnabled = authFeatures.microsoft || authFeatures.google || authFeatures.passkeys;

  return <main className="auth-page"><section className="auth-card">
    {onBack && <button className="switch-mode" onClick={onBack} style={{ marginBottom: 18 }}><ArrowLeft size={16}/> Back to {branding.name}</button>}
    <div className="brand auth-brand"><BrandLogo /></div><p className="eyebrow">{branding.tagline}</p><h1>{mode === "login" ? "Welcome back" : `Create your ${branding.name} account`}</h1>
    <p className="subtle">{mode === "login" ? "Use your work account, passkey, or existing email and password." : `Create a new account with a verified business email. Existing ${branding.name} users should sign in instead.`}</p>

    {mode === "login" && socialEnabled && <div style={{display:"grid",gap:10,margin:"18px 0"}}>
      {authFeatures.microsoft && <button type="button" className="primary-button" disabled={busy} onClick={() => void oauth("azure")}><ShieldCheck size={17}/> Continue with Microsoft</button>}
      {authFeatures.google && <button type="button" disabled={busy} onClick={() => void oauth("google")}><Mail size={17}/> Continue with Google</button>}
      {authFeatures.passkeys && <button type="button" disabled={busy} onClick={() => void passkey()}><Fingerprint size={17}/> Sign in with passkey</button>}
      <div className="subtle" style={{textAlign:"center"}}>or use email and password</div>
    </div>}

    <form onSubmit={submit}>
      <label>Email<input type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.co.uk" /></label>
      {looksLikeTruncatedMicrosoft && <p className="form-message error">This looks like a Microsoft 365 address with the final <strong>.com</strong> missing. Rivetway will not submit it until you check the address.</p>}
      <label>Password<input type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
      {normalizedEmail && <p className="subtle" style={{marginTop:-4}}>Account: <strong>{normalizedEmail}</strong></p>}
      {message && <p className="form-message">{message}</p>}
      <button className="primary-button auth-submit" disabled={busy || looksLikeTruncatedMicrosoft}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
    </form>

    {mode === "login" && <button className="switch-mode" disabled={busy} onClick={() => void resetPassword()}><KeyRound size={15}/> Forgot password</button>}
    {mode === "signup" && <button className="switch-mode" disabled={busy} onClick={() => void resendConfirmation()}><Mail size={15}/> Resend confirmation</button>}
    {allowSignup && !branding.companySlug && <button className="switch-mode" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? `New to ${branding.name}? Create an account` : "Already have an account? Sign in"}</button>}
    <BrandSupport /><PoweredBy />
  </section></main>;
}
