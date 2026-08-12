import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { supabase } from "./lib/supabase";
import { api, ACTIVE_WORKSPACE_KEY } from "./lib/api";
import { AuthPage } from "./modules/auth/AuthPage";
import "./styles.css";

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
type AppState = "loading" | "signed-out" | "ready" | "error";

type Workspace = { id: string; name: string; slug: string; role: string };

function FleetOSApp() {
  const [state, setState] = useState<AppState>("loading");
  const [error, setError] = useState("");

  async function resolveWorkspace() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setState("signed-out"); return; }

    try {
      let workspaces = await api<Workspace[]>("/company/workspaces");
      if (!workspaces.length) {
        const created = await api<Workspace>("/company/workspaces", {
          method: "POST",
          body: JSON.stringify({ name: "My Fleet" }),
        });
        workspaces = [created];
      }

      const selected = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
      if (!selected || !workspaces.some((w) => w.id === selected)) {
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaces[0].id);
      }
      setError("");
      setState("ready");
    } catch (err) {
      console.error("FleetOS workspace bootstrap failed", err);
      const status = err instanceof Error && "status" in err ? (err as Error & { status?: number }).status : undefined;
      const message = status === 401
        ? "Your FleetOS session is signed in, but the workspace API rejected the request. Try again — your login has been kept active."
        : err instanceof Error ? err.message : "Unable to open your workspace";
      setError(message);
      setState("error");
    }
  }

  useEffect(() => {
    let mounted = true;
    void resolveWorkspace().then(() => { if (!mounted) return; });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") setState("signed-out");
      else if (event === "SIGNED_IN" && session) {
        setState("loading");
        void resolveWorkspace();
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  if (state === "loading") return <main className="loading-page">Opening FleetOS…</main>;
  if (state === "signed-out") return <AuthPage />;
  if (state === "error") return <main className="loading-page"><div><h1>We couldn't open your workspace</h1><p>{error}</p><button onClick={() => { setState("loading"); void resolveWorkspace(); }}>Try again</button><button onClick={() => void supabase.auth.signOut()} style={{ marginLeft: 8 }}>Sign out</button></div></main>;
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><QueryClientProvider client={client}><FleetOSApp /></QueryClientProvider></StrictMode>,
);
