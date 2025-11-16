import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ensureAdminRequest } from "../../src/services/admin-auth.ts";
import type { RequestContext } from "../../src/worker/context.ts";
import type { TargetBotEnv } from "../../src/worker/types.ts";

type MinimalCtx = Pick<RequestContext, "request" | "env"> & Partial<RequestContext>;

const makeContext = (adminKey: string | null, header?: Record<string, string>): RequestContext => {
  const env = {
    ADMIN_KEY: adminKey ?? undefined,
    KV: {} as KVNamespace,
    R2: {} as R2Bucket,
  } satisfies TargetBotEnv;
  const request = new Request("https://example.com", { headers: header });
  return {
    request,
    env,
  } as MinimalCtx as RequestContext;
};

describe("ensureAdminRequest", () => {
  it("accepts quoted ADMIN_KEY and trims quotes in header", () => {
    const ctx = makeContext('"!Lyas123"', { "x-admin-key": '"!Lyas123"' });
    assert.equal(ensureAdminRequest(ctx), null);
  });

  it("rejects mismatched key even with quotes", () => {
    const ctx = makeContext('"!Lyas123"', { "x-admin-key": '"wrong"' });
    const response = ensureAdminRequest(ctx);
    assert.equal(response?.status, 401);
  });

  it("accepts bearer tokens with surrounding quotes", () => {
    const ctx = makeContext('"token"', { Authorization: '"Bearer token"' });
    assert.equal(ensureAdminRequest(ctx), null);
  });

  it("falls back to default admin key when env is empty", () => {
    const ctx = makeContext(null, { "x-admin-key": "3590" });
    assert.equal(ensureAdminRequest(ctx), null);
  });
});
