import { useState } from "react";
import { supabase } from "../../lib/supabase";

export function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [debug, setDebug] = useState<string[]>([]);

  function log(msg: string) {
    console.log(msg);
    setDebug((prev) => [...prev, msg]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    log("[1] Button clicked");
    setBusy(true);
    setError("");

    try {
      log("[2] Checking Supabase config...");
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) {
        log("[ERROR] Missing env vars — URL=" + url + " Key=" + (key ? "set" : "missing"));
        setError("App is not configured. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing in Vercel.");
        setBusy(false);
        return;
      }
      log("[3] Env vars OK");

      log("[4] Getting user...");
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        log("[ERROR] getUser failed: " + userError.message);
        setError(userError.message);
        setBusy(false);
        return;
      }
      const userId = userData.user?.id;
      log("[5] User ID: " + (userId || "null"));

      if (!userId) {
        setError("You must be signed in to create a workspace.");
        setBusy(false);
        return;
      }

      log("[6] Inserting company...");
      const { data, error: insertError } = await supabase
        .from("companies")
        .insert({ name: companyName.trim(), owner_id: userId })
        .select()
        .single();

      log("[7] Insert result: " + (insertError ? "ERROR " + insertError.code : "OK"));

      if (insertError) {
        if (insertError.code === "23505") {
          log("[8] Duplicate company — proceeding");
          onComplete();
          return;
        }
        throw insertError;
      }

      log("[8] Success — redirecting");
      onComplete();
    } catch (err: any) {
      log("[ERROR] Caught: " + (err?.message || String(err)));
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

        {debug.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, background: "#f5f5f5", borderRadius: 6, fontSize: 12, fontFamily: "monospace", maxHeight: 200, overflow: "auto" }}>
            {debug.map((d, i) => (
              <div key={i} style={{ marginBottom: 4 }}>{d}</div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}