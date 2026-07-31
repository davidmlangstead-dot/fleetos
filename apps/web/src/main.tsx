import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { supabase } from "./lib/supabase";
import { AuthPage } from "./modules/auth/AuthPage";
import { OnboardingPage } from "./modules/auth/OnboardingPage";
import "./styles.css";

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function FleetOSApp() {
  const [state, setState] = useState<"loading" | "signed-out" | "onboarding" | "ready">("loading");

  const check = async () => {
    setState("loading");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setState("signed-out");

    // Bypass flag for users who already created via debug version
    if (localStorage.getItem("fleetos_onboarding_done") === "1") {
      return setState("ready");
    }

    try {
      // Query Supabase directly — no backend API needed
      const { data, error } = await supabase
        .from("companies")
        .select("id")
        .eq("owner_id", session.user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setState("ready");
      } else {
        setState("onboarding");
      }
    } catch (err) {
      console.error("Company check failed:", err);
      // If the table doesn't exist yet, assume onboarding needed
      setState("onboarding");
    }
  };

  useEffect(() => {
    void check();
    const { data } = supabase.auth.onAuthStateChange(() => void check());
    return () => data.subscription.unsubscribe();
  }, []);

  if (state === "loading") return <main className="loading-page">Loading FleetOS…</main>;
  if (state === "signed-out") return <AuthPage />;
  if (state === "onboarding")
    return (
      <OnboardingPage
        onComplete={() => {
          localStorage.setItem("fleetos_onboarding_done", "1");
          void check();
        }}
      />
    );
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <FleetOSApp />
    </QueryClientProvider>
  </StrictMode>
);