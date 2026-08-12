import { supabase } from "./supabase";

export const ACTIVE_WORKSPACE_KEY = "fleetos.activeWorkspaceId";

function getBaseUrl() {
  if (import.meta.env.DEV) {
    const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, "");
    if (configured) return configured.endsWith("/api") ? configured : `${configured}/api`;
    return "http://localhost:3001/api";
  }

  // Production has one canonical API target. Do not allow stale Vercel env values
  // to silently point a new frontend deployment at an old backend.
  return "https://fleetos-1.onrender.com/api";
}

const baseUrl = getBaseUrl();

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? null;
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const workspaceId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  const response = await fetch(`${baseUrl}${cleanPath}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
      ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
      ...(workspaceId ? { "x-company-id": workspaceId } : {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = text; } }
  if (!response.ok) {
    const error = new Error((payload as { error?: string } | undefined)?.error ?? `Request failed: ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return (payload ?? {}) as T;
}
