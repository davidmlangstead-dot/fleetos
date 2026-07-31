import { supabase } from "./supabase";

const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
const baseUrl = apiUrl ?? (typeof window !== "undefined" ? `${window.location.origin}/api` : "http://localhost:3001/api");

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
      ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
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
    const error = new Error((payload as { error?: string } | undefined)?.error ?? "Unable to load this information");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return (payload ?? {}) as T;
}
