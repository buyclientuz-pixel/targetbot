import assert from "node:assert/strict";
import test from "node:test";

import { buildAutoreportsKeyboard } from "../../src/bot/keyboards.ts";

const baseAutoreports = {
  enabled: true,
  time: "10:00",
  mode: "today",
  sendTo: "both",
} as const;

test("buildAutoreportsKeyboard exposes manual send button", () => {
  const keyboard = buildAutoreportsKeyboard("proj_a", { ...baseAutoreports });
  const callbacks = keyboard.inline_keyboard.flat().map((button) => button.callback_data);
  assert.ok(
    callbacks.includes("auto_send_now:proj_a"),
    "expected auto_send_now callback in autoreports keyboard",
  );
});
