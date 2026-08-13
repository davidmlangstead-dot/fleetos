import { supabase } from "./supabase";
import {
  cacheApiResponse,
  clearOfflineData,
  getCachedApiResponse,
  isQueueableMutation,
  queueOfflineMutation,
  syncOfflineMutations,
} from "./offline";

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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; }
  catch { return text; }
}

function apiError(payload: unknown, status: number) {
  const error = new Error(payload && typeof payload === "object" && "error" in payload
    ? String((payload as { error: unknown }).error)
    : `Request failed: ${status}`);
  (error as Error & { status?: number }).status = status;
  return error;
}

export async function syncPendingChanges() {
  if (!navigator.onLine) return;
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? null;
  }
  if (!session?.access_token) return;

  return syncOfflineMutations(session.user.id, async (item) => {
    const response = await fetch(`${baseUrl}${item.path}`, {
      method: item.method,
      body: item.body,
      headers: {
        ...item.headers,
        authorization: `Bearer ${session!.access_token}`,
        "x-company-id": item.workspaceId,
        "x-idempotency-key": item.id,
      },
    });
    return { ok: response.ok, status: response.status, payload: await readPayload(response) };
  });
}

export function startOfflineSync() {
  const sync = () => { void syncPendingChanges().catch((error) => console.error("FleetOS offline sync failed", error)); };
  window.addEventListener("online", sync);
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "FLEETOS_SYNC_REQUESTED") sync();
  });
  const timer = window.setInterval(() => { if (navigator.onLine) sync(); }, 30_000);
  sync();
  return () => {
    window.removeEventListener("online", sync);
    window.clearInterval(timer);
  };
}

export { clearOfflineData };

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token && navigator.onLine) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? null;
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const workspaceId = localStorage.getItem(ACTIVE_WORKSPACE_KEY) ?? "";
  const method = (options.method ?? "GET").toUpperCase();
  const canReadCache = method === "GET" || method === "HEAD";
  const canQueue = !!session?.user.id && !!workspaceId && isQueueableMutation(cleanPath, method);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  async function requestOnce() {
    return fetch(`${baseUrl}${cleanPath}`, {
      ...options,
      method,
      headers: {
        ...headers,
        ...(session?.access_token ? { authorization: `Bearer ${session.access_token}` } : {}),
        ...(workspaceId ? { "x-company-id": workspaceId } : {}),
      },
    });
  }

  async function queue() {
    if (!canQueue || !session) throw new Error("This change needs a connection before it can be saved.");
    return queueOfflineMutation({
      authUserId: session.user.id,
      workspaceId,
      path: cleanPath,
      method,
      body: typeof options.body === "string" ? options.body : null,
      headers,
    }) as Promise<T>;
  }

  if (!navigator.onLine && canQueue) return queue();

  let response: Response;
  try {
    response = await requestOnce();
  } catch (firstError) {
    if (canQueue) return queue();
    if (!canReadCache) throw firstError;
    await sleep(350);
    try { response = await requestOnce(); }
    catch {
      const cached = await getCachedApiResponse<T>(workspaceId, cleanPath);
      if (cached !== null) return cached;
      throw firstError;
    }
  }

  if (canReadCache && [502, 503, 504].includes(response.status)) {
    await sleep(500);
    try { response = await requestOnce(); } catch { /* Fall through to the local cache. */ }
    if ([502, 503, 504].includes(response.status)) {
      const cached = await getCachedApiResponse<T>(workspaceId, cleanPath);
      if (cached !== null) return cached;
    }
  }

  if (canQueue && [502, 503, 504].includes(response.status)) return queue();

  const payload = await readPayload(response);
  if (!response.ok) throw apiError(payload, response.status);
  if (canReadCache && workspaceId) {
    void cacheApiResponse(workspaceId, cleanPath, payload ?? {}).catch((error) => console.error("FleetOS offline cache update failed", error));
  }
  return (payload ?? {}) as T;
}

