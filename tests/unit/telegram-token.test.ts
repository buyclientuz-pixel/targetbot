import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveTelegramToken } from "../../src/config/telegram";

const baseEnv = {
  KV: {} as KVNamespace,
  R2: {} as R2Bucket,
  LEADS_KV: {} as KVNamespace,
};

describe("resolveTelegramToken", () => {
  it("prefers TELEGRAM_BOT_TOKEN when both variables exist", () => {
    const env = { ...baseEnv, TELEGRAM_BOT_TOKEN: "primary", BOT_TOKEN: "legacy" };
    assert.equal(resolveTelegramToken(env), "primary");
  });

  it("falls back to BOT_TOKEN when TELEGRAM_BOT_TOKEN is missing", () => {
    const env = { ...baseEnv, BOT_TOKEN: "legacy" };
    assert.equal(resolveTelegramToken(env), "legacy");
  });

  it("returns undefined when neither variable is set", () => {
    const env = { ...baseEnv };
    assert.equal(resolveTelegramToken(env), undefined);
  });
});
