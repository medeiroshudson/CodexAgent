import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeProject,
  buildContextIndex,
  initializeContext,
  migrateContext,
  migrateNavigationContext,
  refreshContext,
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

const applyInitializeContext = (options) => {
  const preview = initializeContext({ ...options, apply: false });
  return initializeContext({ ...options, apply: true, expectedPlanHash: preview.planHash });
};

const applyRefreshContext = (options) => {
  const preview = refreshContext({ ...options, apply: false });
  return refreshContext({ ...options, apply: true, expectedPlanHash: preview.planHash });
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

const createNavigationContextFixture = () => {
  const source = tempDirectory();
  const context = path.join(source, ".claude", "context");
  fs.mkdirSync(path.join(context, "core", "standards"), { recursive: true });
  fs.mkdirSync(path.join(context, "core", "workflows"), { recursive: true });
  fs.mkdirSync(path.join(context, "project-intelligence"), { recursive: true });
  fs.mkdirSync(path.join(context, "project"), { recursive: true });
  fs.writeFileSync(path.join(source, ".oac.json"), JSON.stringify({ version: "1", context: { root: ".claude/context" } }));
  fs.writeFileSync(path.join(source, ".claude", ".context-manifest.json"), JSON.stringify({
    version: "1.0.0",
    profile: "standard",
    source: { repository: "example/navigation-context", branch: "main", commit: "abc123", downloaded_at: "2026-07-01T00:00:00Z" },
    categories: ["core", "project-intelligence"]
  }));
  fs.writeFileSync(path.join(context, "navigation.md"), "<!-- Context: root/nav | Priority: critical | Version: 1.0 | Updated: 2026-07-01 -->\n# Navigation\n\nLoad standards from this map.\n");
  fs.writeFileSync(path.join(context, "core", "standards", "code-quality.md"), [
    "<!-- Context: standards/code | Priority: critical | Version: 2.0 | Updated: 2026-07-01 -->",
    "# Code Quality",
    "",
    "> Keep modules small, cohesive, and independently testable.",
    "",
    "Read `.opencode/context/core/standards/security-patterns.md` for security requirements."
  ].join("\n"));
  fs.symlinkSync("code-quality.md", path.join(context, "core", "standards", "code.md"));
  fs.writeFileSync(path.join(context, "core", "workflows", "review.md"), "# Review Workflow\n\nFollow this reusable multi-stage review procedure.\n");
  fs.writeFileSync(path.join(context, "project-intelligence", "business-domain.md"), "# Billing Domain\n\n> Invoices become immutable after they are issued to a customer.\n\nCorrections require a credit note and a replacement invoice.\n");
  fs.writeFileSync(path.join(context, "project-intelligence", "technical-domain.md"), "# Technical Domain Template\n\n[Name] [Technology] [Version] [Decision] [Rationale] [Constraint] [Solution] [Owner]\n");
  fs.writeFileSync(path.join(context, "project", "project-context.md"), "<!-- DEPRECATED: replaced by project intelligence -->\n# Old Project Context\n\nDo not migrate.\n");
  fs.writeFileSync(path.join(context, "sensitive.md"), "# Credentials\n\nTemporary credential sk-abcdefghijklmnopqrstuvwxyz1234567890 must not migrate.\n");
  return { source, context };
};

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

test("initializeContext previews canonical context without writing", () => {
  const target = createNodeFixture();
  const result = initializeContext({ root: target });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.operation, "context.init");
  assert.equal(result.mode, "preview");
  assert.equal(result.applied, false);
  assert.equal(result.changes.some((item) => item.status === "create"), true);
  assert.equal(result.changes.some((item) => item.path === ".codex-agent/context/index.json"), true);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "analysis.json")), false);
});

test("context apply requires the exact hash of a fresh preview and rejects repository drift", () => {
  const target = createNodeFixture();
  const preview = initializeContext({ root: target });
  assert.match(preview.planHash, /^[0-9a-f]{64}$/);
  assert.throws(() => initializeContext({ root: target, apply: true }), /requires the planHash/);

  const manifestPath = path.join(target, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.name = "changed-after-preview";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => initializeContext({
    root: target,
    apply: true,
    expectedPlanHash: preview.planHash
  }), /plan changed after preview/);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context")), false);
});

test("initializeContext applies once and marks the repository initialized", () => {
  const target = createNodeFixture();
  assert.throws(() => refreshContext({ root: target }), /context init/);

  const result = applyInitializeContext({ root: target });
  const agents = fs.readFileSync(path.join(target, "AGENTS.md"), "utf8");
  const analysis = JSON.parse(fs.readFileSync(path.join(target, ".codex-agent", "analysis.json"), "utf8"));
  const config = fs.readFileSync(path.join(target, ".codex", "config.toml"), "utf8");

  assert.equal(result.operation, "context.init");
  assert.equal(result.mode, "apply");
  assert.equal(result.applied, true);
  assert.match(agents, /pnpm run build/);
  assert.match(agents, /\.codex-agent\/context\/index\.json/);
  assert.match(agents, /codex-agent:managed:start repository-guidance/);
  assert.equal(analysis.packageManager.value, "pnpm");
  assert.equal(analysis.codexAgent.contextLifecycle.initialized, true);
  assert.match(config, /max_concurrent_threads_per_session = 4/);
  assert.doesNotMatch(config, /\bmax_threads\b/);
  assert.equal(fs.existsSync(path.join(target, ".codex", "agents", "context_scout.toml")), true);
  assert.throws(() => initializeContext({ root: target }), /context refresh/);
});

test("canonical context remains initialized after ignored analysis state is removed", () => {
  const target = createNodeFixture();
  applyInitializeContext({ root: target });
  fs.unlinkSync(path.join(target, ".codex-agent", "analysis.json"));

  assert.throws(() => initializeContext({ root: target }), /context refresh/);
  const preview = refreshContext({ root: target });
  assert.equal(preview.operation, "context.refresh");
  assert.equal(preview.mode, "preview");
  assert.equal(preview.applied, false);

  const applied = applyRefreshContext({ root: target });
  assert.equal(applied.applied, true);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "analysis.json")), true);
});

test("context init replaces broad .codex-agent ignores with selective runtime rules", () => {
  const target = createNodeFixture();
  const ignorePath = path.join(target, ".gitignore");
  fs.writeFileSync(ignorePath, "node_modules/\n.codex-agent/\ndist/\n");

  const preview = initializeContext({ root: target });
  const ignoreChange = preview.changes.find((change) => change.path === ".gitignore");
  assert.equal(ignoreChange.status, "update");
  assert.match(ignoreChange.diff, /- \.codex-agent\//);
  assert.equal(fs.readFileSync(ignorePath, "utf8"), "node_modules/\n.codex-agent/\ndist/\n");

  applyInitializeContext({ root: target });
  const content = fs.readFileSync(ignorePath, "utf8");
  const lines = content.split("\n");
  assert.equal(lines.includes(".codex-agent/"), false);
  assert.match(content, /^node_modules\/$/m);
  assert.match(content, /^dist\/$/m);
  assert.match(content, /^\.codex-agent\/analysis\.json$/m);
  assert.match(content, /^\.codex-agent\/sessions\/$/m);
  assert.match(content, /^\.codex-agent\/backups\/$/m);
  assert.match(content, /^\.codex-agent\/\.locks\/$/m);
  assert.match(content, /^\.codex-agent\/\.transactions\/$/m);
  assert.match(content, /^\.codex-agent\/\*\*\/\*\.tmp-\*$/m);
  assert.doesNotMatch(content, /^\.codex-agent\/context\/?$/m);
  assert.match(content, /codex-agent:managed:start runtime-state/);

  applyRefreshContext({ root: target });
  const refreshed = fs.readFileSync(ignorePath, "utf8");
  assert.equal((refreshed.match(/codex-agent:managed:start runtime-state/g) ?? []).length, 1);
  assert.match(refreshed, /^node_modules\/$/m);
  assert.match(refreshed, /^dist\/$/m);
});

test("context lifecycle preview rejects managed files reached through symbolic links without reading them", () => {
  const target = createNodeFixture();
  const outside = tempDirectory();
  const externalIgnore = path.join(outside, "ignore.txt");
  const externalContent = ".codex-agent/\nprivate-value-after\n";
  fs.writeFileSync(externalIgnore, externalContent);
  fs.symlinkSync(externalIgnore, path.join(target, ".gitignore"));

  assert.throws(() => initializeContext({ root: target }), /symbolic link/);
  assert.equal(fs.readFileSync(externalIgnore, "utf8"), externalContent);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "analysis.json")), false);
});

test("refresh previews by default, then updates managed Markdown while preserving manual content", () => {
  const target = createNodeFixture();
  applyInitializeContext({ root: target });
  const agentsPath = path.join(target, "AGENTS.md");
  fs.appendFileSync(agentsPath, "\n## Team note\n\nKeep this manual note.\n");
  const manifest = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
  manifest.scripts.format = "prettier --write .";
  manifest.scripts["test:e2e"] = "playwright test";
  fs.writeFileSync(path.join(target, "package.json"), JSON.stringify(manifest));

  const preview = refreshContext({ root: target });
  assert.equal(preview.operation, "context.refresh");
  assert.equal(preview.mode, "preview");
  assert.equal(preview.applied, false);
  assert.doesNotMatch(fs.readFileSync(agentsPath, "utf8"), /pnpm run test:e2e/);

  const result = applyRefreshContext({ root: target });
  const refreshed = fs.readFileSync(agentsPath, "utf8");
  assert.equal(result.operation, "context.refresh");
  assert.equal(result.mode, "apply");
  assert.equal(result.applied, true);
  assert.match(refreshed, /pnpm run test:e2e/);
  assert.match(refreshed, /Keep this manual note/);
  assert.equal((refreshed.match(/managed:start repository-guidance/g) ?? []).length, 1);
});

test("context init previews and applies the legacy catalog migration before managed writes", () => {
  const target = createNodeFixture();
  const legacyRoot = path.join(target, ".agents", "context");
  fs.mkdirSync(path.join(legacyRoot, "operations"), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, "operations", "release.md"), "# Release\n\nPublish only after verification.\n");
  fs.writeFileSync(path.join(legacyRoot, "index.json"), JSON.stringify({
    version: 1,
    entries: [{
      id: "release",
      path: "operations/release.md",
      summary: "Verified release operation.",
      tags: ["release"],
      priority: "high"
    }]
  }));

  const preview = initializeContext({ root: target });
  assert.equal(preview.mode, "preview");
  assert.equal(preview.changes.some((item) => item.phase === "catalog-migration"), true);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context")), false);
  assert.equal(fs.existsSync(path.join(legacyRoot, "operations", "release.md")), true);

  const applied = applyInitializeContext({ root: target });
  const index = JSON.parse(fs.readFileSync(path.join(target, ".codex-agent", "context", "index.json"), "utf8"));
  assert.equal(applied.applied, true);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context", "operations", "release.md")), true);
  assert.equal(index.entries.some((entry) => entry.id === "release"), true);
  assert.equal(fs.existsSync(legacyRoot), false);
});

test("context init restores the legacy catalog when managed-file application fails", () => {
  const target = createNodeFixture();
  const legacyRoot = path.join(target, ".agents", "context");
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, "rules.md"), "# Rules\n\nKeep rollback boundaries explicit.\n");
  fs.writeFileSync(path.join(legacyRoot, "index.json"), `${JSON.stringify({
    version: 1,
    entries: [{
      id: "rules",
      path: "rules.md",
      summary: "Stable rules used to verify initialization rollback.",
      tags: ["rules"],
      priority: "high"
    }]
  }, null, 2)}\n`);
  const preview = initializeContext({ root: target });
  const rename = fs.renameSync;
  fs.renameSync = (source, destination) => {
    if (String(destination).includes(`${path.sep}.codex${path.sep}agents${path.sep}`)) {
      throw new Error("injected managed apply failure");
    }
    return rename(source, destination);
  };
  try {
    assert.throws(() => initializeContext({
      root: target,
      apply: true,
      expectedPlanHash: preview.planHash
    }), /injected managed apply failure/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.existsSync(path.join(target, ".agents", "context", "rules.md")), true);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context")), false);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
});

test("context init rejects and rolls back a managed-file plan changed during migration", () => {
  const target = createNodeFixture();
  const legacyRoot = path.join(target, ".agents", "context");
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, "rules.md"), "# Rules\n\nKeep preview authority exact.\n");
  fs.writeFileSync(path.join(legacyRoot, "index.json"), `${JSON.stringify({
    version: 1,
    entries: [{
      id: "rules",
      path: "rules.md",
      summary: "Preview authority remains exact across migration.",
      tags: ["rules"],
      priority: "high"
    }]
  }, null, 2)}\n`);
  const preview = initializeContext({ root: target });
  const agentsPath = path.join(target, "AGENTS.md");
  const concurrentContent = "# Concurrent guidance\n\nPreserve this writer.\n";
  const rename = fs.renameSync;
  fs.renameSync = (source, destination) => {
    const result = rename(source, destination);
    if (String(source).endsWith(path.join(".agents", "context"))
      && String(destination).includes(`${path.sep}backups${path.sep}lifecycle-`)) {
      fs.writeFileSync(agentsPath, concurrentContent);
    }
    return result;
  };
  try {
    assert.throws(() => initializeContext({
      root: target,
      apply: true,
      expectedPlanHash: preview.planHash
    }), /managed-file plan changed after preview/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(agentsPath, "utf8"), concurrentContent);
  assert.equal(fs.existsSync(path.join(target, ".agents", "context", "rules.md")), true);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context")), false);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "analysis.json")), false);
  assert.deepEqual(fs.readdirSync(path.join(target, ".codex-agent", ".transactions")), []);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", ".locks", "context.lock")), false);
});

test("context init preserves concurrent analysis drift while rolling migration back", () => {
  const target = createNodeFixture();
  const legacyRoot = path.join(target, ".agents", "context");
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, "rules.md"), "# Rules\n\nPreserve external analysis changes.\n");
  fs.writeFileSync(path.join(legacyRoot, "index.json"), `${JSON.stringify({
    version: 1,
    entries: [{
      id: "rules",
      path: "rules.md",
      summary: "Concurrent analysis changes cannot be adopted silently.",
      tags: ["analysis"],
      priority: "high"
    }]
  }, null, 2)}\n`);
  const preview = initializeContext({ root: target });
  const analysisPath = path.join(target, ".codex-agent", "analysis.json");
  const concurrentAnalysis = `${JSON.stringify({ external: true }, null, 2)}\n`;
  const rename = fs.renameSync;
  fs.renameSync = (source, destination) => {
    const result = rename(source, destination);
    if (String(source).endsWith(path.join(".agents", "context"))
      && String(destination).includes(`${path.sep}backups${path.sep}lifecycle-`)) {
      fs.writeFileSync(analysisPath, concurrentAnalysis);
    }
    return result;
  };
  try {
    assert.throws(() => initializeContext({
      root: target,
      apply: true,
      expectedPlanHash: preview.planHash
    }), /precondition changed after preview: \.codex-agent\/analysis\.json/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(analysisPath, "utf8"), concurrentAnalysis);
  assert.equal(fs.existsSync(path.join(target, ".agents", "context", "rules.md")), true);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context")), false);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
  assert.deepEqual(fs.readdirSync(path.join(target, ".codex-agent", ".transactions")), []);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", ".locks", "context.lock")), false);
});

test("context init recovers a hard stop between catalog migration and managed writes", () => {
  const target = createNodeFixture();
  const legacyRoot = path.join(target, ".agents", "context");
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, "rules.md"), "# Rules\n\nRecover interrupted initialization.\n");
  fs.writeFileSync(path.join(legacyRoot, "index.json"), `${JSON.stringify({
    version: 1,
    entries: [{
      id: "rules",
      path: "rules.md",
      summary: "Interrupted initialization restores the legacy catalog.",
      tags: ["recovery"],
      priority: "high"
    }]
  }, null, 2)}\n`);
  const preview = initializeContext({ root: target });
  const moduleUrl = new URL("../src/core.mjs", import.meta.url).href;
  const childSource = `
    import fs from "node:fs";
    import path from "node:path";
    import { syncBuiltinESMExports } from "node:module";
    const root = ${JSON.stringify(target)};
    const rename = fs.renameSync;
    fs.renameSync = (source, destination) => {
      rename(source, destination);
      if (String(source).endsWith(path.join(".agents", "context"))
        && String(destination).includes(path.sep + "backups" + path.sep + "lifecycle-")) process.exit(95);
    };
    syncBuiltinESMExports();
    const { initializeContext } = await import(${JSON.stringify(moduleUrl)});
    initializeContext({ root, apply: true, expectedPlanHash: ${JSON.stringify(preview.planHash)} });
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", childSource], { encoding: "utf8" });
  assert.equal(child.status, 95, child.stderr);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", ".locks", "context.lock")), true);

  const recoveredPreview = initializeContext({ root: target });
  assert.equal(recoveredPreview.mode, "preview");
  assert.equal(fs.existsSync(path.join(target, ".agents", "context", "rules.md")), true);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context")), false);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
  assert.deepEqual(fs.readdirSync(path.join(target, ".codex-agent", ".transactions")), []);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", ".locks", "context.lock")), false);
});

test("context init commits forward when a hard stop follows managed index promotion", () => {
  const target = createNodeFixture();
  const legacyRoot = path.join(target, ".agents", "context");
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, "rules.md"), "# Rules\n\nComplete a fully promoted lifecycle.\n");
  fs.writeFileSync(path.join(legacyRoot, "index.json"), `${JSON.stringify({
    version: 1,
    entries: [{
      id: "rules",
      path: "rules.md",
      summary: "A fully promoted lifecycle commits forward during recovery.",
      tags: ["recovery"],
      priority: "high"
    }]
  }, null, 2)}\n`);
  const preview = initializeContext({ root: target });
  const moduleUrl = new URL("../src/core.mjs", import.meta.url).href;
  const childSource = `
    import fs from "node:fs";
    import path from "node:path";
    import { syncBuiltinESMExports } from "node:module";
    const root = ${JSON.stringify(target)};
    const rename = fs.renameSync;
    fs.renameSync = (source, destination) => {
      rename(source, destination);
      if (String(source).includes(path.sep + "staged" + path.sep)
        && String(destination).endsWith(path.join(".codex-agent", "context", "index.json"))) process.exit(94);
    };
    syncBuiltinESMExports();
    const { initializeContext } = await import(${JSON.stringify(moduleUrl)});
    initializeContext({ root, apply: true, expectedPlanHash: ${JSON.stringify(preview.planHash)} });
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", childSource], { encoding: "utf8" });
  assert.equal(child.status, 94, child.stderr);

  assert.throws(() => initializeContext({ root: target }), /context refresh/);
  assert.equal(fs.existsSync(path.join(target, ".agents", "context")), false);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context", "rules.md")), true);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "analysis.json")), true);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), true);
  assert.deepEqual(fs.readdirSync(path.join(target, ".codex-agent", ".transactions")), []);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", ".locks", "context.lock")), false);
});

test("context refresh rejects a legacy-only catalog and context init can migrate it back", () => {
  const target = createNodeFixture();
  applyInitializeContext({ root: target });
  const legacyParent = path.join(target, ".agents");
  fs.mkdirSync(legacyParent, { recursive: true });
  fs.renameSync(path.join(target, ".codex-agent", "context"), path.join(legacyParent, "context"));

  assert.throws(() => refreshContext({ root: target }), /requires a canonical \.codex-agent\/context catalog/);
  const preview = initializeContext({ root: target });
  assert.equal(preview.catalogMigration.state, "legacy-only");
  assert.equal(preview.changes.some((item) => item.phase === "catalog-migration"), true);
});

test("TOML conflicts require force and are backed up before replacement", () => {
  const target = createNodeFixture();
  const config = path.join(target, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, "[agents]\nmax_threads = 2\n");

  const blocked = applyInitializeContext({ root: target });
  assert.ok(blocked.conflicts.includes(".codex/config.toml"));
  assert.equal(fs.readFileSync(config, "utf8"), "[agents]\nmax_threads = 2\n");
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "analysis.json")), false);

  const forced = applyInitializeContext({ root: target, force: true });
  assert.equal(forced.conflicts.length, 0);
  assert.equal(forced.backups.length, 1);
  assert.equal(fs.readFileSync(path.join(target, forced.backups[0]), "utf8"), "[agents]\nmax_threads = 2\n");
});

test("forced replacement preview includes the complete reviewed diff", () => {
  const target = createNodeFixture();
  const config = path.join(target, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, Array.from({ length: 120 }, (_, index) => `legacy_${index + 1} = true`).join("\n"));

  const preview = initializeContext({ root: target, force: true });
  const change = preview.changes.find((item) => item.path === ".codex/config.toml");
  assert.equal(preview.applied, false);
  assert.match(change.diff, /- legacy_120 = true/);
  assert.equal(fs.readFileSync(config, "utf8").includes("legacy_120 = true"), true);
});

test("unknown facts are omitted instead of rendered as placeholders", () => {
  const target = tempDirectory();
  const analysis = analyzeProject({ root: target });
  const files = renderProjectFiles(analysis);

  assert.equal(analysis.packageManager.status, "unknown");
  assert.doesNotMatch(files.get("AGENTS.md").body, /Package manager/);
  assert.doesNotMatch(files.get("AGENTS.md").body, /Replace this|TODO|Add languages/);
  assert.equal(files.has(".codex-agent/context/index.json"), true);
  assert.equal(files.has(".agents/context/index.json"), false);
});

test("invalid supplied analysis is rejected", () => {
  const target = createNodeFixture();
  const analysis = analyzeProject({ root: target });
  analysis.packageManager.evidence = [];
  assert.throws(() => initializeContext({ root: target, analysis }), /requires evidence/);
});

test("context lifecycle rejects credential-shaped project analysis before preview or apply", () => {
  const target = createNodeFixture();
  const manifestPath = path.join(target, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.name = `sk-${"a".repeat(32)}`;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  assert.throws(() => initializeContext({ root: target }), /analysis appears to contain a secret or credential/);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "analysis.json")), false);
});

test("supplied analysis cannot use missing evidence or a different root", () => {
  const target = createNodeFixture();
  const analysis = analyzeProject({ root: target });
  analysis.packageManager.evidence = ["missing-lock.yaml"];
  assert.throws(() => initializeContext({ root: target, analysis }), /evidence does not match/);

  const other = analyzeProject({ root: target });
  other.root = tempDirectory();
  assert.throws(() => initializeContext({ root: target, analysis: other }), /root does not match/);
});

test("supplied analysis cannot contradict deterministic repository facts", () => {
  const target = createNodeFixture();
  const analysis = analyzeProject({ root: target });
  analysis.packageManager.value = "cargo";
  analysis.packageManager.evidence = ["package.json"];

  assert.throws(() => initializeContext({ root: target, analysis }), /packageManager\.value contradicts deterministic repository analysis/);
  const addedCommand = analyzeProject({ root: target });
  addedCommand.commands.value.push({ name: "release", command: "cargo publish", source: "package.json" });
  addedCommand.commands.evidence.push("package.json");
  assert.throws(() => initializeContext({ root: target, analysis: addedCommand }), /commands\.value contradicts deterministic repository analysis/);

  const signalMutations = [
    ["status", (signal) => { signal.status = "unknown"; signal.confidence = "unknown"; signal.evidence = []; }],
    ["confidence", (signal) => { signal.confidence = "medium"; }],
    ["evidence", (signal) => { signal.evidence = ["package.json"]; }]
  ];
  for (const [field, mutate] of signalMutations) {
    const changed = analyzeProject({ root: target });
    mutate(changed.packageManager);
    assert.throws(
      () => initializeContext({ root: target, analysis: changed }),
      new RegExp(`packageManager\\.${field} contradicts deterministic repository analysis`)
    );
  }

  const supplemental = analyzeProject({ root: target });
  supplemental.modules.value.push({ name: "tests", path: "tests", evidence: ["tests/user.test.ts"] });
  supplemental.modules.evidence.push("tests/user.test.ts");
  const supplementalPreview = initializeContext({ root: target, analysis: supplemental });
  assert.equal(supplementalPreview.analysis.modules.value.some((item) => item.name === "tests"), true);
  assert.equal(fs.existsSync(path.join(target, "AGENTS.md")), false);
});

test("supplied analysis rejects evidence reached through internal or external symbolic links", () => {
  const target = createNodeFixture();
  const outside = tempDirectory();
  fs.writeFileSync(path.join(outside, "external.json"), "{}\n");
  fs.symlinkSync("package.json", path.join(target, "internal-package.json"));
  fs.symlinkSync(path.join(outside, "external.json"), path.join(target, "external-package.json"));

  for (const evidence of ["internal-package.json", "external-package.json"]) {
    const analysis = analyzeProject({ root: target });
    analysis.packageManager.evidence = [evidence];
    assert.throws(() => initializeContext({ root: target, analysis }), /symbolic link/);
  }
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
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context")), false);
});

test("approved context is written with its index entry", () => {
  const target = createNodeFixture();
  const result = saveContextProposal({ root: target, proposal: contextProposal(), apply: true });
  const document = fs.readFileSync(path.join(target, ".codex-agent", "context", result.path), "utf8");
  const index = JSON.parse(fs.readFileSync(path.join(target, ".codex-agent", "context", "index.json"), "utf8"));

  assert.equal(result.applied, true);
  assert.match(document, /codex-agent:context:start constraint-publish-events-after-transaction-commit/);
  assert.match(document, /Rollbacks must discard/);
  assert.equal(index.entries.some((entry) => entry.id === result.id && entry.path === result.path), true);
});

test("context updates preserve manual Markdown and create backups", () => {
  const target = createNodeFixture();
  const initial = saveContextProposal({ root: target, proposal: contextProposal(), apply: true });
  const destination = path.join(target, ".codex-agent", "context", initial.path);
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
  const index = JSON.parse(fs.readFileSync(path.join(target, ".codex-agent", "context", "index.json"), "utf8"));
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
  fs.mkdirSync(path.join(target, ".codex-agent"), { recursive: true });
  fs.symlinkSync(outside, path.join(target, ".codex-agent", "context"), "dir");

  assert.throws(() => saveContextProposal({ root: target, proposal: contextProposal(), apply: true }), /symbolic link/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("project refresh preserves curated context entries", () => {
  const target = createNodeFixture();
  applyInitializeContext({ root: target });
  const saved = saveContextProposal({ root: target, proposal: contextProposal(), apply: true });

  applyRefreshContext({ root: target });
  const index = JSON.parse(fs.readFileSync(path.join(target, ".codex-agent", "context", "index.json"), "utf8"));
  assert.equal(index.entries.some((entry) => entry.id === saved.id && entry.path === saved.path), true);
});

test("project refresh blocks unilateral managed index id or path ownership collisions", async (t) => {
  for (const collision of [
    { id: "architecture", path: "custom.md" },
    { id: "custom-architecture", path: "architecture/system.md" }
  ]) {
    await t.test(`${collision.id}:${collision.path}`, () => {
      const target = createNodeFixture();
      applyInitializeContext({ root: target });
      const indexPath = path.join(target, ".codex-agent", "context", "index.json");
      const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      const architecture = index.entries.find((entry) => entry.id === "architecture");
      index.entries = index.entries.filter((entry) => entry.id !== "architecture");
      index.entries.push({ ...architecture, ...collision });
      fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
      if (collision.path === "custom.md") {
        fs.writeFileSync(path.join(target, ".codex-agent", "context", "custom.md"), "# Custom architecture\n");
      }
      const before = fs.readFileSync(indexPath, "utf8");

      const preview = refreshContext({ root: target });
      assert.deepEqual(preview.conflicts, [".codex-agent/context/index.json"]);
      assert.equal(preview.applied, false);
      const blocked = applyRefreshContext({ root: target, force: true });
      assert.deepEqual(blocked.conflicts, [".codex-agent/context/index.json"]);
      assert.equal(blocked.applied, false);
      assert.equal(fs.readFileSync(indexPath, "utf8"), before);
    });
  }
});

test("buildContextIndex preserves existing metadata", () => {
  const target = tempDirectory();
  const context = path.join(target, ".codex-agent", "context");
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
  const context = path.join(target, ".codex-agent", "context");
  fs.mkdirSync(context, { recursive: true });
  fs.writeFileSync(path.join(context, "index.json"), JSON.stringify({ version: 1, entries: [] }));
  fs.writeFileSync(path.join(source, "api.md"), "# API Rules\n\nUse stable public contracts.\n");
  fs.writeFileSync(path.join(source, "ignored.txt"), "ignore\n");

  const result = migrateContext({ root: target, source });
  const index = JSON.parse(fs.readFileSync(path.join(context, "index.json"), "utf8"));

  assert.deepEqual(result.imported, [path.join(".codex-agent", "context", "imported", "api.md")]);
  assert.equal(index.entries.some((entry) => entry.path === "imported/api.md"), true);
});

test("migrateContext blocks partial imports on conflict and force uses one transaction with backups", () => {
  const target = tempDirectory();
  const source = tempDirectory();
  const context = path.join(target, ".codex-agent", "context");
  fs.mkdirSync(path.join(context, "imported"), { recursive: true });
  fs.writeFileSync(path.join(context, "index.json"), JSON.stringify({ version: 1, entries: [] }));
  fs.writeFileSync(path.join(context, "imported", "conflict.md"), "# Existing\n\nKeep this until force is explicit.\n");
  fs.writeFileSync(path.join(source, "new.md"), "# New\n\nImport this document.\n");
  fs.writeFileSync(path.join(source, "conflict.md"), "# Replacement\n\nReplace after review.\n");

  const blocked = migrateContext({ root: target, source });
  assert.equal(blocked.applied, false);
  assert.equal(blocked.conflicts.length, 1);
  assert.equal(fs.existsSync(path.join(context, "imported", "new.md")), false);
  assert.match(fs.readFileSync(path.join(context, "imported", "conflict.md"), "utf8"), /Keep this/);

  const applied = migrateContext({ root: target, source, force: true });
  assert.equal(applied.applied, true);
  assert.equal(fs.existsSync(path.join(context, "imported", "new.md")), true);
  assert.match(fs.readFileSync(path.join(context, "imported", "conflict.md"), "utf8"), /Replace after review/);
  assert.ok(applied.backedUp.some((backup) => backup.endsWith("imported/conflict.md")));
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", ".locks", "context.lock")), false);
  assert.deepEqual(fs.readdirSync(path.join(target, ".codex-agent", ".transactions")), []);
});

test("migrateContext rejects sensitive Markdown before creating canonical context", () => {
  const target = tempDirectory();
  const source = tempDirectory();
  fs.writeFileSync(path.join(source, "credential.md"), "# Credential\n\nsk-abcdefghijklmnopqrstuvwxyz1234567890\n");
  assert.throws(() => migrateContext({ root: target, source }), /secret or credential/);
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context")), false);
});

test("navigation migration discovers configured context and previews compatible knowledge only", () => {
  const target = createNodeFixture();
  const { source, context } = createNavigationContextFixture();
  const result = migrateNavigationContext({ root: target, source });

  assert.equal(result.mode, "preview");
  assert.equal(fs.realpathSync(result.source.contextRoot), fs.realpathSync(context));
  assert.equal(result.source.detectedBy, ".oac.json");
  assert.equal(result.source.manifest.profile, "standard");
  assert.deepEqual(result.changes.map((item) => item.path).sort(), [
    "migrated/core/standards/code-quality.md",
    "migrated/project-intelligence/business-domain.md"
  ]);
  assert.deepEqual(new Set(result.skipped.map((item) => item.reason)), new Set([
    "navigation", "runtime-or-workflow", "template", "deprecated", "sensitive-content", "symbolic-link"
  ]));
  assert.equal(fs.existsSync(path.join(target, ".codex-agent", "context")), false);
});

test("navigation migration applies transformed Markdown and native index metadata", () => {
  const target = createNodeFixture();
  const { source } = createNavigationContextFixture();
  const result = migrateNavigationContext({ root: target, source, apply: true });
  const codeQuality = fs.readFileSync(path.join(target, ".codex-agent", "context", "migrated", "core", "standards", "code-quality.md"), "utf8");
  const index = JSON.parse(fs.readFileSync(path.join(target, ".codex-agent", "context", "index.json"), "utf8"));

  assert.equal(result.applied, true);
  assert.match(codeQuality, /codex-agent:migrated:start migrated-core-standards-code-quality/);
  assert.match(codeQuality, /\.codex-agent\/context\/migrated\/core\/standards\/security-patterns\.md/);
  assert.doesNotMatch(codeQuality, /<!-- Context:/);
  const entry = index.entries.find((item) => item.path === "migrated/core/standards/code-quality.md");
  assert.equal(entry.priority, "critical");
  assert.ok(entry.tags.includes("standards"));
  assert.match(entry.summary, /small, cohesive/);
});

test("navigation migration is idempotent and forced updates preserve manual content with backups", () => {
  const target = createNodeFixture();
  const { source, context } = createNavigationContextFixture();
  const initial = migrateNavigationContext({ root: target, source, apply: true });
  const destination = path.join(target, ".codex-agent", "context", "migrated", "core", "standards", "code-quality.md");
  const repeated = migrateNavigationContext({ root: target, source });
  assert.equal(repeated.changes.every((item) => item.status === "unchanged"), true);

  fs.appendFileSync(destination, "\n## Team note\n\nPreserve this note.\n");
  fs.appendFileSync(path.join(context, "core", "standards", "code-quality.md"), "\n\nNew confirmed standard.\n");
  const blocked = migrateNavigationContext({ root: target, source, apply: true });
  assert.deepEqual(blocked.conflicts, ["migrated/core/standards/code-quality.md"]);
  assert.match(blocked.changes.find((item) => item.status === "conflict").diff, /New confirmed standard/);
  assert.doesNotMatch(fs.readFileSync(destination, "utf8"), /New confirmed standard/);

  const updated = migrateNavigationContext({ root: target, source, apply: true, force: true });
  const content = fs.readFileSync(destination, "utf8");
  assert.equal(initial.applied && updated.applied, true);
  assert.equal(updated.backedUp.length, 2);
  assert.match(content, /New confirmed standard/);
  assert.match(content, /Preserve this note/);
});

test("navigation migration rejects context roots that escape project configuration", () => {
  const target = createNodeFixture();
  const source = tempDirectory();
  fs.writeFileSync(path.join(source, ".oac.json"), JSON.stringify({ context: { root: "../outside" } }));
  assert.throws(() => migrateNavigationContext({ root: target, source }), /escapes its allowed root/);
});

test("navigation migration include flags opt reviewed classes back into the preview", () => {
  const target = createNodeFixture();
  const { source } = createNavigationContextFixture();
  const result = migrateNavigationContext({
    root: target,
    source,
    includeNavigation: true,
    includeTemplates: true,
    includeWorkflows: true
  });
  const sources = new Set(result.changes.map((item) => item.source));

  assert.equal(sources.has("navigation.md"), true);
  assert.equal(sources.has("core/workflows/review.md"), true);
  assert.equal(sources.has("project-intelligence/technical-domain.md"), true);
  assert.equal(result.skipped.some((item) => item.reason === "deprecated"), true);
  assert.equal(result.skipped.some((item) => item.reason === "sensitive-content"), true);
});
