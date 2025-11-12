import { describe, it, expect } from "vitest";
import { healthHandler } from "../api/health";
import { createContext } from "./helpers";

describe("healthHandler", () => {
  it("returns ok status", async () => {
    const context = createContext();
    const response = await healthHandler(context);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.telegramToken).toContain("***");
  });
});
