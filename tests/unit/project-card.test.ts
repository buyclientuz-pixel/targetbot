import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectCardMessage } from "../../src/bot/messages.ts";
import { createDefaultProjectSettings } from "../../src/domain/project-settings.ts";
import type { Project } from "../../src/domain/projects.ts";
import type { MetaSummaryMetrics } from "../../src/domain/meta-summary.ts";

test("buildProjectCardMessage renders project snapshot", () => {
  const project: Project = {
    id: "birlash",
    name: "birlash",
    adsAccountId: "act_813372877848888",
    ownerTelegramId: 123456789,
    createdAt: "2025-11-01T10:00:00.000Z",
    updatedAt: "2025-11-15T10:00:00.000Z",
  };

  const metrics: MetaSummaryMetrics = {
    spend: 16.15,
    impressions: 1000,
    clicks: 120,
    leads: 5,
    leadsToday: 2,
    leadsTotal: 168,
    cpa: 3.23,
    spendToday: 16.15,
    cpaToday: 1.33,
  };

  const settings = createDefaultProjectSettings(project.id);
  settings.billing = {
    tariff: 500,
    currency: "USD",
    nextPaymentDate: "2025-12-15",
    autobillingEnabled: true,
  };
  settings.reports = {
    autoReportsEnabled: true,
    timeSlots: ["10:00"],
    mode: "yesterday+week",
  };
  settings.alerts = {
    leadNotifications: true,
    billingAlerts: true,
    budgetAlerts: true,
    metaApiAlerts: true,
    pauseAlerts: true,
    route: "CHAT",
  };
  settings.chatId = -1003269756488;
  settings.topicId = 123;

  const message = buildProjectCardMessage(project, settings, metrics);
  assert.match(message, /Проект: birlash/);
  assert.match(message, /Meta: подключено — birlash \(act_813372877848888\)/);
  assert.match(message, /Лиды: сегодня 2 \| всего 168/);
  assert.match(message, /Автобиллинг: включен/);
  assert.match(message, /Автоотчёты: 10:00 \(вкл, режим: yesterday\+week\)/);
  assert.match(message, /Алерты: включены \(в чат\)/);
  assert.match(message, /Чат-группа: Перейти \(ID: -1003269756488, тема 123\)/);
  assert.match(message, /Портал: Открыть клиентский портал/);
});
