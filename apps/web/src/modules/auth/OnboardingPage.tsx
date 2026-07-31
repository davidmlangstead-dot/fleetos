import { useState } from "react";
import { api } from "../../lib/api";

export function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      await api("/onboarding", {
        method: "POST",
        body: JSON.stringify({ companyName: companyName.trim() }),
      });
      onComplete();
    } catch (err: any) {
      console.error("Onboarding error:", err);
      if (err?.status === 401) {
        setError("You must be signed in to create a workspace.");
      } else if (err?.status === 409) {
        onComplete();
      } else {
        setError(err?.message || "We couldn't create your workspace. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark">F</span>
          <span>FleetOS</span>
        </div>
        <p className="eyebrow">One last step</p>
        <h1>Name your company</h1>
        <p className="subtle">This creates a private FleetOS workspace for your team.</p>
        <form onSubmit={submit}>
          <label>
            Company name
            <input
              autoFocus
              required
              value={companyName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCompanyName(e.target.value)}
              placeholder="e.g. Northstar Haulage"
            />
          </label>
          {error && <p className="form-message error">{error}</p>}
          <button type="submit" className="primary-button auth-submit" disabled={busy || !companyName.trim()}>
            {busy ? "Creating workspace…" : "Create workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}