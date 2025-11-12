import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { metaSyncHandler } from "../meta/sync";
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
});
