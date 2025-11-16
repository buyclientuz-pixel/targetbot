import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";

const { KvClient } = await import("../../src/infra/kv.ts");
const { R2Client } = await import("../../src/infra/r2.ts");
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
              field_data: [{ name: "full_name", values: [{ value: "Сообщение" }] }],
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
    assert.equal(result.fetched, 2);
    assert.equal(result.stored, 2);
    const storedLead = await getLead(r2, "proj-sync-leads", "lead-sync-1");
    assert.equal(storedLead?.phone, "+998900000333");
    const summary = await getProjectLeadsList(r2, "proj-sync-leads");
    assert.equal(summary?.leads.length, 2);
    assert.equal(summary?.leads[0]?.id, "lead-sync-2");
    assert.equal(summary?.leads[0]?.type, "message");
  } finally {
    restore();
  }
});
