import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertValidContextIndex,
  validateContextIndex
} from "../plugins/codex-agent/scripts/lib/context-index.mjs";

const entry = (overrides = {}) => ({
  id: "repository-rules",
  path: "standards/repository-rules.md",
  summary: "Stable repository rules for implementation work.",
  tags: ["repository", "rules"],
  priority: "high",
  ...overrides
});

const index = (entries = [entry()], overrides = {}) => ({
  $schema: "../../schemas/context-index.schema.json",
  version: 1,
  entries,
  ...overrides
});

const temporaryRoot = (t, prefix = "codex-agent-context-index-") => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

test("strict context index validation accepts the complete schema contract", () => {
  const value = index();
  assert.deepEqual(validateContextIndex(value), { ok: true, errors: [] });
  assert.equal(assertValidContextIndex(value), value);
});

test("strict context index validation rejects root and entry schema violations deterministically", () => {
  const cases = [
    [null, ["context index must be an object"]],
    [index(undefined, { unsupported: true }), ["context index has unsupported field: unsupported"]],
    [index(undefined, { $schema: 1 }), ["context index.$schema must be a string"]],
    [index(undefined, { version: 2 }), ["context index.version must be 1"]],
    [{ version: 1, entries: {} }, ["context index.entries must be an array"]],
    [index([null]), ["context index.entries[0] must be an object"]],
    [index([entry({ unsupported: true })]), ["context index.entries[0] has unsupported field: unsupported"]],
    [index([entry({ id: "Repository_Rules" })]), ["context index.entries[0].id must match ^[a-z0-9]+(?:-[a-z0-9]+)*$"]],
    [index([entry({ summary: "too short" })]), ["context index.entries[0].summary must be a string between 10 and 240 characters"]],
    [index([entry({ tags: [] })]), ["context index.entries[0].tags must be a non-empty array"]],
    [index([entry({ tags: ["valid", "not valid"] })]), ["context index.entries[0].tags[1] must match ^[a-z0-9_-]+$"]],
    [index([entry({ tags: ["rules", "rules"] })]), ["context index.entries[0].tags must contain unique values: rules"]],
    [index([entry({ summary: `Credential ${"sk-"}${"a".repeat(32)} must never be indexed.` })]), ["context index appears to contain sensitive content"]],
    [index([entry({ priority: "urgent" })]), ["context index.entries[0].priority must be one of: critical, high, medium, low"]],
    [index([entry(), entry({ path: "other.md" })]), ["context index has duplicate id: repository-rules"]],
    [index([entry(), entry({ id: "other-rules" })]), ["context index has duplicate path: standards/repository-rules.md"]]
  ];

  for (const [value, errors] of cases) {
    assert.deepEqual(validateContextIndex(value), { ok: false, errors });
  }

  assert.throws(
    () => assertValidContextIndex(index([entry({ priority: "urgent" })])),
    new Error("Invalid context index:\n- context index.entries[0].priority must be one of: critical, high, medium, low")
  );
});

test("strict context index validation requires normalized portable Markdown paths", () => {
  for (const invalidPath of [
    "/absolute.md",
    "standards\\rules.md",
    "standards/../rules.md",
    "standards//rules.md",
    "standards/rules.MD",
    "rules../nested.md",
    ".md",
    "rules\n.md"
  ]) {
    assert.deepEqual(validateContextIndex(index([entry({ path: invalidPath })])), {
      ok: false,
      errors: ["context index.entries[0].path must be a normalized POSIX-relative Markdown path"]
    });
  }
});

test("filesystem validation checks containment, files, symlinks, and staged paths", (t) => {
  const root = temporaryRoot(t);
  const contextRoot = path.join(root, ".codex-agent", "context");
  fs.mkdirSync(path.join(contextRoot, "standards"), { recursive: true });
  fs.writeFileSync(path.join(contextRoot, "standards", "repository-rules.md"), "# Rules\n");

  assert.deepEqual(validateContextIndex(index(), { root, contextRoot }), { ok: true, errors: [] });

  const missing = index([entry({ path: "standards/missing.md" })]);
  assert.deepEqual(validateContextIndex(missing, { root, contextRoot }), {
    ok: false,
    errors: ["context index entry is missing: standards/missing.md"]
  });
  assert.deepEqual(validateContextIndex(missing, {
    root,
    contextRoot,
    pendingPaths: ["standards/missing.md"]
  }), { ok: true, errors: [] });

  fs.mkdirSync(path.join(contextRoot, "standards", "directory.md"));
  assert.deepEqual(validateContextIndex(index([entry({ path: "standards/directory.md" })]), { root, contextRoot }), {
    ok: false,
    errors: ["context index entry is not a file: standards/directory.md"]
  });

  const outsideFile = path.join(root, "outside.md");
  fs.writeFileSync(outsideFile, "# Outside\n");
  fs.symlinkSync(outsideFile, path.join(contextRoot, "standards", "linked.md"));
  assert.deepEqual(validateContextIndex(index([entry({ path: "standards/linked.md" })]), { root, contextRoot }), {
    ok: false,
    errors: ["context index entry contains a symbolic link: standards/linked.md"]
  });

  const outsideRoot = temporaryRoot(t, "codex-agent-context-index-outside-");
  fs.mkdirSync(path.join(outsideRoot, "standards"), { recursive: true });
  fs.writeFileSync(path.join(outsideRoot, "standards", "repository-rules.md"), "# Outside rules\n");
  const symlinkRepository = temporaryRoot(t, "codex-agent-context-index-symlink-");
  fs.mkdirSync(path.join(symlinkRepository, ".codex-agent"), { recursive: true });
  const symlinkContextRoot = path.join(symlinkRepository, ".codex-agent", "context");
  fs.symlinkSync(outsideRoot, symlinkContextRoot, "dir");
  assert.deepEqual(validateContextIndex(index(), { root: symlinkRepository, contextRoot: symlinkContextRoot }), {
    ok: false,
    errors: ["context index contextRoot contains a symbolic link: .codex-agent/context"]
  });

  assert.deepEqual(validateContextIndex(index(), { root, contextRoot: outsideRoot }), {
    ok: false,
    errors: ["context index contextRoot escapes root"]
  });
});
