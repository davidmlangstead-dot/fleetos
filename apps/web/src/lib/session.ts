import { ACTIVE_WORKSPACE_KEY, clearOfflineData } from "./api";
import { supabase } from "./supabase";

export async function signOutCurrentDevice() {
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  await clearOfflineData().catch(() => undefined);
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  window.location.replace("/");
}

