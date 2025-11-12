import { describe, it, expect } from "vitest";
import { createLeadHandler, listLeadsHandler } from "../api/leads";
import { deleteUserHandler, listUsersHandler } from "../api/users";
import { createContext } from "./helpers";

function requestWithBody(body: unknown, method = "POST") {
  return new Request("https://example.com/api/leads", {
    method,
    headers: {
      "content-type": "application/json",
      "x-auth-key": "test",
    },
    body: JSON.stringify(body),
  });
}

describe("leads api", () => {
  it("creates and lists leads", async () => {
    const base = createContext({ request: requestWithBody({ name: "Test", contact: "test@example.com" }) });
    const createResponse = await createLeadHandler(base);
    const createBody = await createResponse.json();
    expect(createBody.lead).toBeDefined();

    const listRequest = createContext({
      env: base.env,
      request: new Request("https://example.com/api/leads", { headers: { "x-auth-key": "test" } }),
    });
    const listResponse = await listLeadsHandler(listRequest);
    const listBody = await listResponse.json();
    expect(listBody.leads.length).toBeGreaterThan(0);
    expect(Array.isArray(listBody.available.statuses)).toBe(true);
    expect(Array.isArray(listBody.available.sources)).toBe(true);
    expect(listBody.filters.status).toBe("all");
  });

  it("filters leads by status, source and date range", async () => {
    const env = createContext().env;

    const createFirst = await createLeadHandler(
      createContext({ env, request: requestWithBody({ name: "First", contact: "first@example.com", source: "manual" }) }),
    );
    const firstBody = await createFirst.json();
    const firstRecordRaw = await env.KV_LEADS.get(`lead:${firstBody.lead.id}`);
    if (firstRecordRaw) {
      const firstRecord = JSON.parse(firstRecordRaw);
      firstRecord.status = "in_progress";
      firstRecord.createdAt = "2024-04-01T10:00:00.000Z";
      firstRecord.updatedAt = "2024-04-02T10:00:00.000Z";
      await env.KV_LEADS.put(`lead:${firstRecord.id}`, JSON.stringify(firstRecord));
    }

    const createSecond = await createLeadHandler(
      createContext({ env, request: requestWithBody({ name: "Second", contact: "second@example.com", source: "facebook" }) }),
    );
    const secondBody = await createSecond.json();
    const secondRecordRaw = await env.KV_LEADS.get(`lead:${secondBody.lead.id}`);
    if (secondRecordRaw) {
      const secondRecord = JSON.parse(secondRecordRaw);
      secondRecord.status = "closed";
      secondRecord.createdAt = "2024-05-15T12:00:00.000Z";
      secondRecord.updatedAt = "2024-05-20T08:00:00.000Z";
      await env.KV_LEADS.put(`lead:${secondRecord.id}`, JSON.stringify(secondRecord));
    }

    const filterRequest = createContext({
      env,
      request: new Request(
        "https://example.com/api/leads?status=closed&source=facebook&from=2024-05-01&to=2024-05-31",
        { headers: { "x-auth-key": "test" } },
      ),
    });
    const filteredResponse = await listLeadsHandler(filterRequest);
    const filteredBody = await filteredResponse.json();

    expect(filteredBody.leads).toHaveLength(1);
    expect(filteredBody.leads[0].id).toEqual(secondBody.lead.id);
    expect(filteredBody.filters.status).toBe("closed");
    expect(filteredBody.filters.source).toBe("facebook");
    expect(filteredBody.filters.from).toBe("2024-05-01");
    expect(filteredBody.filters.to).toBe("2024-05-31");
    expect(filteredBody.available.sources).toContain("facebook");
  });
});

describe("users api", () => {
  it("deletes user records", async () => {
    const base = createContext();
    const env = base.env;
    await env.KV_USERS.put(
      "user:99",
      JSON.stringify({
        id: 99,
        firstName: "Удалить",
        role: "client",
        token: "token",
        createdAt: new Date().toISOString(),
      }),
    );

    const deleteResponse = await deleteUserHandler(
      createContext({
        env,
        params: { id: "99" },
        request: new Request("https://example.com/api/users/99?key=test", { method: "DELETE" }),
      }),
    );
    const deleteBody = await deleteResponse.json();
    expect(deleteBody.deleted).toBe(true);

    const listResponse = await listUsersHandler(
      createContext({ env, request: new Request("https://example.com/api/users?key=test") }),
    );
    const listBody = await listResponse.json();
    expect(listBody.users.find((user) => user.id === 99)).toBeUndefined();
  });
});
