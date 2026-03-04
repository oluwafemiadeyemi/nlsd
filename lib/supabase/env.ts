type SupabasePublicEnv = {
  url: string;
  anonKey: string;
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

function sanitizeUrl(value: string | undefined): string {
  return stripWrappingQuotes((value ?? "").trim()).trim();
}

function sanitizeJwtLikeKey(value: string | undefined): string {
  return stripWrappingQuotes((value ?? "").trim()).replace(/\s+/g, "");
}

function isJwtLike(value: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  const padded = padding === 0 ? base64 : `${base64}${"=".repeat(4 - padding)}`;
  return atob(padded);
}

function extractProjectRefFromKey(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { ref?: unknown };
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function extractProjectRefFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    const [projectRef] = hostname.split(".");
    return projectRef || null;
  } catch {
    return null;
  }
}

function validatePublicEnv(url: string, anonKey: string): void {
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in deployment environment.");
  }
  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in deployment environment.");
  }
  if (!isJwtLike(anonKey)) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_ANON_KEY format. Use the exact anon/public key from Supabase Settings > API, without quotes."
    );
  }

  const urlRef = extractProjectRefFromUrl(url);
  const keyRef = extractProjectRefFromKey(anonKey);
  if (urlRef && keyRef && urlRef !== keyRef) {
    throw new Error(
      `Supabase project mismatch: URL points to "${urlRef}" but anon key is for "${keyRef}".`
    );
  }
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const url = sanitizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = sanitizeJwtLikeKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  validatePublicEnv(url, anonKey);
  return { url, anonKey };
}
