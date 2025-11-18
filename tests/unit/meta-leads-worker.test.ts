import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKVNamespace, MemoryR2Bucket } from "../utils/mocks.ts";

const { parseFieldData, saveLead, listLeads } = await import("../../src/services/meta-leads-worker.ts");

const createEnv = () => ({
  KV: new MemoryKVNamespace(),
  R2: new MemoryR2Bucket(),
  LEADS_KV: new MemoryKVNamespace(),
  FACEBOOK_API_VERSION: "v18.0",
  FACEBOOK_TOKEN: "test-token",
}) as import("../../src/worker/types.ts").TargetBotEnv;

test("parseFieldData extracts name and phone from mixed cases", () => {
  const parsed = parseFieldData([
    { name: "Full Name", values: ["Aziz"] },
    { name: "Phone_number", values: [{ value: "+998900000000" }] },
  ]);
  assert.equal(parsed.name, "Aziz");
  assert.equal(parsed.phone, "+998900000000");
});

test("parseFieldData tolerates missing values", () => {
  const parsed = parseFieldData([
    { name: "Other", values: [] },
  ]);
  assert.equal(parsed.name, null);
  assert.equal(parsed.phone, null);
});

test("saveLead deduplicates entries and listLeads sorts by created_time", async () => {
  const env = createEnv();
  const first = {
    lead_id: "1",
    project_id: "act_1",
    form_id: "form_a",
    name: "First",
    phone: "+998900000001",
    created_time: "2025-01-02T10:00:00Z",
  } satisfies import("../../src/services/meta-leads-worker.ts").StoredLead;
  const second = {
    lead_id: "2",
    project_id: "act_1",
    form_id: "form_a",
    name: "Second",
    phone: "+998900000002",
    created_time: "2025-01-03T10:00:00Z",
  } satisfies import("../../src/services/meta-leads-worker.ts").StoredLead;

  assert.equal(await saveLead(env, first), true);
  assert.equal(await saveLead(env, first), false, "duplicate lead is ignored");
  assert.equal(await saveLead(env, second), true);

  const leads = await listLeads(env, "act_1");
  assert.equal(leads.length, 2);
  assert.equal(leads[0].lead_id, "2");
  assert.equal(leads[1].lead_id, "1");
});
