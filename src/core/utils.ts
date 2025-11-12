import { RouterContext } from "./types";

export const jsonResponse = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
    status: init.status ?? 200,
  });

export const textResponse = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...init.headers,
    },
    status: init.status ?? 200,
  });

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to parse JSON body", error);
    return null;
  }
}

export function fail(message: string, status = 400) {
  return jsonResponse({ ok: false, error: message }, { status });
}

export function ok(data: unknown = {}) {
  return jsonResponse({ ok: true, ...data });
}

export function getQuery(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export function getQueryParam(request: Request, key: string) {
  return new URL(request.url).searchParams.get(key) ?? undefined;
}

export function getPathname(request: Request) {
  return new URL(request.url).pathname;
}

export function sanitizeTelegramText(text: string) {
  return text.replace(/[`*_\[\]()~>#+\-=|{}.!]/g, "\\$&");
}

export function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const random = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  random[6] = (random[6] & 0x0f) | 0x40;
  random[8] = (random[8] & 0x3f) | 0x80;
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  const segments = [
    random.slice(0, 4).map(toHex).join(""),
    random.slice(4, 6).map(toHex).join(""),
    random.slice(6, 8).map(toHex).join(""),
    random.slice(8, 10).map(toHex).join(""),
    random.slice(10).map(toHex).join(""),
  ];
  return segments.join("-");
}

export async function toJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to parse response JSON", error, text);
    throw error;
  }
}

export async function withErrorHandling(
  context: RouterContext,
  handler: () => Promise<Response> | Response,
) {
  try {
    return await handler();
  } catch (error) {
    console.error("Handler error", error);
    await context.env.KV_LOGS.put(`log:${Date.now()}`, JSON.stringify({
      path: new URL(context.request.url).pathname,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    }));
    return fail("Internal Server Error", 500);
  }
}
