import { describe, it, expect } from "vitest";
import { ensureUser } from "../bot/commands";
import { createContext } from "./helpers";

const message = {
  message_id: 1,
  chat: { id: 1 },
  from: {
    id: 42,
    first_name: "Ada",
    last_name: "Lovelace",
    username: "ada",
  },
};

describe("ensureUser", () => {
  it("creates a new user in KV", async () => {
    const context = createContext();
    const user = await ensureUser(context.env, message as never);
    expect(user.id).toBe(42);
    const stored = await context.env.KV_USERS.get("user:42");
    expect(stored).toBeTruthy();
  });
});
