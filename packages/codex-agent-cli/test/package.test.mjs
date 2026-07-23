import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { agentProfiles } from "../../../plugins/codex-agent/generated/agent-profiles.mjs";

const root = path.resolve(import.meta.dirname, "../../..");

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: root,
  encoding: "utf8",
  ...options
});

test("published tarball runs without the source workspace", () => {
  const target = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-package-")));
  const npmCache = path.join(target, "npm-cache");
  const built = run("npm", ["run", "build", "--workspace", "@codex-agent/cli"]);
  assert.equal(built.status, 0, built.stderr || built.stdout);

  const packed = run("npm", [
    "pack",
    "--workspace", "@codex-agent/cli",
    "--ignore-scripts",
    "--pack-destination", target,
    "--json"
  ], { env: { ...process.env, npm_config_cache: npmCache } });

  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const [{ filename, files }] = JSON.parse(packed.stdout);
  assert.deepEqual(files.map((file) => file.path), [
    "LICENSE",
    "README.md",
    "dist/codex-agent.mjs",
    "package.json"
  ]);

  const archive = path.join(target, filename);
  const extracted = run("tar", ["-xzf", archive, "-C", target]);
  assert.equal(extracted.status, 0, extracted.stderr);

  const packedManifest = JSON.parse(fs.readFileSync(path.join(target, "package", "package.json"), "utf8"));
  assert.equal(packedManifest.bin["codex-agent"], "dist/codex-agent.mjs");

  const executable = path.join(target, "package", "dist", "codex-agent.mjs");
  const help = run(process.execPath, [executable, "help"], { cwd: target });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /codex-agent context <command>/);
  assert.doesNotMatch(help.stdout, /codex-agent init \[/);

  const contextHelp = run(process.execPath, [executable, "context"], { cwd: target });
  assert.equal(contextHelp.status, 0, contextHelp.stderr);
  assert.match(contextHelp.stdout, /codex-agent context init/);
  assert.match(contextHelp.stdout, /codex-agent context refresh/);

  const removedInit = run(process.execPath, [executable, "init"], { cwd: target });
  assert.equal(removedInit.status, 1);
  assert.match(removedInit.stderr, /Unknown command: init/);

  const removedRefreshFlag = run(process.execPath, [executable, "context", "refresh", "--refresh"], { cwd: target });
  assert.equal(removedRefreshFlag.status, 1);
  assert.match(removedRefreshFlag.stderr, /Unknown option for context refresh: --refresh/);

  const missingRootValue = run(process.execPath, [executable, "context", "init", "--root", "--json"], { cwd: target });
  assert.equal(missingRootValue.status, 1);
  assert.match(missingRootValue.stderr, /--root requires a value/);

  const unknownContext = run(process.execPath, [executable, "context", "unknown"], { cwd: target });
  assert.equal(unknownContext.status, 1);
  assert.match(unknownContext.stderr, /Unknown context command: unknown/);

  const fixture = path.join(target, "fixture");
  fs.mkdirSync(fixture);
  fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "fixture" }));
  const init = run(process.execPath, [executable, "context", "init", "--json"], { cwd: fixture });
  assert.equal(init.status, 0, init.stderr);
  const result = JSON.parse(init.stdout);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.operation, "context.init");
  assert.equal(result.mode, "preview");
  assert.equal(result.applied, false);
  assert.equal(fs.realpathSync(result.root), fs.realpathSync(fixture));

  const appliedInit = run(process.execPath, [
    executable, "context", "init", "--apply", "--plan-hash", result.planHash, "--json"
  ], { cwd: fixture });
  assert.equal(appliedInit.status, 0, appliedInit.stderr);
  const appliedInitResult = JSON.parse(appliedInit.stdout);
  assert.equal(appliedInitResult.operation, "context.init");
  assert.equal(appliedInitResult.mode, "apply");
  assert.equal(appliedInitResult.applied, true);
  assert.ok(Array.isArray(appliedInitResult.backups));
  const installedProfiles = fs.readdirSync(path.join(fixture, ".codex", "agents")).filter((name) => name.endsWith(".toml"));
  assert.equal(installedProfiles.length, agentProfiles.length);
  assert.match(fs.readFileSync(path.join(fixture, ".codex", "agents", "context_scout.toml"), "utf8"), /developer_instructions/);

  const proposalPath = path.join(target, "proposal.json");
  fs.writeFileSync(proposalPath, JSON.stringify({
    version: 1,
    title: "Use the fixture manifest as durable evidence",
    kind: "decision",
    summary: "The fixture manifest is the authoritative source for package identity.",
    scope: "fixture package",
    contentMarkdown: "Read the package name from the repository manifest instead of duplicating it in automation.",
    evidence: [{ path: "package.json", note: "The manifest declares the package name." }],
    tags: ["package", "manifest"],
    priority: "medium",
    confidence: "high"
  }));
  const contextPreview = run(process.execPath, [executable, "context", "save", "--proposal", proposalPath, "--json"], { cwd: fixture });
  assert.equal(contextPreview.status, 0, contextPreview.stderr);
  assert.equal(JSON.parse(contextPreview.stdout).mode, "preview");
  assert.equal(fs.existsSync(path.join(fixture, ".agents")), false);

  const contextApply = run(process.execPath, [executable, "context", "save", "--proposal", proposalPath, "--apply", "--json"], { cwd: fixture });
  assert.equal(contextApply.status, 0, contextApply.stderr);
  const contextResult = JSON.parse(contextApply.stdout);
  assert.equal(contextResult.applied, true);
  assert.equal(fs.existsSync(path.join(fixture, ".codex-agent", "context", contextResult.path)), true);

  const navigationSource = path.join(target, "navigation-source");
  const navigationContext = path.join(navigationSource, ".opencode", "context");
  fs.mkdirSync(path.join(navigationContext, "core", "standards"), { recursive: true });
  fs.writeFileSync(path.join(navigationContext, "navigation.md"), "# Navigation\n\nContext map.\n");
  fs.writeFileSync(path.join(navigationContext, "core", "standards", "errors.md"), [
    "<!-- Context: standards/errors | Priority: high | Version: 1.0 | Updated: 2026-07-01 -->",
    "# Error Handling",
    "",
    "> Return typed errors at public boundaries.",
    "",
    "Do not leak internal exception details."
  ].join("\n"));
  const migrationPreview = run(process.execPath, [executable, "migrate", "navigation", "--from", navigationSource, "--json"], { cwd: fixture });
  assert.equal(migrationPreview.status, 0, migrationPreview.stderr);
  const migrationPreviewResult = JSON.parse(migrationPreview.stdout);
  assert.equal(migrationPreviewResult.mode, "preview");
  assert.equal(migrationPreviewResult.changes.length, 1);

  const migrationApply = run(process.execPath, [executable, "migrate", "navigation", "--from", navigationSource, "--apply", "--json"], { cwd: fixture });
  assert.equal(migrationApply.status, 0, migrationApply.stderr);
  const migrationResult = JSON.parse(migrationApply.stdout);
  assert.equal(migrationResult.applied, true);
  assert.equal(fs.existsSync(path.join(fixture, ".codex-agent", "context", migrationResult.changes[0].path)), true);

  const duplicateInit = run(process.execPath, [executable, "context", "init", "--json"], { cwd: fixture });
  assert.equal(duplicateInit.status, 1);
  assert.match(duplicateInit.stderr, /context refresh/);

  const refreshPreview = run(process.execPath, [executable, "context", "refresh", "--json"], { cwd: fixture });
  assert.equal(refreshPreview.status, 0, refreshPreview.stderr);
  const refreshPreviewResult = JSON.parse(refreshPreview.stdout);
  assert.equal(refreshPreviewResult.operation, "context.refresh");
  assert.equal(refreshPreviewResult.mode, "preview");
  assert.equal(refreshPreviewResult.applied, false);

  const refreshApply = run(process.execPath, [
    executable, "context", "refresh", "--apply", "--plan-hash", refreshPreviewResult.planHash, "--json"
  ], { cwd: fixture });
  assert.equal(refreshApply.status, 0, refreshApply.stderr);
  const refreshApplyResult = JSON.parse(refreshApply.stdout);
  assert.equal(refreshApplyResult.operation, "context.refresh");
  assert.equal(refreshApplyResult.mode, "apply");
  assert.equal(refreshApplyResult.applied, true);
});
