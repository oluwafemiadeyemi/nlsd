import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getSupabasePublicEnv } from "./env";

export function createClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  return createBrowserClient<Database>(url, anonKey);
}
