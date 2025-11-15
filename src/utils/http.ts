import { ApiError, ApiSuccess, JsonValue } from "../types";

export const jsonResponse = <T>(
  payload: ApiSuccess<T> | ApiError,
  init: ResponseInit = {},
): Response => {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(payload), { ...init, headers });
};

export const htmlResponse = (html: string, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/html; charset=utf-8");
  }
  return new Response(html, { ...init, headers });
};

export const parseJsonRequest = async <T = Record<string, JsonValue>>(request: Request): Promise<T> => {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Expected application/json body");
  }
  return (await request.json()) as T;
};

export const parseFormData = async (request: Request): Promise<Record<string, string>> => {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    throw new Error("Expected form-urlencoded body");
  }
  const body = await request.text();
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
};
