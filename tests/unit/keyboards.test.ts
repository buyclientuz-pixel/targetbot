import assert from "node:assert/strict";
import test from "node:test";

import { buildAutoreportsKeyboard } from "../../src/bot/keyboards.ts";

const baseAutoreports = {
  enabled: true,
  time: "10:00",
  mode: "today",
  sendToChat: true,
  sendToAdmin: true,
  paymentAlerts: {
    enabled: true,
    sendToChat: true,
    sendToAdmin: true,
    lastAccountStatus: null,
    lastAlertAt: null,
  },
} as const;

test("buildAutoreportsKeyboard exposes manual send button", () => {
  const keyboard = buildAutoreportsKeyboard("proj_a", { ...baseAutoreports });
  const callbacks = keyboard.inline_keyboard.flat().map((button) => button.callback_data);
  assert.ok(
    callbacks.includes("auto_send_now:proj_a"),
    "expected auto_send_now callback in autoreports keyboard",
  );
  assert.ok(
    callbacks.includes("project:autoreports-payment-toggle:proj_a"),
    "expected payment toggle callback",
  );
  assert.ok(
    callbacks.includes("project:autoreports-payment-target:proj_a:chat"),
    "expected payment chat toggle callback",
  );
});
