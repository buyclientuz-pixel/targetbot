import { jsonResponse } from "../http/responses";
import type { Router } from "../worker/router";
import { registerMetaRoutes } from "./meta";
import { registerProjectRoutes } from "./projects";
import { registerTelegramRoutes } from "./telegram";

export const registerCoreRoutes = (router: Router): void => {
  router.on("GET", "/healthz", async () => {
    return jsonResponse({ status: "ok", uptime: Date.now() });
  });

  registerProjectRoutes(router);
  registerMetaRoutes(router);
  registerTelegramRoutes(router);
};
