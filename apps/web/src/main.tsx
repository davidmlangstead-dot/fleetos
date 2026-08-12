import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { supabase } from "./lib/supabase";
import { AuthPage } from "./modules/auth/AuthPage";
import "./styles.css";

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

type AppState = "loading" | "signed-out" | "ready";

function FleetOSApp() {
  const [state, setState] = useState<AppState>("loading");

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setState(session ? "ready" : "signed-out");
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        if (event === "SIGNED_OUT") {
          setState("signed-out");
        } else if (session) {
          setState("ready");
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") {
    return <main className="loading-page">Loading FleetOS…</main>;
  }

  if (state === "signed-out") {
    return <AuthPage />;
  }

  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <FleetOSApp />
    </QueryClientProvider>
  </StrictMode>,
);
