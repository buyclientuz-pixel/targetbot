import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { metaSyncHandler } from "../meta/sync";
import { metaStatusHandler } from "../meta/status";
import { createContext } from "./helpers";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [
          { id: "1", name: "Test Campaign", status: "ACTIVE", effective_status: "ACTIVE" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

describe("metaSyncHandler", () => {
  it("fetches campaigns and stores summary", async () => {
    const base = createContext({
      request: new Request("https://example.com/meta/sync?key=test&ad_account_id=act_123", { method: "POST" }),
    });
    await base.env.KV_META.put("meta:token", JSON.stringify({ accessToken: "token", updatedAt: new Date().toISOString() }));
    const response = await metaSyncHandler(base);
    const body = await response.json();
    expect(body.summary.total).toBe(1);
    const stored = await base.env.KV_META.get("meta:sync:act_123");
    expect(stored).toBeTruthy();
    expect(mockFetch).toHaveBeenCalled();
  });

  it("accepts account id from request body and updates token", async () => {
    const base = createContext({
      request: new Request("https://example.com/meta/sync?key=test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ad_account_id: "act_body", campaign_id: "cmp_1" }),
      }),
    });
    await base.env.KV_META.put("meta:token", JSON.stringify({ accessToken: "token", updatedAt: new Date().toISOString() }));
    await metaSyncHandler(base);
    const stored = await base.env.KV_META.get("meta:sync:act_body");
    expect(stored).toBeTruthy();
    const updatedTokenRaw = await base.env.KV_META.get("meta:token");
    expect(updatedTokenRaw).toBeTruthy();
    const updatedToken = JSON.parse(updatedTokenRaw!);
    expect(updatedToken.accountId).toBe("act_body");
    expect(updatedToken.campaignId).toBe("cmp_1");
  });
});

describe("metaStatusHandler", () => {
  it("summarizes current meta configuration", async () => {
    const base = createContext({
      request: new Request("https://example.com/meta/status?key=test"),
    });
    await base.env.KV_META.put(
      "meta:token",
      JSON.stringify({
        accessToken: "secret-token-value",
        updatedAt: "2024-05-20T10:00:00.000Z",
        expiresAt: "2024-06-20T10:00:00.000Z",
        accountId: "act_status",
      }),
    );
    await base.env.KV_META.put(
      "meta:stats:last",
      JSON.stringify({
        updatedAt: "2024-05-21T10:00:00.000Z",
        totals: { spend: 100, leads: 5, clicks: 120, impressions: 4000, cpl: 20, ctr: 0.03 },
        insights: [],
      }),
    );
    await base.env.KV_META.put(
      "meta:sync:act_status",
      JSON.stringify({ fetchedAt: "2024-05-21T11:00:00.000Z", accountId: "act_status", total: 3 }),
    );

    const response = await metaStatusHandler(base);
    const body = await response.json();
    expect(body.connected).toBe(true);
    expect(body.token.accountId).toBe("act_status");
    expect(body.summary).toBeTruthy();
    expect(body.lastSync.accountId).toBe("act_status");
  });
});
