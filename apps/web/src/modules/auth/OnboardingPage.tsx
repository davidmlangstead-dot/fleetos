import { useState } from "react";
import { supabase } from "../../lib/supabase";

export function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      if (!userId) {
        setError("You must be signed in to create a workspace.");
        setBusy(false);
        return;
      }

      const { error: insertError } = await supabase
        .from("companies")
        .insert({ name: companyName.trim(), owner_id: userId })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          // Already exists — just proceed
        } else {
          throw insertError;
        }
      }

      // Call the parent's callback if it exists
      onComplete?.();

      // Force actual navigation — this fixes the stuck onboarding issue
      window.location.href = "/";
    } catch (err: any) {
      console.error("Onboarding error:", err);
      setError(err?.message || "We couldn't create your workspace. Please try again.");
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
          <button type="submit" className="primary-button auth-submit">
            {busy ? "Creating workspace…" : "Create workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}