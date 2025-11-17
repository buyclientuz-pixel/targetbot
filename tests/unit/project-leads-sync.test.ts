import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { R2_KEYS } = await import("../../src/config/r2.ts");
const { createProject, putProject } = await import("../../src/domain/projects.ts");
const { createDefaultProjectSettings, upsertProjectSettings } = await import("../../src/domain/project-settings.ts");
const { createMetaToken, upsertMetaToken } = await import("../../src/domain/meta-tokens.ts");
const { getLead } = await import("../../src/domain/leads.ts");
const { getProjectLeadsList } = await import("../../src/domain/spec/project-leads.ts");
const { syncProjectLeadsFromMeta } = await import("../../src/services/project-leads-sync.ts");

const installLeadsStub = () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.toString()
            : String(input);
    const url = new URL(target);
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/leadgen_forms")) {
      return new Response(
        JSON.stringify({ data: [{ id: "form-sync" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/leads")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "lead-sync-1",
              created_time: "2025-11-16T10:00:00Z",
              campaign_name: "Campaign Sync",
              field_data: [
                { name: "full_name", values: [{ value: "Контакт" }] },
                { name: "phone_number", values: [{ value: "+998900000333" }] },
              ],
            },
            {
              id: "lead-sync-2",
              created_time: "2025-11-16T11:00:00Z",
              campaign_name: "Campaign Sync",
              field_data: [
                { name: "full_name", values: [{ value: "Сообщение" }] },
                { name: "message", values: [{ value: "Перезвоните" }] },
              ],
            },
            {
              id: "lead-sync-3",
              created_time: "2025-11-16T12:00:00Z",
              campaign_name: "Campaign Sync",
              field_data: [
                { name: "full_name", values: [{ value: "Email Contact" }] },
                { name: "email", values: [{ value: "user@example.com" }] },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
};

test("syncProjectLeadsFromMeta persists leads and updates summary", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({ id: "proj-sync-leads", name: "Sync", adsAccountId: "act_sync", ownerTelegramId: 1 });
  await putProject(kv, project);
  const settings = createDefaultProjectSettings("proj-sync-leads");
  await upsertProjectSettings(kv, {
    ...settings,
    projectId: "proj-sync-leads",
    portalEnabled: true,
    meta: { facebookUserId: "fb_sync" },
  });
  const token = createMetaToken({ facebookUserId: "fb_sync", accessToken: "token" });
  await upsertMetaToken(kv, token);
  const restore = installLeadsStub();
  try {
    const result = await syncProjectLeadsFromMeta(kv, r2, "proj-sync-leads", {
      project,
      settings: { ...settings, meta: { facebookUserId: "fb_sync" } },
      facebookUserId: "fb_sync",
    });
    assert.equal(result.fetched, 3);
    assert.equal(result.stored, 3);
    const storedLead = await getLead(r2, "proj-sync-leads", "lead-sync-1");
    assert.equal(storedLead?.phone, "+998900000333");
    const messageLead = await getLead(r2, "proj-sync-leads", "lead-sync-2");
    assert.equal(messageLead?.phone, null);
    assert.equal(messageLead?.message, "Перезвоните");
    assert.equal(messageLead?.contact, "сообщение");
    const emailLead = await getLead(r2, "proj-sync-leads", "lead-sync-3");
    assert.equal(emailLead?.phone, null);
    assert.equal(emailLead?.contact, "user@example.com");
    const summary = await getProjectLeadsList(r2, "proj-sync-leads");
    assert.equal(summary?.leads.length, 3);
    assert.ok(summary?.leads.some((lead) => lead.id === "lead-sync-1" && lead.type === "lead"));
    assert.ok(summary?.leads.some((lead) => lead.id === "lead-sync-2" && lead.type === "message"));
    assert.ok(summary?.leads.some((lead) => lead.id === "lead-sync-3" && lead.phone === "user@example.com"));
    assert.ok(summary?.syncedAt);
  } finally {
    restore();
  }
});

test("syncProjectLeadsFromMeta marks syncedAt even when no new leads arrive", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({ id: "proj-empty-sync", name: "Empty", adsAccountId: "act_empty", ownerTelegramId: 2 });
  await putProject(kv, project);
  const settings = createDefaultProjectSettings("proj-empty-sync");
  await upsertProjectSettings(kv, {
    ...settings,
    projectId: "proj-empty-sync",
    portalEnabled: true,
    meta: { facebookUserId: "fb_empty" },
  });
  const token = createMetaToken({ facebookUserId: "fb_empty", accessToken: "token_empty" });
  await upsertMetaToken(kv, token);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const target = typeof input === "string" ? input : input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
    const url = new URL(target);
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [{ id: "form-empty" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/leads")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/campaigns")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input);
  }) as typeof fetch;

  try {
    const result = await syncProjectLeadsFromMeta(kv, r2, "proj-empty-sync", {
      project,
      settings: { ...settings, meta: { facebookUserId: "fb_empty" } },
      facebookUserId: "fb_empty",
    });
    assert.equal(result.fetched, 0);
    assert.equal(result.stored, 0);
    const summary = await getProjectLeadsList(r2, "proj-empty-sync");
    assert.equal(summary?.leads.length, 0);
    assert.ok(summary?.syncedAt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("syncProjectLeadsFromMeta prunes leads older than retention window", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({ id: "proj-prune", name: "Prune", adsAccountId: "act_prune", ownerTelegramId: 3 });
  await putProject(kv, project);
  const settings = createDefaultProjectSettings("proj-prune");
  await upsertProjectSettings(kv, { ...settings, projectId: "proj-prune", portalEnabled: true, meta: { facebookUserId: "fb_prune" } });
  const token = createMetaToken({ facebookUserId: "fb_prune", accessToken: "token_prune" });
  await upsertMetaToken(kv, token);

  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  await r2.putJson(R2_KEYS.projectLead("proj-prune", "old-lead"), {
    id: "old-lead",
    projectId: "proj-prune",
    name: "Legacy",
    phone: "+998900000555",
    contact: "+998900000555",
    source: "facebook",
    campaign: "Old",
    createdAt: thirtyOneDaysAgo,
    status: "new",
    lastStatusUpdate: thirtyOneDaysAgo,
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const target = typeof input === "string" ? input : input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
    const url = new URL(target);
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [{ id: "form-prune" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/leads")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/campaigns")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input);
  }) as typeof fetch;

  try {
    const result = await syncProjectLeadsFromMeta(kv, r2, "proj-prune", {
      project,
      settings: { ...settings, meta: { facebookUserId: "fb_prune" } },
      facebookUserId: "fb_prune",
    });
    assert.equal(result.fetched, 0);
    assert.equal(result.stored, 0);
    const deleted = await r2.getJson(R2_KEYS.projectLead("proj-prune", "old-lead"));
    assert.equal(deleted, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
