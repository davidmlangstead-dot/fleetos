import { supabase } from "./supabase";

const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

const configuredApiUrl = apiUrl?.trim().replace(/\/$/, "");
const baseUrl =
  configuredApiUrl
    ? `${configuredApiUrl}/api`
    : import.meta.env.DEV
      ? "http://localhost:3001/api"
      : "https://fleetos-1.onrender.com/api";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  // On mobile, Supabase can still be restoring the persisted session when
  // the first protected API call is made. Refresh once before sending it.
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? null;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
      ...(session?.access_token
        ? { authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const error = new Error(
      (payload as { error?: string } | undefined)?.error ??
        `Request failed: ${response.status}`
    );

    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return (payload ?? {}) as T;
}
