export type ResponseBody = BodyInit | null | undefined;

const jsonHeaders = new Headers({ "content-type": "application/json; charset=utf-8" });

const mergeHeaders = (base: HeadersInit | undefined, override: HeadersInit): HeadersInit => {
  const result = new Headers(base);
  new Headers(override).forEach((value, key) => result.set(key, value));
  return result;
};

export const jsonResponse = (body: unknown, init?: ResponseInit): Response => {
  const payload = JSON.stringify(body, null, 2);
  const headers = mergeHeaders(init?.headers, jsonHeaders);
  return new Response(payload, { ...init, headers });
};

export const textResponse = (body: string, init?: ResponseInit): Response => {
  const headers = mergeHeaders(init?.headers, { "content-type": "text/plain; charset=utf-8" });
  return new Response(body, { ...init, headers });
};

export const noContent = (init?: ResponseInit): Response => {
  return new Response(null, { status: 204, ...init });
};

export const notFound = (message = "Not Found"): Response => {
  return jsonResponse({ error: message }, { status: 404 });
};

export const methodNotAllowed = (allowed: string[]): Response => {
  return jsonResponse({ error: "Method Not Allowed", allow: allowed }, {
    status: 405,
    headers: { "allow": allowed.join(", ") },
  });
};

export const notImplemented = (message = "Not Implemented"): Response => {
  return jsonResponse({ error: message }, { status: 501 });
};
