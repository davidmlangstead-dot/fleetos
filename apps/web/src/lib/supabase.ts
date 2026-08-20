import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const enabled = (value: unknown) => String(value ?? "").toLowerCase() === "true";

export const authFeatures = {
  microsoft: enabled(import.meta.env.VITE_AUTH_MICROSOFT_ENABLED),
  google: enabled(import.meta.env.VITE_AUTH_GOOGLE_ENABLED),
  passkeys: enabled(import.meta.env.VITE_AUTH_PASSKEYS_ENABLED),
} as const;

function createNoopClient() {
  return {
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async getUser() {
        return { data: { user: null }, error: null };
      },
      async refreshSession() {
        return { data: { user: null, session: null }, error: null };
      },
      async signInWithPassword() {
        return { data: { user: null, session: null }, error: { message: "Supabase has not been configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel." } };
      },
      async signInWithOAuth() {
        return { data: { provider: null, url: null }, error: { message: "Supabase has not been configured." } };
      },
      async signInWithPasskey() {
        return { data: { user: null, session: null }, error: { message: "Passkeys are not configured." } };
      },
      async registerPasskey() {
        return { data: null, error: { message: "Passkeys are not configured." } };
      },
      async signUp() {
        return { data: { user: null, session: null }, error: { message: "Supabase has not been configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel." } };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: { message: "Supabase has not been configured." } };
      },
      async resend() {
        return { data: { user: null, session: null }, error: { message: "Supabase has not been configured." } };
      },
      async signOut() {
        return { error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  } as unknown as ReturnType<typeof createClient>;
}

export const supabaseConfigError = !url || !key ? "Supabase has not been configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel." : null;
export const supabase = url && key
  ? createClient(url, key, { auth: { experimental: { passkey: true } } })
  : createNoopClient();
