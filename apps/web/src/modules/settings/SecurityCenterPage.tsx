import { useEffect, useState } from "react";
import { Fingerprint, KeyRound, Laptop, LogOut, RefreshCw, ShieldCheck, ShieldPlus, Trash2 } from "lucide-react";
import { authFeatures, supabase } from "../../lib/supabase";

type Identity = { id: string; provider: string; created_at?: string };
type Factor = { id: string; friendly_name?: string; created_at: string; status: string; factor_type: string };
type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
type Enrollment = { id: string; qr: string; secret: string };

export function SecurityCenterPage() {
  const [email, setEmail] = useState("");
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [aal, setAal] = useState("aal1");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setBusy(true); setMessage("");
    try {
      const [{ data: userData, error: userError }, { data: mfaData }, { data: assurance }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (userError) throw userError;
      setEmail(userData.user?.email ?? "");
      setIdentities((userData.user?.identities ?? []) as Identity[]);
      const verified = [...(mfaData?.totp ?? []), ...(mfaData?.phone ?? [])] as Factor[];
      setFactors(verified);
      setAal(assurance?.currentLevel ?? "aal1");
      if (authFeatures.passkeys) {
        const { data, error } = await supabase.auth.passkey.list();
        if (!error) setPasskeys((data ?? []) as Passkey[]);
      } else setPasskeys([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Security details could not be loaded."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  async function addPasskey() {
    setBusy(true); setMessage("");
    try {
      const { data, error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      setMessage(`Passkey registered${data?.friendly_name ? `: ${data.friendly_name}` : ""}.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Passkey registration could not complete."); }
    finally { setBusy(false); }
  }

  async function removePasskey(id: string) {
    if (!window.confirm("Remove this passkey?")) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
    setMessage(error ? error.message : "Passkey removed.");
    await load();
  }

  async function beginMfa() {
    setBusy(true); setMessage("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Rivetway authenticator" });
      if (error) throw error;
      setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (error) { setMessage(error instanceof Error ? error.message : "MFA enrollment could not start."); }
    finally { setBusy(false); }
  }

  async function verifyMfa() {
    if (!enrollment || !code.trim()) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: code.trim() });
      if (error) throw error;
      setEnrollment(null); setCode(""); setMessage("Authenticator MFA enabled. Other sessions have been invalidated for security.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The authenticator code could not be verified."); }
    finally { setBusy(false); }
  }

  async function removeFactor(id: string) {
    if (!window.confirm("Remove this MFA factor?")) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setMessage(error ? error.message : "MFA factor removed.");
    await load();
  }

  async function signOutOthers() {
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setBusy(false); setMessage(error ? error.message : "Other active sessions have been signed out.");
  }

  async function resetPassword() {
    if (!email) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setBusy(false); setMessage(error ? error.message : "Password reset email requested.");
  }

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Account protection</p><h1>Security centre</h1><p className="subtle">Manage how you prove your identity. Company permissions and tenant isolation remain separate from sign-in methods.</p></div><button onClick={() => void load()} disabled={busy}><RefreshCw size={16}/> Refresh</button></div>
    {message && <p className="form-message">{message}</p>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:14,marginBottom:18}}>
      <article className="panel" style={{padding:18}}><ShieldCheck size={26}/><p className="eyebrow">Signed in as</p><h3>{email || "Current user"}</h3><p className="subtle">Assurance level: <strong>{aal.toUpperCase()}</strong></p></article>
      <article className="panel" style={{padding:18}}><Laptop size={26}/><p className="eyebrow">Connected identities</p><h3>{identities.length || 1}</h3><p className="subtle">{identities.length ? identities.map(item => item.provider).join(" · ") : "Email/password"}</p></article>
      <article className="panel" style={{padding:18}}><KeyRound size={26}/><p className="eyebrow">Second factors</p><h3>{factors.length}</h3><p className="subtle">Authenticator or phone factors registered to this account.</p></article>
    </div>

    <section className="panel" style={{marginBottom:18}}><div className="panel-heading"><div><h2><ShieldPlus size={18}/> Authenticator MFA</h2><p>Add an authenticator app as a second factor for sensitive accounts.</p></div></div><div style={{padding:16,display:"grid",gap:12}}>
      {factors.length ? factors.map(f => <div key={f.id} style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><div><strong>{f.friendly_name || "Authenticator"}</strong><div className="subtle">{f.factor_type} · {f.status}</div></div><button onClick={() => void removeFactor(f.id)} disabled={busy}><Trash2 size={15}/> Remove</button></div>) : <p className="subtle">No MFA factor is enrolled.</p>}
      {!enrollment && <button className="primary-button" onClick={() => void beginMfa()} disabled={busy}>Set up authenticator MFA</button>}
      {enrollment && <div style={{display:"grid",gap:10,maxWidth:420}}><img src={enrollment.qr} alt="Authenticator QR code" style={{width:220,maxWidth:"100%",background:"white",padding:10,borderRadius:12}}/><p className="subtle">If you cannot scan the QR code, enter this secret manually: <strong>{enrollment.secret}</strong></p><label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}/></label><button className="primary-button" onClick={() => void verifyMfa()} disabled={busy || code.length !== 6}>Verify and enable</button></div>}
    </div></section>

    {authFeatures.passkeys && <section className="panel" style={{marginBottom:18}}><div className="panel-heading"><div><h2><Fingerprint size={18}/> Passkeys</h2><p>Use Face ID, fingerprint, Windows Hello or a hardware security key.</p></div></div><div style={{padding:16,display:"grid",gap:12}}>
      {passkeys.length ? passkeys.map(p => <div key={p.id} style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><div><strong>{p.friendly_name || "Passkey"}</strong><div className="subtle">Added {new Date(p.created_at).toLocaleDateString("en-GB")}{p.last_used_at ? ` · last used ${new Date(p.last_used_at).toLocaleDateString("en-GB")}` : ""}</div></div><button onClick={() => void removePasskey(p.id)} disabled={busy}><Trash2 size={15}/> Remove</button></div>) : <p className="subtle">No passkeys registered yet.</p>}
      <button className="primary-button" onClick={() => void addPasskey()} disabled={busy}><Fingerprint size={16}/> Add passkey to this account</button>
    </div></section>}

    <section className="panel"><div className="panel-heading"><div><h2>Sessions & recovery</h2><p>Use these controls if a device is lost, shared, or you suspect an account problem.</p></div></div><div style={{padding:16,display:"flex",gap:10,flexWrap:"wrap"}}><button onClick={() => void signOutOthers()} disabled={busy}><LogOut size={16}/> Sign out other sessions</button><button onClick={() => void resetPassword()} disabled={busy}><KeyRound size={16}/> Send password reset</button></div></section>
  </section>;
}
