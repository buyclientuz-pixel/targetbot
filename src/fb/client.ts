interface GraphEnv {
  META_LONG_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
  META_MANAGE_TOKEN?: string;
  FB_GRAPH_VERSION?: string;
}

const DEFAULT_VERSION = "v18.0";

export const callGraph = async (
  env: GraphEnv,
  path: string,
  params: Record<string, string> = {},
  init: RequestInit = {}
): Promise<any> => {
  const token = env.META_MANAGE_TOKEN || env.META_LONG_TOKEN || env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Meta access token is not configured");
  }

  const version = env.FB_GRAPH_VERSION || DEFAULT_VERSION;
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
