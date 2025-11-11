export const jsonResponse = (data: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
};

export const htmlResponse = (html: string, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(html, { ...init, headers });
};

export const textResponse = (body: string, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "text/plain; charset=utf-8");
  return new Response(body, { ...init, headers });
};

export const notFound = (message = "Not found"): Response =>
  jsonResponse({ error: message }, { status: 404 });

export const badRequest = (message: string): Response =>
  jsonResponse({ error: message }, { status: 400 });

export const unauthorized = (message = "Unauthorized"): Response =>
  jsonResponse({ error: message }, { status: 401 });

export const serverError = (message: string): Response =>
  jsonResponse({ error: message }, { status: 500 });
