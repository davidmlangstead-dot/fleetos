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
function FleetOSApp() { const [state, setState] = useState<"loading" | "signed-out" | "onboarding" | "ready">("loading"); const check = async () => { const { data: { session } } = await supabase.auth.getSession(); if (!session) return setState("signed-out"); try { const result = await api<{ membership: unknown }>("/onboarding/me"); setState(result.membership ? "ready" : "onboarding"); } catch { setState("onboarding"); } }; useEffect(() => { void check(); const { data } = supabase.auth.onAuthStateChange(() => void check()); return () => data.subscription.unsubscribe(); }, []); if (state === "loading") return <main className="loading-page">Loading FleetOS…</main>; if (state === "signed-out") return <AuthPage/>; if (state === "onboarding") return <OnboardingPage onComplete={check}/>; return <RouterProvider router={router}/>; }
createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={client}><FleetOSApp/></QueryClientProvider></StrictMode>);
