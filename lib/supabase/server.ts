import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database, AppRole } from "./database.types";
import { getSupabasePublicEnv } from "./env";
import { getSupabaseServiceEnv } from "./env.server";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can be ignored in Server Components; middleware handles refresh
          }
        },
      },
    }
  );
}

/** Service-role client for Netlify functions and server-only ops */
export function createServiceClient() {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();
  return createServerClient<Database>(
    url,
    serviceRoleKey,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false },
    }
  );
}

/**
 * Returns the current user's highest role using the my_highest_role() RPC.
 * Falls back to "employee" if the user has no roles assigned.
 */
export async function getCurrentUserRole(): Promise<AppRole> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase.rpc as any)("my_highest_role");
  if (error || !data) return "employee";
  return data as AppRole;
}

/**
 * Returns true if the current user has the specified role or higher.
 * Role hierarchy: admin > finance > manager > employee
 */
export async function userHasRole(role: AppRole): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase.rpc as any)("has_role", { p_role: role });
  if (error) return false;
  return !!data;
}

/**
 * Returns true if current user is admin or finance (for payroll/reporting access).
 */
export async function isFinanceOrAdmin(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase.rpc as any)("is_finance");
  if (error) return false;
  return !!data;
}

/**
 * Returns true if current user is manager or admin (for approvals inbox).
 */
export async function isManagerOrAdmin(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase.rpc as any)("is_manager");
  if (error) return false;
  return !!data;
}

/**
 * Returns UUIDs of all employees managed by the current user.
 */
export async function getMyReports(): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase.rpc as any)("my_reports");
  if (error || !data) return [];
  return data as string[];
}
