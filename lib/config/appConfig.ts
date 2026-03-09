import { createClient } from "@supabase/supabase-js";

export interface AppConfig {
  azureTenantId: string;
  azureClientId: string;
  azureClientSecret: string;
  azureGroupAdmins: string;
  azureGroupManagers: string;
  azureGroupFinance: string;
  sharepointSiteId: string;
  sharepointDriveId: string;
  sharepointPayrollFolder: string;
}

const ENV_FALLBACKS: Record<string, string> = {
  azure_tenant_id: "AZURE_TENANT_ID",
  azure_client_id: "AZURE_CLIENT_ID",
  azure_client_secret: "AZURE_CLIENT_SECRET",
  azure_group_admins: "AZURE_GROUP_ADMINS",
  azure_group_managers: "AZURE_GROUP_MANAGERS",
  azure_group_finance: "AZURE_GROUP_FINANCE",
  sharepoint_site_id: "SHAREPOINT_SITE_ID",
  sharepoint_drive_id: "SHAREPOINT_DRIVE_ID",
  sharepoint_payroll_folder: "SHAREPOINT_PAYROLL_FOLDER",
};

const KEY_TO_PROP: Record<string, keyof AppConfig> = {
  azure_tenant_id: "azureTenantId",
  azure_client_id: "azureClientId",
  azure_client_secret: "azureClientSecret",
  azure_group_admins: "azureGroupAdmins",
  azure_group_managers: "azureGroupManagers",
  azure_group_finance: "azureGroupFinance",
  sharepoint_site_id: "sharepointSiteId",
  sharepoint_drive_id: "sharepointDriveId",
  sharepoint_payroll_folder: "sharepointPayrollFolder",
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: " +
      [!url && "NEXT_PUBLIC_SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"]
        .filter(Boolean).join(", ")
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Loads app configuration from the database, falling back to env vars
 * for any key with an empty DB value. Server-only.
 */
export async function getAppConfig(): Promise<AppConfig> {
  const dbValues = new Map<string, string>();

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log("[getAppConfig] SUPABASE_URL set:", !!url, "SERVICE_ROLE_KEY set:", !!key, "key length:", key?.length ?? 0);

    if (!url || !key) {
      console.warn("[getAppConfig] Missing Supabase env vars — falling back to env vars only");
    } else {
      const supabase = createServiceClient();
      const { data: rows, error } = await supabase
        .from("app_config")
        .select("key, value");

      if (error) {
        console.error("[getAppConfig] DB query error:", error.message, error.code);
      } else if (rows) {
        console.log("[getAppConfig] Loaded", rows.length, "config rows from DB");
        for (const row of rows as { key: string; value: string }[]) {
          if (row.value) dbValues.set(row.key, row.value);
        }
      }
    }
  } catch (err: any) {
    console.error("[getAppConfig] Exception:", err?.message ?? err);
  }

  const config: Record<string, string> = {};
  for (const [dbKey, propName] of Object.entries(KEY_TO_PROP)) {
    const envVar = ENV_FALLBACKS[dbKey];
    const dbVal = dbValues.get(dbKey);
    const envVal = process.env[envVar];
    config[propName] = dbVal || envVal || "";
    // Log source for each key (mask secrets)
    const source = dbVal ? "db" : envVal ? "env" : "EMPTY";
    const isSafe = !dbKey.includes("secret");
    console.log(`[getAppConfig] ${dbKey}: source=${source}${isSafe ? `, value=${(config[propName] || "").substring(0, 8)}...` : ""}`);
  }

  return config as unknown as AppConfig;
}

/**
 * Get a single config value by DB key name.
 */
export async function getConfigValue(key: string): Promise<string> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", key)
      .single();

    const row = data as { value: string } | null;
    if (!error && row?.value) return row.value;
  } catch {
    // DB not available or table missing — fall back to env var
  }

  const envVar = ENV_FALLBACKS[key];
  return envVar ? (process.env[envVar] ?? "") : "";
}
