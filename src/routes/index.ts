import { jsonResponse } from "../http/responses";
import type { Router } from "../worker/router";
import { registerMetaRoutes } from "./meta";
import { registerProjectRoutes } from "./projects";

export const registerCoreRoutes = (router: Router): void => {
  router.on("GET", "/healthz", async () => {
    return jsonResponse({ status: "ok", uptime: Date.now() });
  });

  registerProjectRoutes(router);
  registerMetaRoutes(router);
};
