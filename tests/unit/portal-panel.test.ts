import assert from "node:assert/strict";
import test from "node:test";
import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { render: renderPortalPanel } = await import("../../src/bot/panels/portal.ts");
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { createDefaultProjectSettings, upsertProjectSettings } = await import("../../src/domain/project-settings.ts");
const { savePortalSyncState } = await import("../../src/domain/portal-sync.ts");

const createRuntime = () => ({
  kv: new KvClient(new MemoryKVNamespace()),
  r2: new R2Client(new MemoryR2Bucket()),
  workerUrl: "https://example.com",
  defaultTimezone: "Asia/Tashkent",
  getFacebookOAuthUrl: () => null,
  telegramToken: "token",
  telegramSecret: "secret",
  adminIds: [],
});

test("portal panel prompts to create portal when link is missing", async () => {
  const runtime = createRuntime();
  await putProjectRecord(runtime.kv, {
    id: "proj-panel",
    name: "Panel Test",
    ownerId: 1,
    adAccountId: "act_1",
    chatId: null,
    portalUrl: "",
    settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
  });
  const panel = await renderPortalPanel({ runtime, userId: 1, chatId: 1, panelId: "project:portal:proj-panel", params: ["proj-panel"] });
  assert.match(panel.text, /Портал проекта <b>Panel Test<\/b>/);
  assert.match(panel.text, /Ссылка не создана/);
  assert.equal(panel.keyboard.inline_keyboard[0]?.[0]?.callback_data, "project:portal-create:proj-panel");
});

test("portal panel shows status and actions when portal exists", async () => {
  const runtime = createRuntime();
  await putProjectRecord(runtime.kv, {
    id: "proj-ready",
    name: "Ready",
    ownerId: 1,
    adAccountId: "act_1",
    chatId: null,
    portalUrl: "https://example.com/p/proj-ready",
    settings: { currency: "USD", timezone: "Asia/Tashkent", kpi: { mode: "auto", type: "LEAD", label: "Лиды" } },
  });
  const settings = createDefaultProjectSettings("proj-ready");
  await upsertProjectSettings(runtime.kv, { ...settings, projectId: "proj-ready", portalEnabled: false });
  await savePortalSyncState(runtime.kv, {
    projectId: "proj-ready",
    periodKeys: ["today"],
    lastRunAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    lastErrorAt: new Date().toISOString(),
    lastErrorMessage: "token expired",
  });
  const panel = await renderPortalPanel({ runtime, userId: 1, chatId: 1, panelId: "project:portal:proj-ready", params: ["proj-ready"] });
  assert.match(panel.text, /https:\/\/example\.com\/p\/proj-ready/);
  assert.match(panel.text, /Автообновление: выключено/);
  assert.match(panel.text, /Периоды синхронизации: сегодня/);
  assert.match(panel.text, /token expired/);
  const toggleButton = panel.keyboard.inline_keyboard.find((row) => row[0]?.callback_data?.startsWith("project:portal-toggle"));
  assert.ok(toggleButton);
  assert.equal(panel.keyboard.inline_keyboard.at(-1)?.[0]?.callback_data, "project:card:proj-ready");
});
