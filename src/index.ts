import { createRouter } from "./worker/router";
import { registerCoreRoutes } from "./routes";
import type { TargetBotEnv } from "./worker/types";

const router = createRouter();
registerCoreRoutes(router);

const worker = {
  async fetch(request: Request, env: TargetBotEnv, executionCtx: ExecutionContext): Promise<Response> {
    return router.dispatch(request, env, executionCtx);
  },
};

export type { TargetBotEnv } from "./worker/types";
export default worker;
