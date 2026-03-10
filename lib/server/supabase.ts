import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

/** Service-role client — bypasses RLS. Only use in trusted server-side functions. */
export function supabaseAdmin() {
  return createClient(URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * User-context client — respects RLS.
 * Pass the Supabase access_token from the frontend session.
 */
export function supabaseUser(jwt: string) {
  return createClient(URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

/** Extract the user id from a JWT (without network call). Returns null on failure. */
export function getUserIdFromJwt(jwt: string): string | null {
  try {
    const [, payload] = jwt.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return (decoded.sub as string) ?? null;
  } catch {
    return null;
  }
}
