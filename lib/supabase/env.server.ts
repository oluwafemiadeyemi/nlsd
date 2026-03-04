import { getSupabasePublicEnv } from "./env";

type SupabaseServiceEnv = {
  url: string;
  serviceRoleKey: string;
};

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function sanitizeJwtLikeKey(value: string | undefined): string {
  return stripWrappingQuotes((value ?? "").trim()).replace(/\s+/g, "");
}

function isJwtLike(value: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

export function getSupabaseServiceEnv(): SupabaseServiceEnv {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = sanitizeJwtLikeKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in deployment environment.");
  }
  if (!isJwtLike(serviceRoleKey)) {
    throw new Error(
      "Invalid SUPABASE_SERVICE_ROLE_KEY format. Use the exact service_role key from Supabase Settings > API."
    );
  }
  return { url, serviceRoleKey };
}
