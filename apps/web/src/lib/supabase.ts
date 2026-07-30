import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function createNoopClient() {
  return {
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async getUser() {
        return { data: { user: null }, error: null };
      },
      async signInWithPassword() {
        return { data: { user: null, session: null }, error: { message: "Supabase has not been configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel." } };
      },
      async signUp() {
        return { data: { user: null, session: null }, error: { message: "Supabase has not been configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel." } };
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
export const supabase = url && key ? createClient(url, key) : createNoopClient();
