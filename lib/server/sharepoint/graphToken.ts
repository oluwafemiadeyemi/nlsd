import { getAppConfig } from "../../config/appConfig";

/** Acquire a Graph access token using client credentials flow. */
export async function getGraphAccessToken(): Promise<string> {
  const config = await getAppConfig();

  console.log("[graphToken] tenant:", config.azureTenantId?.substring(0, 8) || "EMPTY");
  console.log("[graphToken] clientId:", config.azureClientId?.substring(0, 8) || "EMPTY");
  console.log("[graphToken] clientSecret set:", !!config.azureClientSecret, "length:", config.azureClientSecret?.length ?? 0);

  if (!config.azureTenantId || !config.azureClientId || !config.azureClientSecret) {
    throw new Error(`Graph token error: missing credentials — tenant=${!!config.azureTenantId}, clientId=${!!config.azureClientId}, secret=${!!config.azureClientSecret}`);
  }

  const url = `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.set("client_id", config.azureClientId);
  params.set("client_secret", config.azureClientSecret);
  params.set("grant_type", "client_credentials");
  params.set("scope", "https://graph.microsoft.com/.default");

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[graphToken] Token request failed:", res.status, text);
    throw new Error(`Graph token error: ${res.status} ${text}`);
  }

  console.log("[graphToken] Token acquired successfully");
  const data = await res.json();
  return data.access_token as string;
}
