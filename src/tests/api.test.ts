import { describe, it, expect } from "vitest";
import { createLeadHandler, listLeadsHandler } from "../api/leads";
import { createContext } from "./helpers";

function requestWithBody(body: unknown, method = "POST") {
  return new Request("https://example.com/api/leads", {
    method,
    headers: { "content-type": "application/json" },
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
      request: new Request("https://example.com/api/leads?key=test"),
    });
    const listResponse = await listLeadsHandler(listRequest);
    const listBody = await listResponse.json();
    expect(listBody.leads.length).toBeGreaterThan(0);
  });
});
