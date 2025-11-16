import assert from "node:assert/strict";
import test from "node:test";

const { resolveDatePreset } = await import("../../src/services/meta-api.ts");

test("resolveDatePreset clamps max period to Meta's 37-month limit", () => {
  const realNow = Date.now;
  const fixedNow = new Date("2025-11-16T00:00:00.000Z");
  Date.now = () => fixedNow.getTime();
  try {
    const period = resolveDatePreset("max");
    assert.equal(period.preset, "time_range");
    assert.equal(period.to, "2025-11-16");
    assert.equal(period.from, "2022-10-17");
  } finally {
    Date.now = realNow;
  }
});
