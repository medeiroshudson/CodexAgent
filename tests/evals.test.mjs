import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateBehaviorContracts, evaluateRouting } from "../packages/codex-agent-cli/src/core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("routing suite covers positive, negative, and overlap behavior for every skill", () => {
  const result = evaluateRouting({ root });
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.ok(result.scenarios >= 40);
  assert.ok(result.byKind.positive > 0);
  assert.ok(result.byKind.negative > 0);
  assert.ok(result.byKind.overlap > 0);
});

test("focused behavior contracts cover every skill and canonical agent", () => {
  const result = evaluateBehaviorContracts({ root });
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.equal(result.scenarios, result.skills + result.agents);
});
