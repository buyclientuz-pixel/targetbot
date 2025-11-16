import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";
import { R2_KEYS } from "../../src/config/r2.ts";
import type { DispatchProjectMessageOptions } from "../../src/services/project-messaging.ts";

class SimpleURLPattern {
  private readonly segments: string[];

  constructor(init: { pathname: string }) {
    this.segments = init.pathname.split("/").filter(Boolean);
  }

  exec(url: string | URL) {
    const target = typeof url === "string" ? new URL(url) : url;
    const pathSegments = target.pathname.split("/").filter(Boolean);
    if (pathSegments.length !== this.segments.length) {
      return null;
    }
    const groups: Record<string, string> = {};
    for (let index = 0; index < this.segments.length; index += 1) {
      const patternSegment = this.segments[index];
      const actual = pathSegments[index];
      if (patternSegment.startsWith(":")) {
        groups[patternSegment.slice(1)] = actual;
      } else if (patternSegment !== actual) {
        return null;
      }
    }
    return { pathname: { input: target.pathname, groups } };
  }
}

// Polyfill URLPattern for Node test runner
(globalThis as unknown as { URLPattern?: unknown }).URLPattern ||= SimpleURLPattern;

const { createRouter } = await import("../../src/worker/router.ts");
const { registerMetaRoutes } = await import("../../src/routes/meta.ts");
const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { putAlertsRecord } = await import("../../src/domain/spec/alerts.ts");

test("Meta webhook route persists leads and dispatches Telegram alerts", async () => {
  let lastMessage: { token: string | undefined; text: string; chatId: number | null } | null = null;

  const kvNamespace = new MemoryKVNamespace();
  const r2Bucket = new MemoryR2Bucket();
  const env = {
    KV: kvNamespace,
    R2: r2Bucket,
    TELEGRAM_BOT_TOKEN: "TEST_TOKEN",
  } satisfies import("../../src/worker/types.ts").TargetBotEnv;

  const kv = new KvClient(kvNamespace);
  await putProjectRecord(kv, {
    id: "birlash",
    name: "birlash",
    ownerId: 123456789,
    adAccountId: "act_813372877848888",
    chatId: -1003269756488,
    portalUrl: "https://th-reports.buyclientuz.workers.dev/p/birlash",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  });
  await putAlertsRecord(kv, "birlash", {
    enabled: true,
    channel: "chat",
    types: { leadInQueue: true, pause24h: false, paymentReminder: false },
    leadQueueThresholdHours: 1,
    pauseThresholdHours: 24,
    paymentReminderDays: [7, 1],
  });

  const router = createRouter();
  registerMetaRoutes(router, {
    dispatchProjectMessage: async (options: DispatchProjectMessageOptions) => {
      lastMessage = {
        token: options.token,
        text: options.text,
        chatId: options.project.chatId ?? null,
      };
      return {
        delivered: { chat: true, admin: false },
      };
    },
  });

  const payload = {
    object: "page",
    entry: [
      {
        id: "123",
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: "343782",
              project_id: "birlash",
              created_time: 1731600000,
              campaign_name: "Лиды - тест",
              ad_name: "Креатив №3",
              field_data: [
                { name: "Full Name", values: ["Sharofat Ona"] },
                { name: "phone_number", values: ["+998902867999"] },
              ],
            },
          },
        ],
      },
    ],
  };

  const request = new Request("https://example.com/api/meta/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const execution = new TestExecutionContext();
  const response = await router.dispatch(request, env, execution);
  await execution.flush();

  assert.ok(response.status >= 200 && response.status < 300);

  const r2 = new R2Client(r2Bucket);
  const detail = await r2.getJson(R2_KEYS.projectLead("birlash", "343782"));
  assert.ok(detail);
  assert.equal(detail?.id, "343782");
  assert.equal(detail?.phone, "+998902867999");
  assert.equal(detail?.status, "new");

  assert.ok(lastMessage);
  assert.equal(lastMessage?.token, "TEST_TOKEN");
  assert.match(lastMessage?.text ?? "", /🔔 Новый лид/);
  assert.equal(lastMessage?.chatId, -1003269756488);
});

test("Meta webhook GET handshake enforces verify token", async () => {
  const kvNamespace = new MemoryKVNamespace();
  const r2Bucket = new MemoryR2Bucket();
  const env = {
    KV: kvNamespace,
    R2: r2Bucket,
    META_WEBHOOK_VERIFY_TOKEN: "VERIFY_SECRET",
  } satisfies import("../../src/worker/types.ts").TargetBotEnv;

  const router = createRouter();
  registerMetaRoutes(router);

  const execution = new TestExecutionContext();
  const okRequest = new Request(
    "https://example.com/api/meta/webhook?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=VERIFY_SECRET",
  );
  const okResponse = await router.dispatch(okRequest, env, execution);
  await execution.flush();

  assert.equal(okResponse.status, 200);
  assert.equal(await okResponse.text(), "12345");

  const forbiddenRequest = new Request(
    "https://example.com/api/meta/webhook?hub.mode=subscribe&hub.challenge=67890&hub.verify_token=WRONG",
  );
  const forbiddenResponse = await router.dispatch(forbiddenRequest, env, new TestExecutionContext());
  assert.equal(forbiddenResponse.status, 403);
  assert.equal(await forbiddenResponse.text(), "forbidden");
});
