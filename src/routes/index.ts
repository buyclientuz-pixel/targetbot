import { jsonResponse, notImplemented } from "../http/responses";
import type { Router } from "../worker/router";

export const registerCoreRoutes = (router: Router): void => {
  router.on("GET", "/healthz", async () => {
    return jsonResponse({ status: "ok", uptime: Date.now() });
  });

  router.on("GET", "/api/meta/status", async () => {
    return notImplemented("Meta status endpoint is not yet available");
  });

  router.on("GET", "/api/projects/:projectId", async ({ state }) => {
    return notImplemented(`Project ${state.params.projectId ?? "unknown"} endpoint pending`);
  });
};
