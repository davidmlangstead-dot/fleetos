import { FormEvent, useEffect, useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { PasswordInput } from "../../components/PasswordInput";
import { supabase } from "../../lib/supabase";

export function StaffInvitePage({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadInvite() {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const linkError = fragment.get("error_description") || new URLSearchParams(window.location.search).get("error_description");
      if (linkError) { if (mounted) setError(linkError); return; }
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!mounted) return;
      if (sessionError || !session) {
        setError("This staff invitation is invalid or has expired. Ask your FleetOS administrator to send a new invitation.");
        return;
      }
      setEmail(session.user.email ?? "");
      setReady(true);
    }
    void loadInvite();
    return () => { mounted = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters for the new password.");
    if (password !== confirmPassword) return setError("The two passwords do not match.");
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);
    window.history.replaceState(null, "", "/");
    onComplete();
  }

  return <main className="auth-page"><section className="auth-card" style={{ maxWidth: 520 }}><div className="company-dot" style={{ marginBottom: 18 }}><KeyRound size={17} /></div><p className="eyebrow">FleetOS staff invitation</p><h1>Set up your login</h1><p className="subtle">{email ? `Your invitation for ${email} has been accepted.` : "FleetOS is checking your invitation."}</p>{error && <p role="alert" className="form-message error">{error}</p>}{ready && <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 22 }}><PasswordInput label="Create password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><PasswordInput label="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /><button className="primary-button auth-submit" disabled={busy}><Check size={17} /> {busy ? "Saving…" : "Open FleetOS"}</button></form>}</section></main>;
}
