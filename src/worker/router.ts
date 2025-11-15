import { applyCors, preflight } from "../http/cors";
import { methodNotAllowed, notFound } from "../http/responses";
import type { RequestContext } from "./context";
import { createRequestContext } from "./context";
import type { TargetBotEnv, WorkerContextOptions } from "./types";

export type RouteHandler = (context: RequestContext) => Response | Promise<Response>;

interface RouteDefinition {
  methods: Set<string>;
  pattern: URLPattern;
  handler: RouteHandler;
  options?: WorkerContextOptions;
}

export interface Router {
  on(method: string | string[], pathname: string, handler: RouteHandler, options?: WorkerContextOptions): void;
  handle(context: RequestContext): Promise<Response>;
  dispatch(request: Request, env: TargetBotEnv, executionCtx: ExecutionContext): Promise<Response>;
}

class WorkerRouter implements Router {
  private readonly routes: RouteDefinition[] = [];

  on(method: string | string[], pathname: string, handler: RouteHandler, options?: WorkerContextOptions): void {
    const methods = Array.isArray(method) ? method : [method];
    const normalised = new Set(methods.map((value) => value.toUpperCase()));
    const pattern = new URLPattern({ pathname });
    this.routes.push({ methods: normalised, pattern, handler, options });
  }

  async dispatch(request: Request, env: TargetBotEnv, executionCtx: ExecutionContext): Promise<Response> {
    if (request.method.toUpperCase() === "OPTIONS") {
      return preflight(request);
    }

    const baseContext = createRequestContext(request, env, executionCtx);
    return this.handle(baseContext);
  }

  async handle(context: RequestContext): Promise<Response> {
    const { request } = context;
    const url = new URL(request.url);

    for (const route of this.routes) {
      const match = route.pattern.exec(url);
      if (!match) {
        continue;
      }
      if (!route.methods.has(request.method.toUpperCase())) {
        const response = methodNotAllowed(Array.from(route.methods));
        const origin = route.options?.cors?.allowOrigin ?? request.headers.get("origin") ?? "*";
        return applyCors(response, origin);
      }
      context.setParams(match.pathname.groups ?? {});
      const response = await route.handler(context);
      const origin = route.options?.cors?.allowOrigin ?? request.headers.get("origin") ?? "*";
      return applyCors(response, origin);
    }

    const origin = request.headers.get("origin") ?? "*";
    return applyCors(notFound(), origin);
  }
}

export const createRouter = (): Router => {
  return new WorkerRouter();
};
