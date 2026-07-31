import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { MailCheck } from "lucide-react";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark">F</span>
          <span>FleetOS</span>
        </div>
        <p className="eyebrow">Account recovery</p>
        <h1>Reset your password</h1>
        <p className="subtle">Enter your email and we'll send you a reset link.</p>

        {sent ? (
          <div className="success-state">
            <MailCheck size={32} />
            <p>Check your inbox for a password reset link.</p>
            <Link to="/login" className="primary-button">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="you@company.co.uk"
              />
            </label>

            {message && <p className="form-message">{message}</p>}

            <button className="primary-button auth-submit" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="switch-mode">
          Remember your password? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}