import assert from "node:assert/strict";
import test from "node:test";

const { handleRouteError } = await import("../../src/http/error-handler.ts");
const { EntityNotFoundError, DataValidationError, EntityConflictError } = await import(
  "../../src/errors.ts"
);

test("handleRouteError maps validation errors to 400", async () => {
  const response = handleRouteError(new DataValidationError("bad"));
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.deepEqual(payload, { error: "bad" });
});

test("handleRouteError maps conflicts to 409", async () => {
  const response = handleRouteError(new EntityConflictError("project", "1"));
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.deepEqual(payload, { error: "project with id '1' already exists" });
});

test("handleRouteError maps missing entities to 404", async () => {
  const response = handleRouteError(new EntityNotFoundError("project", "1"));
  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.deepEqual(payload, { error: "project with id '1' was not found" });
});

test("handleRouteError treats syntax errors as invalid JSON", async () => {
  const response = handleRouteError(new SyntaxError("Unexpected token"));
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.deepEqual(payload, { error: "Invalid JSON payload" });
});

test("handleRouteError wraps unknown errors as 500", async () => {
  const response = handleRouteError(new Error("boom"));
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.deepEqual(payload, { error: "Internal Server Error" });
});
