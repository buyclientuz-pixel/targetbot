import assert from "node:assert/strict";
import test from "node:test";

import { parseAlertsRecord, serialiseAlertsRecord } from "../../src/domain/spec/alerts";
import { parseAutoreportsRecord } from "../../src/domain/spec/autoreports";
import { parseBillingRecord } from "../../src/domain/spec/billing";
import { getFbAuthRecord, parseFbAuthRecord, serialiseFbAuthRecord } from "../../src/domain/spec/fb-auth";
import { parseMetaCampaignsDocument } from "../../src/domain/spec/meta-campaigns";
import { parsePaymentsHistoryDocument } from "../../src/domain/spec/payments-history";
import { parseProjectLeadsListRecord } from "../../src/domain/spec/project-leads";
import { parseProjectRecord, serialiseProjectRecord } from "../../src/domain/spec/project";
import { parseProjectsByUserRecord } from "../../src/domain/spec/projects-by-user";
import { KV_KEYS } from "../../src/config/kv";
import { KvClient } from "../../src/infra/kv";
import { MemoryKVNamespace } from "../utils/mocks";

test("fb auth record matches schema", () => {
  const snakeCase = {
    user_id: 7623982602,
    access_token: "EAAG",
    expires_at: "2026-01-13T08:23:00Z",
    facebook_user_id: "fb_7623982602",
    facebook_name: "Meta User",
    ad_accounts: [
      { id: "act_1", name: "birlash", currency: "USD", account_status: 1 },
      { id: "act_2", name: "test", currency: "USD", account_status: 2 },
    ],
  };

  const parsedSnake = parseFbAuthRecord(snakeCase);
  assert.equal(parsedSnake.userId, 7623982602);
  assert.equal(parsedSnake.adAccounts.length, 2);
  assert.equal(parsedSnake.facebookUserId, "fb_7623982602");
  assert.equal(parsedSnake.facebookName, "Meta User");

  const serialised = serialiseFbAuthRecord(parsedSnake);
  assert.equal(serialised.user_id, 7623982602);
  assert.equal(serialised.userId, 7623982602);
  assert.equal(serialised.access_token, "EAAG");
  assert.equal(serialised.longToken, "EAAG");
  assert.equal(serialised.accounts?.length, 2);
  assert.equal(serialised.facebook_user_id, "fb_7623982602");
  assert.equal(serialised.facebook_name, "Meta User");

  const camelCase = {
    userId: 100,
    longToken: "token",
    expiresAt: "2026-01-01T00:00:00Z",
    accounts: [{ id: "act_1", name: "Test", currency: "USD", account_status: 1 }],
    facebookUserId: "fb_100",
    facebookName: "FB Test",
  };
  const parsedCamel = parseFbAuthRecord(camelCase);
  assert.equal(parsedCamel.userId, 100);
  assert.equal(parsedCamel.accessToken, "token");
  assert.equal(parsedCamel.adAccounts[0]?.name, "Test");
  assert.equal(parsedCamel.facebookUserId, "fb_100");
  assert.equal(parsedCamel.facebookName, "FB Test");
});

test("project record round trip", () => {
  const snakeCase = {
    id: "proj_a",
    name: "Project A",
    owner_id: 100,
    ad_account_id: "act_1",
    chat_id: -100,
    portal_url: "https://example/p/proj_a",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: {
        mode: "auto",
        type: "LEAD",
        label: "Лиды",
      },
    },
  };

  const parsed = parseProjectRecord(snakeCase);
  assert.equal(parsed.settings.kpi.type, "LEAD");
  assert.equal(parsed.chatId, -100);

  const serialised = serialiseProjectRecord(parsed);
  assert.equal(serialised.owner_id, 100);
  assert.equal(serialised.ownerId, 100);
  assert.equal(serialised.portal_url, snakeCase.portal_url);
  assert.equal(serialised.portalUrl, snakeCase.portal_url);
});

test("project record supports camelCase payload", () => {
  const camelCase = {
    id: "proj_b",
    name: "Project B",
    ownerTelegramId: 200,
    adsAccountId: "act_2",
    chatId: -200,
    portalUrl: "https://example/p/proj_b",
    settings: {
      currency: "USD",
      timezone: "Asia/Tashkent",
      kpi: { mode: "manual", type: "MESSAGE", label: "Сообщения" },
    },
  };

  const parsed = parseProjectRecord(camelCase);
  assert.equal(parsed.ownerId, 200);
  assert.equal(parsed.adAccountId, "act_2");
  assert.equal(parsed.portalUrl, camelCase.portalUrl);
});

test("projects by user list", () => {
  const parsed = parseProjectsByUserRecord({ projects: ["proj_1", "proj_2"] });
  assert.deepEqual(parsed.projects, ["proj_1", "proj_2"]);
});

test("billing and alerts parsing", () => {
  const billing = parseBillingRecord({
    tariff: 500,
    currency: "USD",
    next_payment_date: "2025-12-15",
    autobilling: true,
  });
  assert.equal(billing.nextPaymentDate, "2025-12-15");

  const alerts = parseAlertsRecord({
    enabled: true,
    channel: "both",
    types: {
      lead_in_queue: true,
      pause_24h: true,
      payment_reminder: false,
    },
    lead_queue_threshold_hours: 1,
    pause_threshold_hours: 24,
    payment_reminder_days: [7, 1],
  });
  assert.equal(alerts.types.leadInQueue, true);

  const serialisedAlerts = serialiseAlertsRecord(alerts);
  assert.equal(serialisedAlerts.types.lead_in_queue, true);
});

test("autoreports parsing", () => {
  const record = parseAutoreportsRecord({
    enabled: true,
    time: "10:00",
    mode: "yesterday_plus_week",
    send_to: "both",
  });
  assert.equal(record.mode, "yesterday_plus_week");
});

test("project leads list", () => {
  const sample = {
    stats: { total: 168, today: 2 },
    leads: [
      {
        id: "lead_1",
        name: "Farhod",
        phone: "+998",
        created_at: "2025-11-14T16:35:00Z",
        source: "Facebook",
        campaign_name: "BirLash",
        status: "new",
      },
    ],
    synced_at: "2025-11-14T17:00:00Z",
  };
  const parsed = parseProjectLeadsListRecord(sample);
  assert.equal(parsed.leads[0].status, "new");
});

test("meta campaigns document", () => {
  const sample = {
    period: { from: "2025-11-15", to: "2025-11-15" },
    summary: { spend: 17.28, impressions: 6500, clicks: 120, leads: 5, messages: 8 },
    campaigns: [
      {
        id: "123",
        name: "BirLash",
        objective: "LEAD_GENERATION",
        kpi_type: "LEAD",
        spend: 10.5,
        impressions: 3200,
        clicks: 60,
        leads: 3,
        messages: 0,
      },
    ],
  };
  const parsed = parseMetaCampaignsDocument(sample);
  assert.equal(parsed.campaigns[0].kpiType, "LEAD");
});

test("payments history parsing", () => {
  const sample = {
    payments: [
      {
        id: "pay_1",
        amount: 500,
        currency: "USD",
        period_from: "2025-11-15",
        period_to: "2025-12-15",
        paid_at: "2025-11-15T18:11:00Z",
        status: "paid",
        comment: "Оплата",
      },
    ],
  };
  const parsed = parsePaymentsHistoryDocument(sample);
  assert.equal(parsed.payments[0].status, "paid");
});

test("getFbAuthRecord skips malformed records and allows re-auth", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  await kv.putJson(KV_KEYS.facebookAuth(200), { user_id: 200, access_token: "EAAG" });

  const missing = await getFbAuthRecord(kv, 200);
  assert.equal(missing, null);
  assert.equal(await kv.getJson(KV_KEYS.facebookAuth(200)), null);

  await kv.putJson(KV_KEYS.fbAuth(200), {
    user_id: 200,
    access_token: "EAAG",
    expires_at: "2026-01-01T00:00:00Z",
    ad_accounts: [{ id: "act_1", name: "BirLash", currency: "USD", account_status: 1 }],
  });

  const record = await getFbAuthRecord(kv, 200);
  assert.ok(record);
  assert.equal(record?.adAccounts.length, 1);
});
