import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeProject,
  buildContextIndex,
  initializeProject,
  migrateContext,
  renderProjectFiles,
  saveContextProposal,
  validateContextProposal,
  validateProjectAnalysis
} from "../src/core.mjs";

const tempDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-test-"));

const createNodeFixture = () => {
  const target = tempDirectory();
  fs.mkdirSync(path.join(target, "src"), { recursive: true });
  fs.mkdirSync(path.join(target, "tests"), { recursive: true });
  fs.writeFileSync(path.join(target, "package.json"), JSON.stringify({
    name: "fixture-app",
    packageManager: "pnpm@9.1.0",
    scripts: { build: "tsc", lint: "eslint .", typecheck: "tsc --noEmit", test: "vitest run" },
    devDependencies: { typescript: "latest", vitest: "latest" }
  }));
  fs.writeFileSync(path.join(target, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  for (const name of ["user-service.ts", "account-store.ts", "session-token.ts"]) {
    fs.writeFileSync(path.join(target, "src", name), "export const value = true;\n");
  }
  fs.writeFileSync(path.join(target, "src", "index.ts"), "export * from './user-service';\n");
  fs.writeFileSync(path.join(target, "tests", "user.test.ts"), "// test\n");
  fs.writeFileSync(path.join(target, "tests", "account.test.ts"), "// test\n");
  return target;
};

const contextProposal = (overrides = {}) => ({
  version: 1,
  title: "Publish events after transaction commit",
  kind: "constraint",
  summary: "Domain events are published only after the owning transaction commits.",
  scope: "order service",
  contentMarkdown: "Publish queued domain events after a successful commit. Rollbacks must discard the queued events.",
  evidence: [{ path: "package.json", note: "The fixture manifest represents repository-owned evidence." }],
  tags: ["events", "transactions"],
  priority: "high",
  confidence: "high",
  reviewWhen: ["The transaction library changes"],
  ...overrides
});

test("analyzeProject detects package manager, commands, tests, and conventions with evidence", () => {
  const target = createNodeFixture();
  const analysis = analyzeProject({ root: target });

  assert.equal(analysis.packageManager.value, "pnpm");
  assert.deepEqual(analysis.packageManager.evidence, ["package.json#packageManager", "pnpm-lock.yaml"]);
  assert.ok(analysis.commands.value.some((item) => item.command === "pnpm run test"));
  assert.equal(analysis.testing.status, "detected");
  assert.equal(analysis.conventions.fileNaming.value, "kebab-case");
  assert.equal(validateProjectAnalysis(analysis).ok, true);
});

test("initializeProject previews without writing", () => {
  const target = createNodeFixture();
  const result = initializeProject({ root: target });

  assert.equal(result.mode, "preview");
  assert.equal(result.changes.some((item) => item.status === "create"), true);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "analysis.json")), false);
});

test("initializeProject applies repository-specific managed files", () => {
  const target = createNodeFixture();
  const result = initializeProject({ root: target, apply: true });
  const agents = fs.readFileSync(path.join(target, "AGENTS.md"), "utf8");
  const analysis = JSON.parse(fs.readFileSync(path.join(target, ".codex-agent", "analysis.json"), "utf8"));

  assert.equal(result.applied, true);
  assert.match(agents, /pnpm run build/);
  assert.match(agents, /codex-agent:managed:start repository-guidance/);
  assert.equal(analysis.packageManager.value, "pnpm");
  assert.equal(fs.existsSync(path.join(target, ".codex", "agents", "context_scout.toml")), true);
});

test("refresh updates managed Markdown and preserves manual content", () => {
  const target = createNodeFixture();
  initializeProject({ root: target, apply: true });
  const agentsPath = path.join(target, "AGENTS.md");
  fs.appendFileSync(agentsPath, "\n## Team note\n\nKeep this manual note.\n");
  const manifest = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
  manifest.scripts.format = "prettier --write .";
  manifest.scripts["test:e2e"] = "playwright test";
  fs.writeFileSync(path.join(target, "package.json"), JSON.stringify(manifest));

  initializeProject({ root: target, refresh: true });
  const refreshed = fs.readFileSync(agentsPath, "utf8");
  assert.match(refreshed, /pnpm run test:e2e/);
  assert.match(refreshed, /Keep this manual note/);
  assert.equal((refreshed.match(/managed:start repository-guidance/g) ?? []).length, 1);
});

test("TOML conflicts require force and are backed up before replacement", () => {
  const target = createNodeFixture();
  const config = path.join(target, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, "[agents]\nmax_threads = 2\n");

  const blocked = initializeProject({ root: target, apply: true });
  assert.ok(blocked.conflicts.includes(".codex/config.toml"));
  assert.equal(fs.readFileSync(config, "utf8"), "[agents]\nmax_threads = 2\n");
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "analysis.json")), false);

  const forced = initializeProject({ root: target, apply: true, force: true });
  assert.equal(forced.conflicts.length, 0);
  assert.equal(forced.backedUp.length, 1);
  assert.equal(fs.readFileSync(path.join(target, forced.backedUp[0]), "utf8"), "[agents]\nmax_threads = 2\n");
});

test("unknown facts are omitted instead of rendered as placeholders", () => {
  const target = tempDirectory();
  const analysis = analyzeProject({ root: target });
  const files = renderProjectFiles(analysis);

  assert.equal(analysis.packageManager.status, "unknown");
  assert.doesNotMatch(files.get("AGENTS.md").body, /Package manager/);
  assert.doesNotMatch(files.get("AGENTS.md").body, /Replace this|TODO|Add languages/);
});

test("invalid supplied analysis is rejected", () => {
  const target = createNodeFixture();
  const analysis = analyzeProject({ root: target });
  analysis.packageManager.evidence = [];
  assert.throws(() => initializeProject({ root: target, analysis }), /requires evidence/);
});

test("supplied analysis cannot use missing evidence or a different root", () => {
  const target = createNodeFixture();
  const analysis = analyzeProject({ root: target });
  analysis.packageManager.evidence = ["missing-lock.yaml"];
  assert.throws(() => initializeProject({ root: target, analysis }), /evidence does not match/);

  const other = analyzeProject({ root: target });
  other.root = tempDirectory();
  assert.throws(() => initializeProject({ root: target, analysis: other }), /root does not match/);
});

test("context proposal preview validates evidence without writing", () => {
  const target = createNodeFixture();
  const proposal = contextProposal();
  const validation = validateContextProposal(proposal, { root: target });
  const result = saveContextProposal({ root: target, proposal });

  assert.equal(validation.ok, true);
  assert.equal(result.mode, "preview");
  assert.equal(result.status, "create");
  assert.equal(result.applied, false);
  assert.equal(fs.existsSync(path.join(target, ".agents")), false);
});

test("approved context is written with its index entry", () => {
  const target = createNodeFixture();
  const result = saveContextProposal({ root: target, proposal: contextProposal(), apply: true });
  const document = fs.readFileSync(path.join(target, ".agents", "context", result.path), "utf8");
  const index = JSON.parse(fs.readFileSync(path.join(target, ".agents", "context", "index.json"), "utf8"));

  assert.equal(result.applied, true);
  assert.match(document, /codex-agent:context:start constraint-publish-events-after-transaction-commit/);
  assert.match(document, /Rollbacks must discard/);
  assert.equal(index.entries.some((entry) => entry.id === result.id && entry.path === result.path), true);
});

test("context updates preserve manual Markdown and create backups", () => {
  const target = createNodeFixture();
  const initial = saveContextProposal({ root: target, proposal: contextProposal(), apply: true });
  const destination = path.join(target, ".agents", "context", initial.path);
  fs.appendFileSync(destination, "\n## Team note\n\nPreserve this manual note.\n");
  const proposal = contextProposal({
    contentMarkdown: "Publish queued domain events after a successful commit. Failed commits must discard every queued event."
  });

  const blocked = saveContextProposal({ root: target, proposal, apply: true });
  assert.deepEqual(blocked.conflicts, [initial.path]);
  assert.doesNotMatch(fs.readFileSync(destination, "utf8"), /Failed commits/);

  const updated = saveContextProposal({ root: target, proposal, apply: true, update: true });
  const content = fs.readFileSync(destination, "utf8");
  assert.equal(updated.applied, true);
  assert.equal(updated.backedUp.length, 2);
  assert.match(content, /Failed commits/);
  assert.match(content, /Preserve this manual note/);
});

test("context metadata changes also require update approval and back up the index", () => {
  const target = createNodeFixture();
  const initial = saveContextProposal({ root: target, proposal: contextProposal(), apply: true });
  const proposal = contextProposal({ tags: ["events", "transactions", "outbox"] });

  const blocked = saveContextProposal({ root: target, proposal, apply: true });
  assert.deepEqual(blocked.conflicts, [initial.path]);

  const updated = saveContextProposal({ root: target, proposal, apply: true, update: true });
  const index = JSON.parse(fs.readFileSync(path.join(target, ".agents", "context", "index.json"), "utf8"));
  assert.equal(updated.status, "update");
  assert.equal(updated.backedUp.length, 1);
  assert.ok(index.entries.find((entry) => entry.id === initial.id).tags.includes("outbox"));
});

test("context curation rejects duplicate summaries, unsafe evidence, and secrets", () => {
  const target = createNodeFixture();
  saveContextProposal({ root: target, proposal: contextProposal(), apply: true });
  assert.throws(() => saveContextProposal({
    root: target,
    proposal: contextProposal({ title: "A second title", kind: "decision" })
  }), /Duplicate context candidate/);
  assert.throws(() => saveContextProposal({
    root: target,
    proposal: contextProposal({ evidence: [{ path: "../outside.txt", note: "This escapes the repository root." }] })
  }), /escapes the repository/);
  assert.throws(() => saveContextProposal({
    root: target,
    proposal: contextProposal({ contentMarkdown: "Never persist this credential: sk-abcdefghijklmnopqrstuvwxyz1234567890 in project context." })
  }), /secret or credential/);
});

test("context curation refuses context directories reached through a symbolic link", () => {
  const target = createNodeFixture();
  const outside = tempDirectory();
  fs.mkdirSync(path.join(target, ".agents"), { recursive: true });
  fs.symlinkSync(outside, path.join(target, ".agents", "context"), "dir");

  assert.throws(() => saveContextProposal({ root: target, proposal: contextProposal(), apply: true }), /symbolic link/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("project refresh preserves curated context entries", () => {
  const target = createNodeFixture();
  initializeProject({ root: target, apply: true });
  const saved = saveContextProposal({ root: target, proposal: contextProposal(), apply: true });

  initializeProject({ root: target, refresh: true });
  const index = JSON.parse(fs.readFileSync(path.join(target, ".agents", "context", "index.json"), "utf8"));
  assert.equal(index.entries.some((entry) => entry.id === saved.id && entry.path === saved.path), true);
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
