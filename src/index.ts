import { createRouter } from "./worker/router";
import { registerCoreRoutes } from "./routes";
import type { TargetBotEnv } from "./worker/types";
import { runScheduledTasks } from "./services/scheduler";

const router = createRouter();
registerCoreRoutes(router);

const worker = {
  async fetch(request: Request, env: TargetBotEnv, executionCtx: ExecutionContext): Promise<Response> {
    return router.dispatch(request, env, executionCtx);
  },
  async scheduled(event: ScheduledEvent, env: TargetBotEnv, executionCtx: ExecutionContext): Promise<void> {
    await runScheduledTasks(event, env, executionCtx);
  },
};

export type { TargetBotEnv } from "./worker/types";
export default worker;
