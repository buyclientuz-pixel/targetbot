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
const { createProject, putProject } = await import("../../src/domain/projects.ts");
const { createDefaultProjectSettings, upsertProjectSettings } = await import(
  "../../src/domain/project-settings.ts"
);

test("Meta webhook route persists leads and dispatches Telegram alerts", async () => {
  const sendMessageCalls: Array<{ token: string | undefined; text: string; chatId: number | null }>
    = [];

  const kvNamespace = new MemoryKVNamespace();
  const r2Bucket = new MemoryR2Bucket();
  const env = {
    KV: kvNamespace,
    R2: r2Bucket,
    TELEGRAM_BOT_TOKEN: "TEST_TOKEN",
  } satisfies import("../../src/worker/types.ts").TargetBotEnv;

  const kv = new KvClient(kvNamespace);
  const project = createProject({
    id: "birlash",
    name: "birlash",
    adsAccountId: "act_813372877848888",
    ownerTelegramId: 123456789,
  });
  await putProject(kv, project);

  const settings = createDefaultProjectSettings(project.id);
  settings.alerts.route = "CHAT";
  settings.alerts.leadNotifications = true;
  settings.chatId = -1003269756488;
  settings.topicId = 987;
  await upsertProjectSettings(kv, settings);

  const router = createRouter();
  registerMetaRoutes(router, {
    dispatchProjectMessage: async (options: DispatchProjectMessageOptions) => {
      sendMessageCalls.push({
        token: options.token,
        text: options.text,
        chatId: options.settings?.chatId ?? null,
      });
      return {
        settings: options.settings,
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

  assert.equal(response.status, 200);
  const raw = await response.clone().text();
  const body = JSON.parse(raw) as { processed?: Array<{ leadId: string; notificationsDispatched: boolean }> };
  assert.equal(body.processed.length, 1);
  assert.deepEqual(body.processed[0], {
    projectId: "birlash",
    leadId: "343782",
    stored: true,
    duplicate: false,
    notificationsDispatched: true,
  });

  const r2 = new R2Client(r2Bucket);
  const stored = await r2.getJson(R2_KEYS.lead("birlash", "343782"));
  assert.ok(stored);
  assert.equal(stored?.id, "343782");
  assert.equal(stored?.projectId, "birlash");
  assert.equal(stored?.phone, "+998902867999");
  assert.equal(stored?.status, "NEW");

  assert.equal(sendMessageCalls.length, 1);
  const [notification] = sendMessageCalls;
  assert.equal(notification.token, "TEST_TOKEN");
  assert.match(notification.text, /🔔 Новый лид/);
  assert.equal(notification.chatId, -1003269756488);
});
