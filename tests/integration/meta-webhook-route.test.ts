import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket, TestExecutionContext } from "../utils/mocks.ts";
import { R2_KEYS } from "../../src/config/r2.ts";
import type { DispatchProjectMessageOptions } from "../../src/services/project-messaging.ts";
import "../utils/url-pattern.ts";

const { createRouter } = await import("../../src/worker/router.ts");
const { registerMetaRoutes } = await import("../../src/routes/meta.ts");
const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { createDefaultProjectSettings, upsertProjectSettings } = await import(
  "../../src/domain/project-settings.ts",
);

test("Meta webhook route persists leads and dispatches Telegram notifications", async () => {
  let lastMessage: { token: string | undefined; text: string; chatId: number | null } | null = null;
  let lastRoute: string | null = null;

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

  const router = createRouter();
  registerMetaRoutes(router, {
    dispatchProjectMessage: async (options: DispatchProjectMessageOptions) => {
      lastMessage = {
        token: options.token,
        text: options.text,
        chatId: options.settings?.chatId ?? null,
      };
      lastRoute = options.route ?? null;
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
  assert.match(lastMessage?.text ?? "", /Лид ожидает ответа/);
  assert.equal(lastMessage?.chatId, -1003269756488);
  assert.equal(lastRoute, "CHAT");
});

test("Lead notifications honor chat/admin toggles", async () => {
  let dispatchCount = 0;
  let lastRoute: string | null = null;

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

  const defaults = createDefaultProjectSettings("birlash");
  await upsertProjectSettings(kv, {
    ...defaults,
    projectId: "birlash",
    chatId: -1003269756488,
    leads: { sendToChat: false, sendToAdmin: true },
  });

  const router = createRouter();
  registerMetaRoutes(router, {
    dispatchProjectMessage: async (options: DispatchProjectMessageOptions) => {
      dispatchCount += 1;
      lastRoute = options.route ?? null;
      return {
        delivered: { chat: options.route !== "ADMIN", admin: options.route !== "CHAT" },
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

  const execution = new TestExecutionContext();
  const request = new Request("https://example.com/api/meta/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const response = await router.dispatch(request, env, execution);
  await execution.flush();
  assert.equal(response.status, 200);
  assert.equal(dispatchCount, 1);
  assert.equal(lastRoute, "ADMIN");

  await upsertProjectSettings(kv, {
    ...defaults,
    projectId: "birlash",
    chatId: -1003269756488,
    leads: { sendToChat: false, sendToAdmin: false },
  });

  const secondExecution = new TestExecutionContext();
  const secondResponse = await router.dispatch(
    new Request("https://example.com/api/meta/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    env,
    secondExecution,
  );
  await secondExecution.flush();
  assert.equal(secondResponse.status, 200);
  assert.equal(dispatchCount, 1, "notifications stay disabled when both toggles are off");
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
