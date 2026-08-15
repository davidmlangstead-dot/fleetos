import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { supabase } from "./lib/supabase";
import { api, ACTIVE_WORKSPACE_KEY, clearOfflineData, startOfflineSync } from "./lib/api";
import { AuthPage } from "./modules/auth/AuthPage";
import { LandingPage } from "./modules/landing/LandingPage";
import { OnboardingPage } from "./modules/onboarding/OnboardingPage";
import { StaffInvitePage } from "./modules/auth/StaffInvitePage";
import { BrandingProvider, loadCurrentBranding, loadPublicBranding, useBranding } from "./lib/branding";
import { bootstrapAccessibilityPreferences } from "./lib/accessibility";
import "./styles.css";
import "./shell-fixes.css";
import "./driver-operations.css";
import "./driver-field.css";
import "./jobs.css";
import "./branding.css";
import "./accessibility.css";

bootstrapAccessibilityPreferences();

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
type AppState = "loading" | "landing" | "auth" | "onboarding" | "ready" | "error";
type Workspace = { id: string; name: string; slug: string; role: string };

function setResolvedRole(role?: string) {
  if (role) document.documentElement.dataset.fleetosRole = role;
  else delete document.documentElement.dataset.fleetosRole;
}

function FleetOSApp() {
  const { branding, setBranding } = useBranding();
  const [state, setState] = useState<AppState>("loading");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");

  async function clearDeadLocalSession() {
    localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    setResolvedRole();
    await clearOfflineData().catch(() => undefined);
    await supabase.auth.signOut({ scope: "local" });
    setError("");
    setState("landing");
  }

  async function resolveWorkspace() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setResolvedRole();
      setBranding(await loadPublicBranding());
      setState("landing");
      return;
    }

    if (navigator.onLine) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        await clearDeadLocalSession();
        return;
      }
    }

    try {
      const workspaces = await api<Workspace[]>("/company/workspaces");
      if (!workspaces.length) {
        localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
        setResolvedRole();
        setError("");
        setState("onboarding");
        return;
      }

      const selected = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
      let active = workspaces.find((w) => w.id === selected);
      if (!active) {
        active = workspaces[0];
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, active.id);
      }

      setResolvedRole(active.role);
      try { setBranding(await loadCurrentBranding()); }
      catch { }

      if (active.role === "DRIVER" && window.location.pathname === "/") {
        window.history.replaceState(null, "", "/driver");
      }

      setError("");
      setState("ready");
    } catch (err) {
      console.error("FleetOS workspace bootstrap failed", err);
      const status = err instanceof Error && "status" in err ? (err as Error & { status?: number }).status : undefined;
      if (status === 401 && navigator.onLine) {
        const { data: verified, error: verifyError } = await supabase.auth.getUser();
        if (verifyError || !verified.user) {
          await clearDeadLocalSession();
          return;
        }
      }
      const message = !navigator.onLine
        ? `You are offline and this device has not cached the selected workspace yet. Reconnect once, then ${branding.name} can open it offline.`
        : status === 401
          ? `${branding.name} Medic: your login is valid, but the API rejected the workspace request. Your session has been kept active.`
          : err instanceof Error ? err.message : "Unable to open your workspace";
      setError(message);
      setState("error");
    }
  }

  useEffect(() => {
    let mounted = true;
    const stopSync = startOfflineSync();
    void resolveWorkspace().then(() => { if (!mounted) return; });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        setResolvedRole();
        void clearOfflineData().catch(() => undefined);
        void loadPublicBranding().then(setBranding);
        setState("landing");
      } else if (event === "SIGNED_IN" && session) {
        setState("loading");
        void resolveWorkspace();
      }
    });
    return () => { mounted = false; stopSync(); subscription.unsubscribe(); };
  }, []);

  if (window.location.pathname === "/staff-invite") return <StaffInvitePage onComplete={() => { setState("loading"); void resolveWorkspace(); }} />;
  if (state === "loading") return <main className="loading-page">{branding.name} is checking your connection…</main>;
  if (state === "landing") return <LandingPage onLogin={() => { setAuthMode("login"); setState("auth"); }} onSignup={() => { setAuthMode("signup"); setState("auth"); }} />;
  if (state === "auth") return <AuthPage initialMode={authMode} onBack={() => setState("landing")} />;
  if (state === "onboarding") return <OnboardingPage onComplete={(workspace) => { localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace.id); setResolvedRole(workspace.role); setState("ready"); }} />;
  if (state === "error") return <main className="loading-page"><div><p className="eyebrow">{branding.name} Medic</p><h1>We couldn't open your workspace</h1><p>{error}</p><button onClick={() => { setState("loading"); void resolveWorkspace(); }}>Run check again</button><button onClick={() => void supabase.auth.signOut()} style={{ marginLeft: 8 }}>Sign out</button></div></main>;
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><QueryClientProvider client={client}><BrandingProvider><FleetOSApp /></BrandingProvider></QueryClientProvider></StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update()).catch((error) => console.error("FleetOS service worker registration failed", error));
  });
}