import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
const { R2_KEYS } = await import("../../src/config/r2.ts");
const { createProject, putProject, getProject } = await import("../../src/domain/projects.ts");
const { createDefaultProjectSettings, upsertProjectSettings } = await import("../../src/domain/project-settings.ts");
const { createMetaToken, upsertMetaToken } = await import("../../src/domain/meta-tokens.ts");
const { getLead } = await import("../../src/domain/leads.ts");
const { getProjectLeadsList } = await import("../../src/domain/spec/project-leads.ts");
const { saveMetaLeadFormsCache } = await import("../../src/domain/meta-lead-forms-cache.ts");
const { getProjectLeadSyncState, saveProjectLeadSyncState } = await import(
  "../../src/domain/project-lead-sync-state.ts",
);
const { putProjectRecord } = await import("../../src/domain/spec/project.ts");
const { syncProjectLeadsFromMeta } = await import("../../src/services/project-leads-sync.ts");

const installLeadsStub = () => {
  const originalFetch = globalThis.fetch;
  const leadFilterValues: number[] = [];
  const accessTokens: string[] = [];
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
    if (url.hostname === "graph.facebook.com") {
      const token = url.searchParams.get("access_token");
      if (token) {
        accessTokens.push(token);
      }
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/leadgen_forms")) {
      return new Response(
        JSON.stringify({ data: [{ id: "form-sync" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/leads")) {
      const filtering = url.searchParams.get("filtering");
      if (filtering) {
        try {
          const parsed = JSON.parse(filtering) as Array<{ field?: string; value?: number }>;
          for (const entry of parsed) {
            if (entry?.field === "time_created" && typeof entry.value === "number") {
              leadFilterValues.push(entry.value);
            }
          }
        } catch {
          // ignore parsing errors for test helpers
        }
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "lead-sync-1",
              created_time: "2025-11-16T10:00:00Z",
              campaign_name: "Campaign Sync",
              field_data: [
                { name: "Full Name", values: [{ value: "Контакт" }] },
                { name: "Phone number", values: [{ value: "+998900000333" }] },
              ],
            },
            {
              id: "lead-sync-2",
              created_time: "2025-11-16T11:00:00Z",
              campaign_name: "Campaign Sync",
              field_data: [
                { name: "Full Name", values: [{ value: "Сообщение" }] },
                { name: "Сообщение", values: [{ value: "Перезвоните" }] },
              ],
            },
            {
              id: "lead-sync-3",
              created_time: "2025-11-16T12:00:00Z",
              campaign_name: "Campaign Sync",
              field_data: [
                { name: "Full Name", values: [{ value: "Email Contact" }] },
                { name: "Email Address", values: [{ value: "user@example.com" }] },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input);
  }) as typeof fetch;
  const restore = () => {
    globalThis.fetch = originalFetch;
  };
  return Object.assign(restore, { leadFilterValues, accessTokens });
};

const writeProjectRecord = async (
  kv: InstanceType<typeof KvClient>,
  project: Awaited<ReturnType<typeof createProject>>,
  overrides: Partial<import("../../src/domain/spec/project.ts").ProjectRecord> = {},
): Promise<import("../../src/domain/spec/project.ts").ProjectRecord> => {
  const record: import("../../src/domain/spec/project.ts").ProjectRecord = {
    id: project.id,
    name: overrides.name ?? project.name,
    ownerId: overrides.ownerId ?? project.ownerTelegramId,
    adAccountId: overrides.adAccountId ?? project.adsAccountId,
    chatId: overrides.chatId ?? null,
    portalUrl: overrides.portalUrl ?? `https://example.com/${project.id}`,
    settings:
      overrides.settings ?? {
        currency: "USD",
        timezone: "Asia/Tashkent",
        kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
      },
  };
  await putProjectRecord(kv, record);
  return record;
};

test("syncProjectLeadsFromMeta persists leads and updates summary", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({ id: "proj-sync-leads", name: "Sync", adsAccountId: "act_sync", ownerTelegramId: 1 });
  await putProject(kv, project);
  const projectRecord = await writeProjectRecord(kv, project);
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
      projectRecord,
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
    const state = await getProjectLeadSyncState(kv, "proj-sync-leads");
    assert.equal(state?.projectId, "proj-sync-leads");
    assert.equal(state?.lastLeadCreatedAt, "2025-11-16T12:00:00.000Z");
    assert.ok(state?.lastSyncAt);
  } finally {
    restore();
  }
});

test("syncProjectLeadsFromMeta accepts override token without facebook user", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({ id: "proj-override", name: "Override", adsAccountId: "act_override", ownerTelegramId: 3 });
  await putProject(kv, project);
  const projectRecord = await writeProjectRecord(kv, project);
  const settings = createDefaultProjectSettings("proj-override");
  await upsertProjectSettings(kv, {
    ...settings,
    projectId: "proj-override",
    portalEnabled: true,
    meta: { facebookUserId: null },
  });
  const restore = installLeadsStub();
  try {
    const result = await syncProjectLeadsFromMeta(kv, r2, "proj-override", {
      project,
      settings: { ...settings, meta: { facebookUserId: null } },
      facebookUserId: null,
      accessTokenOverride: "override-token",
      projectRecord,
    });
    assert.equal(result.fetched, 3);
    assert.equal(result.stored, 3);
    assert.ok(restore.accessTokens.every((token) => token === "override-token"));
  } finally {
    restore();
  }
});

test("syncProjectLeadsFromMeta marks syncedAt even when no new leads arrive", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({ id: "proj-empty-sync", name: "Empty", adsAccountId: "act_empty", ownerTelegramId: 2 });
  await putProject(kv, project);
  const projectRecord = await writeProjectRecord(kv, project);
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
      projectRecord,
    });
    assert.equal(result.fetched, 0);
    assert.equal(result.stored, 0);
    const summary = await getProjectLeadsList(r2, "proj-empty-sync");
    assert.equal(summary?.leads.length, 0);
    assert.ok(summary?.syncedAt);
    const state = await getProjectLeadSyncState(kv, "proj-empty-sync");
    assert.equal(state?.projectId, "proj-empty-sync");
    assert.equal(state?.lastLeadCreatedAt, null);
    assert.ok(state?.lastSyncAt);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("syncProjectLeadsFromMeta prunes leads older than retention window", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({ id: "proj-prune", name: "Prune", adsAccountId: "act_prune", ownerTelegramId: 3 });
  await putProject(kv, project);
  const projectRecord = await writeProjectRecord(kv, project);
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
      projectRecord,
    });
    assert.equal(result.fetched, 0);
    assert.equal(result.stored, 0);
    const deleted = await r2.getJson(R2_KEYS.projectLead("proj-prune", "old-lead"));
    assert.equal(deleted, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("syncProjectLeadsFromMeta narrows fetch window using lead sync cursor", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({ id: "proj-cursor", name: "Cursor", adsAccountId: "act_cursor", ownerTelegramId: 9 });
  await putProject(kv, project);
  const projectRecord = await writeProjectRecord(kv, project);
  const settings = createDefaultProjectSettings("proj-cursor");
  await upsertProjectSettings(kv, {
    ...settings,
    projectId: "proj-cursor",
    portalEnabled: true,
    meta: { facebookUserId: "fb_cursor" },
  });
  const token = createMetaToken({ facebookUserId: "fb_cursor", accessToken: "token_cursor" });
  await upsertMetaToken(kv, token);
  await saveProjectLeadSyncState(kv, {
    projectId: "proj-cursor",
    lastLeadCreatedAt: "2025-11-10T12:00:00Z",
    lastSyncAt: "2025-11-12T00:00:00Z",
  });

  const restore = installLeadsStub();
  try {
    const result = await syncProjectLeadsFromMeta(kv, r2, "proj-cursor", {
      project,
      settings: { ...settings, meta: { facebookUserId: "fb_cursor" } },
      facebookUserId: "fb_cursor",
      projectRecord,
    });
    assert.equal(result.fetched, 3);
    assert.equal(result.stored, 3);
    const firstFilter = restore.leadFilterValues[0];
    const expected = Math.floor(new Date("2025-11-10T11:45:00Z").getTime() / 1000);
    assert.equal(firstFilter, expected);
  } finally {
    restore();
  }

  const state = await getProjectLeadSyncState(kv, "proj-cursor");
  assert.equal(state?.lastLeadCreatedAt, "2025-11-16T12:00:00.000Z");
});

test("syncProjectLeadsFromMeta retries without cached-only mode when no leads are returned", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({
    id: "proj-cache-retry",
    name: "CacheRetry",
    adsAccountId: "act_cache_retry",
    ownerTelegramId: 8,
  });
  await putProject(kv, project);
  const projectRecord = await writeProjectRecord(kv, project);
  const settings = createDefaultProjectSettings("proj-cache-retry");
  await upsertProjectSettings(kv, {
    ...settings,
    projectId: "proj-cache-retry",
    portalEnabled: true,
    meta: { facebookUserId: "fb_cache_retry" },
  });
  const token = createMetaToken({ facebookUserId: "fb_cache_retry", accessToken: "token_cache_retry" });
  await upsertMetaToken(kv, token);
  await saveMetaLeadFormsCache(kv, {
    projectId: "proj-cache-retry",
    accountId: "act_cache_retry",
    fetchedAt: new Date().toISOString(),
    forms: [{ id: "form-cached", accessToken: null }],
  });

  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
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
    requests.push(url.pathname);
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/act_cache_retry/leads")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/form-cached/leads")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/act_cache_retry/leadgen_forms")) {
      return new Response(JSON.stringify({ data: [{ id: "form-fresh" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.hostname === "graph.facebook.com" && url.pathname.includes("/form-fresh/leads")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "lead-cache-recovered",
              created_time: "2025-11-17T15:00:00Z",
              campaign_name: "Recovered",
              field_data: [
                { name: "Full Name", values: [{ value: "Андрей" }] },
                { name: "Phone number", values: [{ value: "+998901234567" }] },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
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
    const result = await syncProjectLeadsFromMeta(kv, r2, "proj-cache-retry", {
      project,
      settings: { ...settings, meta: { facebookUserId: "fb_cache_retry" } },
      facebookUserId: "fb_cache_retry",
      projectRecord,
    });
    assert.equal(result.fetched, 1);
    assert.equal(result.stored, 1);
    const stored = await getLead(r2, "proj-cache-retry", "lead-cache-recovered");
    assert.equal(stored?.phone, "+998901234567");
    assert.ok(requests.some((path) => path.includes("/act_cache_retry/leadgen_forms")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("syncProjectLeadsFromMeta backfills missing ads account from project record", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  const r2 = new R2Client(new MemoryR2Bucket());
  const project = createProject({ id: "proj-record", name: "Record", adsAccountId: null, ownerTelegramId: 11 });
  await putProject(kv, project);
  const projectRecord = await writeProjectRecord(kv, project, { adAccountId: "act_record" });
  const settings = createDefaultProjectSettings("proj-record");
  await upsertProjectSettings(kv, {
    ...settings,
    projectId: "proj-record",
    portalEnabled: true,
    meta: { facebookUserId: "fb_record" },
  });
  const token = createMetaToken({ facebookUserId: "fb_record", accessToken: "token_record" });
  await upsertMetaToken(kv, token);
  const restore = installLeadsStub();
  try {
    const result = await syncProjectLeadsFromMeta(kv, r2, "proj-record", {
      project,
      settings: { ...settings, meta: { facebookUserId: "fb_record" } },
      facebookUserId: "fb_record",
      projectRecord,
    });
    assert.equal(result.fetched, 3);
    assert.equal(result.stored, 3);
    const updated = await getProject(kv, "proj-record");
    assert.equal(updated.adsAccountId, "act_record");
  } finally {
    restore();
  }
});
