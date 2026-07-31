import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { PasswordInput } from "./components/PasswordInput";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark">F</span>
          <span>FleetOS</span>
        </div>
        <p className="eyebrow">Transport operations, made simpler</p>
        <h1>Welcome back</h1>
        <p className="subtle">Sign in to get back to your operation.</p>

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

          <PasswordInput
            required
            minLength={8}
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />

          <div className="auth-links">
            <Link to="/forgot-password" className="link-small">
              Forgot password?
            </Link>
          </div>

          {message && <p className="form-message">{message}</p>}

          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? "Please wait…" : "Sign in"}
          </button>
        </form>

        <p className="switch-mode">
          New to FleetOS? <Link to="/signup">Create an account</Link>
        </p>
      </section>
    </main>
  );
}