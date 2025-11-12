import { createRouter } from "./core/router";
import type { Env } from "./core/types";
import type { ScheduledController } from "@cloudflare/workers-types";
import { healthHandler } from "./api/health";
import {
  createLeadHandler,
  getLeadHandler,
  listLeadsHandler,
  updateLeadHandler,
} from "./api/leads";
import { deleteUserHandler, listUsersHandler, updateUserHandler } from "./api/users";
import { listReportsHandler, createReportHandler } from "./api/reports";
import { getSettingsHandler, updateSettingsHandler } from "./api/settings";
import { dashboardHandler } from "./api/dashboard";
import { renderAdminPage } from "./admin/page";
import { requireAdmin } from "./core/auth";
import { handleUpdate } from "./bot/handler";
import { manageWebhookHandler } from "./bot/webhook";
import { facebookAuthHandler, facebookCallbackHandler, metaRefreshHandler } from "./meta/auth";
import { metaStatsHandler } from "./meta/stats";
import { metaSyncHandler } from "./meta/sync";
import { metaStatusHandler } from "./meta/status";
import { jsonResponse, readJsonBody } from "./core/utils";

const router = createRouter();

router.get("/", async () => {
  return new Response(
    JSON.stringify({
      name: "TargetBot",
      version: "1.0.0",
      message: "Visit /admin?key=YOUR_ADMIN_KEY to open the dashboard",
    }),
    {
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
});

router.get("/health", healthHandler);
router.get("/api/health", healthHandler);
router.get("/api/leads", listLeadsHandler);
router.post("/api/leads", createLeadHandler);
router.get("/api/leads/:id", getLeadHandler);
router.patch("/api/leads/:id", updateLeadHandler);
router.get("/api/dashboard", dashboardHandler);
router.get("/api/users", listUsersHandler);
router.patch("/api/users/:id", updateUserHandler);
router.delete("/api/users/:id", deleteUserHandler);
router.get("/api/reports", listReportsHandler);
router.post("/api/reports", createReportHandler);
router.get("/api/settings", getSettingsHandler);
router.put("/api/settings", updateSettingsHandler);
router.post("/meta/sync", metaSyncHandler);
router.get("/meta/stats", metaStatsHandler);
router.post("/meta/refresh", metaRefreshHandler);
router.get("/meta/status", metaStatusHandler);
router.get("/auth/facebook", facebookAuthHandler);
router.get("/auth/facebook/callback", facebookCallbackHandler);
router.get("/admin", async (context) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;
  return renderAdminPage();
});
router.get("/manage/telegram/webhook", manageWebhookHandler);
router.post("/manage/telegram/webhook", manageWebhookHandler);

router.post("/telegram/:botId", async (context) => {
  const token = context.env.TELEGRAM_TOKEN;
  if (!token) {
    return jsonResponse({ ok: false, error: "TELEGRAM_TOKEN is not configured" }, { status: 500 });
  }
  const botId = token.split(":")[0];
  if (botId !== context.params.botId) {
    return jsonResponse({ ok: false, error: "Invalid bot id" }, { status: 403 });
  }
  const payload = await readJsonBody<Record<string, unknown>>(context.request);
  if (!payload) {
    return jsonResponse({ ok: false, error: "Missing payload" }, { status: 400 });
  }
  return handleUpdate(context.env, payload as never);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return router.handle(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      env.KV_LOGS.put(`cron:${Date.now()}`, JSON.stringify({
        type: "scheduled",
        scheduledTime: controller.scheduledTime,
        timestamp: new Date().toISOString(),
      })),
    );
  },
};
