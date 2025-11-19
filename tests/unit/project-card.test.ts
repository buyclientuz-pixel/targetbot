import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectCardMessage } from "../../src/bot/messages.ts";
import type { ProjectBundle } from "../../src/bot/data.ts";

test("buildProjectCardMessage renders project snapshot", () => {
  const bundle: ProjectBundle = {
    project: {
      id: "proj_a",
      name: "BirLash",
      ownerId: 1,
      adAccountId: "act_123",
      chatId: -100123,
      portalUrl: "https://example.test/p/proj_a",
      settings: {
        currency: "USD",
        timezone: "Asia/Tashkent",
        kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
      },
    },
    billing: { tariff: 500, currency: "USD", nextPaymentDate: "2025-12-15", autobilling: true },
    autoreports: {
      enabled: true,
      time: "10:00",
      mode: "yesterday_plus_week",
      sendToChat: true,
      sendToAdmin: true,
      paymentAlerts: {
        enabled: false,
        sendToChat: true,
        sendToAdmin: true,
        lastAccountStatus: null,
        lastAlertAt: null,
      },
    },
    leads: {
      stats: { total: 168, today: 2 },
      leads: [
        {
          id: "lead_1",
          name: "Sharofat",
          phone: "+998",
          createdAt: new Date().toISOString(),
          source: "facebook",
          campaignName: "Test",
          status: "new",
          type: null,
        },
      ],
      syncedAt: new Date().toISOString(),
    },
    campaigns: {
      period: { from: "2025-11-14", to: "2025-11-14" },
      summary: { spend: 16.15, impressions: 1000, clicks: 120, leads: 2, messages: 0 },
      campaigns: [
        {
          id: "c1",
          name: "Lead Ads",
          objective: "LEAD_GENERATION",
          kpiType: "LEAD",
          spend: 16.15,
          impressions: 1000,
          clicks: 120,
          leads: 2,
          messages: 0,
        },
      ],
    },
    payments: { payments: [] },
  };

  const message = buildProjectCardMessage(bundle);
  assert.match(message, /🏗 Проект: <b>BirLash<\/b>/);
  assert.match(message, /🧩 Meta: подключено — <b>BirLash \(act_123\)<\/b>/);
  assert.match(message, /💬 Лиды: <b>2<\/b> \(сегодня\) \| <b>168<\/b> \(всего\)/);
  assert.match(message, /🤖 Автобиллинг: включен/);
  assert.match(
    message,
    /🕒 Автоотчёты: <b>10:00<\/b> \(вкл, режим: вчера \+ неделя, каналы: чат \+ админ\)/,
  );
  assert.match(message, /Чат-группа: <a href="https:\/\/t\.me\/c\/100123">Перейти<\/a> \(ID: -100123\)/);
  assert.match(message, /🌐 Портал: <a href="https:\/\/example\.test\/p\/proj_a">/);
});
