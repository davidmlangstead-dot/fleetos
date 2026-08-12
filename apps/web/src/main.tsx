import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { supabase } from "./lib/supabase";
import { api } from "./lib/api";
import { AuthPage } from "./modules/auth/AuthPage";
import { OnboardingPage } from "./modules/auth/OnboardingPage";
import "./styles.css";

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
type AppState = "loading" | "signed-out" | "onboarding" | "ready";

function FleetOSApp() {
  const [state, setState] = useState<AppState>("loading");

  async function resolveWorkspace() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setState("signed-out"); return; }
    try {
      await api("/company");
      setState("ready");
    } catch (err) {
      const status = err instanceof Error && "status" in err ? (err as Error & { status?: number }).status : undefined;
      if (status === 401) { await supabase.auth.signOut(); setState("signed-out"); }
      else if (status === 403 || status === 404) setState("onboarding");
      else { console.error("FleetOS workspace check failed", err); setState("onboarding"); }
    }
  }

  useEffect(() => {
    let mounted = true;
    void resolveWorkspace().then(() => { if (!mounted) return; });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") setState("signed-out");
      else if (event === "SIGNED_IN" && session) window.location.reload();
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  if (state === "loading") return <main className="loading-page">Loading FleetOS…</main>;
  if (state === "signed-out") return <AuthPage />;
  if (state === "onboarding") return <OnboardingPage onComplete={() => window.location.reload()} />;
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={client}><FleetOSApp /></QueryClientProvider></StrictMode>);
