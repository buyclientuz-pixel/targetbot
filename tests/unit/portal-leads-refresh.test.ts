import assert from "node:assert/strict";
import test from "node:test";

const { shouldRefreshLeadSnapshot } = await import("../../src/routes/portal.ts");

test("lead snapshot refresh is required when record is missing", () => {
  assert.equal(shouldRefreshLeadSnapshot(null), true);
});

test("lead snapshot refresh is required when syncedAt is missing or invalid", () => {
  assert.equal(
    shouldRefreshLeadSnapshot({
      stats: { total: 0, today: 0 },
      leads: [],
      syncedAt: null,
    }),
    true,
  );
  assert.equal(
    shouldRefreshLeadSnapshot({
      stats: { total: 0, today: 0 },
      leads: [],
      syncedAt: "invalid",
    }),
    true,
  );
});

test("lead snapshot refresh is required when snapshot is stale", () => {
  const stale = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  assert.equal(
    shouldRefreshLeadSnapshot({
      stats: { total: 1, today: 0 },
      leads: [
        {
          id: "lead-1",
          name: "A",
          phone: "",
          createdAt: stale,
          source: "facebook",
          campaignName: "C",
          status: "new",
          type: null,
        },
      ],
      syncedAt: stale,
    }),
    true,
  );
});

test("lead snapshot refresh is skipped when snapshot is fresh", () => {
  const fresh = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  assert.equal(
    shouldRefreshLeadSnapshot({
      stats: { total: 1, today: 1 },
      leads: [
        {
          id: "lead-1",
          name: "A",
          phone: "",
          createdAt: fresh,
          source: "facebook",
          campaignName: "C",
          status: "new",
          type: null,
        },
      ],
      syncedAt: fresh,
    }),
    false,
  );
});
