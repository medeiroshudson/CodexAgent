import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildContextIndex, initializeProject, migrateContext } from "../src/core.mjs";

const tempDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-test-"));

test("initializeProject copies templates without overwriting conflicts", () => {
  const template = tempDirectory();
  const target = tempDirectory();
  fs.mkdirSync(path.join(template, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(template, "AGENTS.md"), "template\n");
  fs.writeFileSync(path.join(template, ".agents", "sample.md"), "sample\n");
  fs.writeFileSync(path.join(target, "AGENTS.md"), "user\n");

  const result = initializeProject({ root: target, templateRoot: template });

  assert.deepEqual(result.conflicts, ["AGENTS.md"]);
  assert.ok(result.created.includes(path.join(".agents", "sample.md")));
  assert.equal(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), "user\n");
});

test("initializeProject supports dry-run", () => {
  const template = tempDirectory();
  const target = tempDirectory();
  fs.writeFileSync(path.join(template, "AGENTS.md"), "template\n");

  const result = initializeProject({ root: target, templateRoot: template, dryRun: true });

  assert.deepEqual(result.created, ["AGENTS.md"]);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
});

test("initializeProject backs up conflicts before force replacement", () => {
  const template = tempDirectory();
  const target = tempDirectory();
  fs.writeFileSync(path.join(template, "AGENTS.md"), "template\n");
  fs.writeFileSync(path.join(target, "AGENTS.md"), "user\n");

  const result = initializeProject({ root: target, templateRoot: template, force: true });

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.backedUp.length, 1);
  assert.equal(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), "template\n");
  assert.equal(fs.readFileSync(path.join(target, result.backedUp[0]), "utf8"), "user\n");
});

test("buildContextIndex preserves existing metadata", () => {
  const target = tempDirectory();
  const context = path.join(target, ".agents", "context");
  fs.mkdirSync(path.join(context, "standards"), { recursive: true });
  fs.writeFileSync(path.join(context, "standards", "security.md"), "# Security\n\nValidate all input.\n");
  fs.writeFileSync(path.join(context, "index.json"), JSON.stringify({
    version: 1,
    entries: [{
      id: "security",
      path: "standards/security.md",
      summary: "Existing security summary.",
      tags: ["security"],
      priority: "critical"
    }]
  }));

  const result = buildContextIndex({ root: target });

  assert.equal(result.index.entries.length, 1);
  assert.equal(result.index.entries[0].priority, "critical");
  assert.equal(result.index.entries[0].summary, "Existing security summary.");
});

test("migrateContext imports Markdown and rebuilds the index", () => {
  const target = tempDirectory();
  const source = tempDirectory();
  const context = path.join(target, ".agents", "context");
  fs.mkdirSync(context, { recursive: true });
  fs.writeFileSync(path.join(context, "index.json"), JSON.stringify({ version: 1, entries: [] }));
  fs.writeFileSync(path.join(source, "api.md"), "# API Rules\n\nUse stable public contracts.\n");
  fs.writeFileSync(path.join(source, "ignored.txt"), "ignore\n");

  const result = migrateContext({ root: target, source });
  const index = JSON.parse(fs.readFileSync(path.join(context, "index.json"), "utf8"));

  assert.deepEqual(result.imported, [path.join(".agents", "context", "imported", "api.md")]);
  assert.equal(index.entries.some((entry) => entry.path === "imported/api.md"), true);
});
