import { FormEvent, useEffect, useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { PasswordInput } from "../../components/PasswordInput";
import { ACTIVE_WORKSPACE_KEY, clearOfflineData } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { BrandLogo, BrandSupport, PoweredBy, useBranding } from "../../lib/branding";

const STAFF_INVITE_ROLES = new Set([
  "DRIVER", "OFFICE", "WORKSHOP", "SUPERVISOR", "MANAGER", "ADMIN", "FINANCE",
]);
const EXPIRED_INVITE_PATTERN = /invalid|expired|one-time token|otp_expired/i;

function inviteErrorMessage(message: string) {
  return EXPIRED_INVITE_PATTERN.test(message)
    ? "This one-time invitation has already been used or has expired. If you completed setup on the first click, sign in with your email and password. Otherwise ask the office to send a fresh invitation."
    : message;
}

let inviteSessionPromise: ReturnType<typeof resolveInviteSession> | null = null;

async function resolveInviteSession() {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  const code = query.get("code");

  if (accessToken && refreshToken) {
    return supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }
  if (code) return supabase.auth.exchangeCodeForSession(code);
  return supabase.auth.getSession();
}

export function StaffInvitePage({ onComplete }: { onComplete: () => void }) {
  const { branding } = useBranding();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invitedUserId, setInvitedUserId] = useState("");

  useEffect(() => {
    let mounted = true;
    async function loadInvite() {
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const linkError = fragment.get("error_description") || query.get("error_description");
      if (linkError) { if (mounted) setError(inviteErrorMessage(linkError)); return; }
      inviteSessionPromise ??= resolveInviteSession();
      const { data: { session }, error: sessionError } = await inviteSessionPromise;
      if (!mounted) return;
      if (sessionError || !session) {
        setError("This staff invitation is invalid or has expired. Ask your company administrator to send a new invitation.");
        return;
      }

      const expectedCompany = query.get("company")?.trim().toLowerCase();
      const metadata = session.user.user_metadata ?? {};
      const invitedCompany = typeof metadata.companySlug === "string" ? metadata.companySlug.trim().toLowerCase() : "";
      const invitedRole = typeof metadata.accessRole === "string" ? metadata.accessRole.trim().toUpperCase() : "";
      if (!expectedCompany || invitedCompany !== expectedCompany || !STAFF_INVITE_ROLES.has(invitedRole)) {
        setError("This browser is signed in to a different account. Open the original staff invitation again, or use a private browsing window. Your office account has not been changed.");
        return;
      }

      setEmail(session.user.email ?? "");
      setInvitedUserId(session.user.id);
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== invitedUserId) {
      setBusy(false);
      return setError("The invitation session has changed. Open the original invitation link again before setting a password.");
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);
    localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    await clearOfflineData().catch(() => undefined);
    window.history.replaceState(null, "", "/");
    onComplete();
  }

  return <main className="auth-page"><section className="auth-card" style={{ maxWidth: 520 }}><div className="brand auth-brand"><BrandLogo /></div><div className="company-dot" style={{ marginBottom: 18 }}><KeyRound size={17} /></div><p className="eyebrow">{branding.name} staff invitation</p><h1>Set up your login</h1><p className="subtle">{email ? `Your invitation for ${email} has been accepted.` : `${branding.name} is checking your invitation.`}</p>{error && <><p role="alert" className="form-message error">{error}</p><button type="button" className="secondary-button" onClick={() => window.location.replace("/")}>Return to {branding.name}</button></>}{ready && <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 22 }}><PasswordInput label="Create password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><PasswordInput label="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /><button className="primary-button auth-submit" disabled={busy}><Check size={17} /> {busy ? "Saving…" : `Open ${branding.name}`}</button></form>}<BrandSupport /><PoweredBy /></section></main>;
}

