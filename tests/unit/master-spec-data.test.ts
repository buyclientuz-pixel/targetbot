import assert from "node:assert/strict";
import test from "node:test";

import { parseAlertsRecord, serialiseAlertsRecord } from "../../src/domain/spec/alerts";
import { parseAutoreportsRecord } from "../../src/domain/spec/autoreports";
import { parseBillingRecord } from "../../src/domain/spec/billing";
import { parseFbAuthRecord, serialiseFbAuthRecord } from "../../src/domain/spec/fb-auth";
import { parseMetaCampaignsDocument } from "../../src/domain/spec/meta-campaigns";
import { parsePaymentsHistoryDocument } from "../../src/domain/spec/payments-history";
import { parseProjectLeadsListRecord } from "../../src/domain/spec/project-leads";
import { parseProjectRecord, serialiseProjectRecord } from "../../src/domain/spec/project";
import { parseProjectsByUserRecord } from "../../src/domain/spec/projects-by-user";

test("fb auth record matches schema", () => {
  const sample = {
    user_id: 7623982602,
    access_token: "EAAG",
    expires_at: "2026-01-13T08:23:00Z",
    ad_accounts: [
      { id: "act_1", name: "birlash", currency: "USD" },
      { id: "act_2", name: "test", currency: "USD" },
    ],
  };

  const parsed = parseFbAuthRecord(sample);
  assert.equal(parsed.userId, 7623982602);
  assert.equal(parsed.adAccounts.length, 2);

  const serialised = serialiseFbAuthRecord(parsed);
  assert.deepEqual(serialised, sample);
});

test("project record round trip", () => {
  const sample = {
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

  const parsed = parseProjectRecord(sample);
  assert.equal(parsed.settings.kpi.type, "LEAD");
  assert.equal(parsed.chatId, -100);

  const serialised = serialiseProjectRecord(parsed);
  assert.deepEqual(serialised, sample);
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
