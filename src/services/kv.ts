import { fetch } from "undici";
import { loadEnv } from "../utils/env";

const BASE_URL = "https://api.cloudflare.com/client/v4";
const MAX_RETRIES = 4;
const INITIAL_DELAY_MS = 250;

export async function kvGet(key: string): Promise<string | null> {
  return request("GET", key);
}

export async function kvPut(
  key: string,
  value: string,
  options: { expirationTtl?: number } = {}
): Promise<void> {
  await request("PUT", key, value, options);
}

export async function kvDel(key: string): Promise<void> {
  await request("DELETE", key);
}

export interface ListResponse {
  keys: string[];
  cursor?: string;
}

export async function kvList(prefix?: string, cursor?: string): Promise<ListResponse> {
  const { CLOUDFLARE_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CLOUDFLARE_API_TOKEN } = loadEnv();
  const search = new URLSearchParams();
  if (prefix) {
    search.set("prefix", prefix);
  }
  if (cursor) {
    search.set("cursor", cursor);
  }

  const url = `${BASE_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/keys?${search.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KV list failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    result: { name: string }[];
    result_info?: { cursor?: string };
  };

  return {
    keys: json.result.map((key) => key.name),
    cursor: json.result_info?.cursor,
  };
}

async function request(
  method: "GET" | "PUT" | "DELETE",
  key: string,
  body?: string,
  options: { expirationTtl?: number } = {}
): Promise<string | null | void> {
  const { CLOUDFLARE_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CLOUDFLARE_API_TOKEN } = loadEnv();
  const url = `${BASE_URL}/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${encodeURIComponent(
    key
  )}`;

  let attempt = 0;
  let delay = INITIAL_DELAY_MS;

  while (attempt <= MAX_RETRIES) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
    };
    if (method === "PUT") {
      headers["Content-Type"] = "text/plain";
      if (options.expirationTtl) {
        headers["Expiration-Ttl"] = String(options.expirationTtl);
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body: method === "PUT" ? body ?? "" : undefined,
    });

    if (response.ok) {
      if (method === "GET") {
        return response.text();
      }
      return;
    }

    if (response.status === 404 && method === "GET") {
      return null;
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_RETRIES) {
        const text = await response.text();
        throw new Error(`KV ${method} failed after retries (${response.status}): ${text}`);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
      attempt += 1;
      continue;
    }

    const text = await response.text();
    throw new Error(`KV ${method} failed (${response.status}): ${text}`);
  }

  throw new Error(`KV ${method} failed: max retries exceeded`);
}
