import type { WorkerEnv } from "../types";
import { readStoredMetaAuth } from "./auth";

interface GraphEnv {
  META_LONG_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
  META_MANAGE_TOKEN?: string;
  FB_LONG_TOKEN?: string;
  FB_GRAPH_VERSION?: string;
  META_GRAPH_VERSION?: string;
}

const DEFAULT_VERSION = "v18.0";
const resolveGraphToken = async (env: GraphEnv & Partial<WorkerEnv>): Promise<string | null> => {
  const directToken =
    env.META_MANAGE_TOKEN ||
    env.META_LONG_TOKEN ||
    env.META_ACCESS_TOKEN ||
    env.FB_LONG_TOKEN;
  if (directToken) {
    return directToken;
  }

  try {
    const stored = await readStoredMetaAuth(env as WorkerEnv);
    if (stored && typeof stored.access_token === "string" && stored.access_token) {
      return stored.access_token;
    }
  } catch (_error) {
    // ignore storage read errors, fall through to null
  }
  return null;
};

export const callGraph = async (
  env: GraphEnv & Partial<WorkerEnv>,
  path: string,
  params: Record<string, string> = {},
  init: RequestInit = {}
): Promise<any> => {
  const token = await resolveGraphToken(env);
  if (!token) {
    throw new Error("Meta access token is not configured");
  }

  const version = env.FB_GRAPH_VERSION || env.META_GRAPH_VERSION || DEFAULT_VERSION;
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("access_token", token);

  const requestUrl = url.toString();
  const requestInit: RequestInit = {
    method: init.method || "GET",
    headers: init.headers,
    body: init.body,
  };

  let response: Response;
  try {
    response = await fetch(requestUrl, requestInit);
  } catch (error) {
    const message = (error as Error).message || "unknown error";
    const normalized = message.toLowerCase();
    if (normalized.includes("illegal invocation")) {
      const boundFetch = fetch.bind(globalThis);
      response = await boundFetch(requestUrl, requestInit);
    } else if (normalized.includes("timed out") || normalized.includes("timeout")) {
      throw new Error(`Graph request timed out: ${message}`);
    } else {
      throw new Error(`Graph fetch failed: ${message}`);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph API error ${response.status}: ${errorText}`);
  }

  return response.json();
};
