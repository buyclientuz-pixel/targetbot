import assert from "node:assert/strict";
import test from "node:test";

import { MemoryR2Bucket } from "../utils/mocks.ts";

const { R2Client } = await import("../../src/infra/r2.ts");
const { mergeProjectLeadsList } = await import("../../src/services/project-leads-list.ts");
const { putProjectLeadsList } = await import("../../src/domain/spec/project-leads.ts");
const { createLead } = await import("../../src/domain/leads.ts");

test("mergeProjectLeadsList deduplicates leads and tracks stats", async () => {
  const r2 = new R2Client(new MemoryR2Bucket());
  await putProjectLeadsList(r2, "proj-list", {
    stats: { total: 1, today: 0 },
    leads: [
      {
        id: "existing",
        name: "Old lead",
        phone: "+998900000111",
        createdAt: "2025-11-15T09:00:00.000Z",
        source: "facebook",
        campaignName: "Campaign A",
        status: "new",
        type: "lead",
      },
    ],
    syncedAt: "2025-11-15T09:05:00.000Z",
  });

  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const leads = [
    createLead({ id: "existing", projectId: "proj-list", name: "Updated", phone: "+998900000222", createdAt: earlier }),
    createLead({ id: "fresh", projectId: "proj-list", name: "Message", phone: null, createdAt: now }),
  ];
  leads[0]!.status = "IN_PROGRESS";

  const merged = await mergeProjectLeadsList(r2, "proj-list", leads);
  assert.equal(merged.leads.length, 2);
  assert.equal(merged.leads[0]?.id, "fresh");
  assert.equal(merged.leads[0]?.type, "message");
  assert.equal(merged.leads[1]?.id, "existing");
  assert.equal(merged.leads[1]?.phone, "+998900000222");
  assert.equal(merged.leads[1]?.status, "processing");
  assert.equal(merged.stats.total, 2);
  assert.ok(merged.stats.today >= 1);
  assert.ok(typeof merged.syncedAt === "string");
});
