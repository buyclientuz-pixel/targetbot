import assert from "node:assert/strict";
import test from "node:test";

const { resolvePanelThreadId } = await import("../../src/bot/panel-engine.ts");

test("resolvePanelThreadId reuses session thread within same chat", () => {
  const session = {
    userId: 1,
    state: { type: "panel", panelId: "main" as const },
    panel: { chatId: 123, messageId: 50, panelId: "main", messageThreadId: 77 },
    updatedAt: new Date().toISOString(),
  };

  assert.equal(resolvePanelThreadId(session, 123, null), 77);
});

test("resolvePanelThreadId ignores session thread from another chat", () => {
  const session = {
    userId: 1,
    state: { type: "panel", panelId: "main" as const },
    panel: { chatId: 456, messageId: 50, panelId: "main", messageThreadId: 88 },
    updatedAt: new Date().toISOString(),
  };

  assert.equal(resolvePanelThreadId(session, 123, null), null);
});
