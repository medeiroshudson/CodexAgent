import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateWorkspace } from "../scripts/validate-workspace.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("workspace satisfies plugin and skill contracts", () => {
  const result = validateWorkspace(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

