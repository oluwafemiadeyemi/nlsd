import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables: " +
      [!url && "NEXT_PUBLIC_SUPABASE_URL", !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY"]
        .filter(Boolean).join(", ")
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
