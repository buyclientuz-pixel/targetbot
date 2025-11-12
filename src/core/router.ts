import type { Env, RouteHandler, RouterContext } from "./types";
import { fail, getPathname, withErrorHandling } from "./utils";

interface RouteDefinition {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: RouteDefinition[] = [];

  on(method: string, path: string, handler: RouteHandler) {
    const { pattern, keys } = compile(path);
    this.routes.push({ method: method.toUpperCase(), pattern, keys, handler });
    return this;
  }

  get(path: string, handler: RouteHandler) {
    return this.on("GET", path, handler);
  }

  post(path: string, handler: RouteHandler) {
    return this.on("POST", path, handler);
  }

  put(path: string, handler: RouteHandler) {
    return this.on("PUT", path, handler);
  }

  patch(path: string, handler: RouteHandler) {
    return this.on("PATCH", path, handler);
  }

  delete(path: string, handler: RouteHandler) {
    return this.on("DELETE", path, handler);
  }

  async handle(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const pathname = url.pathname.endsWith("/") && url.pathname !== "/"
      ? url.pathname.slice(0, -1)
      : url.pathname;
    const method = request.method.toUpperCase();

    for (const route of this.routes) {
      if (route.method !== method && route.method !== "ALL") continue;
      const match = route.pattern.exec(pathname);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        params[key] = match[index + 1];
      });
      const context: RouterContext = { request, env, params, ctx };
      return withErrorHandling(context, () => route.handler(context));
    }

    return fail(`Route not found: ${method} ${getPathname(request)}`, 404);
  }
}

function compile(path: string) {
  const keys: string[] = [];
  const pattern = path
    .replace(/\//g, "\\/")
    .replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return "([^/]+)";
    })
    .replace(/\*/g, "(.*)");
  return { pattern: new RegExp(`^${pattern}$`), keys };
}

export function createRouter() {
  return new Router();
}
