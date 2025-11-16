import assert from "node:assert/strict";
import test from "node:test";
import { parseDateInput } from "../../src/bot/dates.ts";

test("parseDateInput accepts ISO format", () => {
  assert.equal(parseDateInput("2025-02-01"), "2025-02-01");
});

test("parseDateInput accepts dotted format", () => {
  assert.equal(parseDateInput("01.02.2025"), "2025-02-01");
});

test("parseDateInput rejects invalid values", () => {
  assert.throws(() => parseDateInput(""), /Дата не может быть пустой/);
  assert.throws(() => parseDateInput("2025-13-01"), /Неверный формат даты/);
  assert.throws(() => parseDateInput("1\/2\/2025"), /Используйте/);
});
