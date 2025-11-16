const DEFAULT_ORIGIN = "*";
const DEFAULT_METHODS = "GET,POST,PATCH,PUT,DELETE,OPTIONS";
const DEFAULT_HEADERS = "content-type,authorization,x-request-id";

export const applyCors = (response: Response, origin = DEFAULT_ORIGIN): Response => {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "false");
  headers.set("vary", "origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const preflight = (request: Request): Response => {
  const origin = request.headers.get("origin") ?? DEFAULT_ORIGIN;
  const headers = new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": request.headers.get("access-control-request-method") ?? DEFAULT_METHODS,
    "access-control-allow-headers": request.headers.get("access-control-request-headers") ?? DEFAULT_HEADERS,
    "access-control-max-age": "600",
  });
  return new Response(null, { status: 204, headers });
};
