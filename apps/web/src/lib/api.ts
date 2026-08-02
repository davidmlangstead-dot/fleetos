import { supabase } from "./supabase";

const apiUrl = import.meta.env.VITE_API_URL as string | undefined;

const baseUrl =
  apiUrl
    ? `${apiUrl.replace(/\/$/, "")}/api`
    : import.meta.env.DEV
      ? "http://localhost:3001/api"
      : undefined;

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!baseUrl) {
    throw new Error(
      "VITE_API_URL is required in production. Set VITE_API_URL to your hosted FleetOS API in Vercel."
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

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