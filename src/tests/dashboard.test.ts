import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dashboardHandler } from "../api/dashboard";
import { createContext } from "./helpers";
import { createLead } from "../core/db";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

describe("dashboard api", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            url: "https://example.com/telegram",
            pending_update_count: 2,
            has_custom_certificate: false,
          },
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
    }
  });

  it("returns aggregated dashboard metrics", async () => {
    const base = createContext();
    const env = base.env;

    const leadToday = await createLead(env, {
      name: "Сегодня",
      contact: "today@example.com",
      status: "new",
      source: "telegram",
      notes: "",
      userId: 1,
    });
    await env.KV_LEADS.put(
      `lead:${leadToday.id}`,
      JSON.stringify({ ...leadToday, createdAt: "2024-05-21T10:00:00.000Z", updatedAt: "2024-05-21T10:05:00.000Z" }),
    );

    const leadYesterday = await createLead(env, {
      name: "Вчера",
      contact: "yesterday@example.com",
      status: "closed",
      source: "facebook",
      notes: "",
      userId: 2,
    });
    await env.KV_LEADS.put(
      `lead:${leadYesterday.id}`,
      JSON.stringify({
        ...leadYesterday,
        createdAt: "2024-05-20T08:00:00.000Z",
        updatedAt: "2024-05-20T08:30:00.000Z",
      }),
    );

    await env.KV_META.put(
      "meta:stats:last",
      JSON.stringify({
        updatedAt: "2024-05-21T12:00:00.000Z",
        totals: {
          spend: 120,
          leads: 6,
          clicks: 200,
          impressions: 4000,
          cpl: 20,
          ctr: 0.05,
        },
        insights: [],
      }),
    );

    const request = new Request("https://example.com/api/dashboard", {
      headers: { "x-auth-key": "test" },
    });
    const response = await dashboardHandler(createContext({ env, request }));
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.snapshot.leads.today).toBe(1);
    expect(body.snapshot.leads.yesterday).toBe(1);
    expect(body.snapshot.leads.statuses.new).toBeGreaterThanOrEqual(1);
    expect(body.snapshot.meta.totals.spend).toBe(120);
    expect(body.snapshot.telegramWebhook.url).toBe("https://example.com/telegram");
    expect(fetchMock).toHaveBeenCalledWith("https://api.telegram.org/bot123:token/getWebhookInfo");
  });
});
