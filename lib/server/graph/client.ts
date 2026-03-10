import { getGraphAccessToken } from "../sharepoint/graphToken";

const BASE = "https://graph.microsoft.com/v1.0";

/** Single authenticated GET to Graph API. URL can be absolute or relative to v1.0. */
export async function graphGet<T>(url: string): Promise<T> {
  const token = await getGraphAccessToken();
  const res = await fetch(url.startsWith("https://") ? url : `${BASE}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${url} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Authenticated GET that returns raw binary data. Returns null on 404 (e.g. user has no photo). */
export async function graphGetBinary(url: string): Promise<ArrayBuffer | null> {
  const token = await getGraphAccessToken();
  const res = await fetch(url.startsWith("https://") ? url : `${BASE}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET binary ${url} → ${res.status}: ${text}`);
  }
  return res.arrayBuffer();
}

/** Paginate through all @odata.nextLink pages; returns flat array of value items. */
export async function graphGetAllPages<
  T extends { "@odata.nextLink"?: string; value: unknown[] }
>(startUrl: string): Promise<T["value"]> {
  const all: T["value"] = [];
  let next: string | null = startUrl;
  while (next) {
    const page: T = await graphGet<T>(next);
    all.push(...page.value);
    next = page["@odata.nextLink"] ?? null;
  }
  return all;
}
