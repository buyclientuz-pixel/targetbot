import assert from "node:assert/strict";
import test from "node:test";

import { KV_KEYS } from "../../src/config/kv";
import { getBotSession } from "../../src/domain/bot-sessions";
import { KvClient } from "../../src/infra/kv";
import { MemoryKVNamespace } from "../utils/mocks";

test("getBotSession tolerates malformed JSON", async () => {
  const kv = new KvClient(new MemoryKVNamespace());
  await kv.put(KV_KEYS.botSession(500), "not-json");

  const session = await getBotSession(kv, 500);

  assert.equal(session.userId, 500);
  assert.equal(session.state.type, "idle");
  assert.equal(await kv.get(KV_KEYS.botSession(500)), null);
});
