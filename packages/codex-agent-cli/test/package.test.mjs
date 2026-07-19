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
  assert.match(help.stdout, /codex-agent init/);

  const fixture = path.join(target, "fixture");
  fs.mkdirSync(fixture);
  fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "fixture" }));
  const init = run(process.execPath, [executable, "init", "--json"], { cwd: fixture });
  assert.equal(init.status, 0, init.stderr);
  const result = JSON.parse(init.stdout);
  assert.equal(result.mode, "preview");
  assert.equal(fs.realpathSync(result.root), fs.realpathSync(fixture));

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
  assert.equal(fs.existsSync(path.join(fixture, ".agents", "context", contextResult.path)), true);

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
  assert.equal(fs.existsSync(path.join(fixture, ".agents", "context", migrationResult.changes[0].path)), true);

  const appliedInit = run(process.execPath, [executable, "init", "--apply", "--json"], { cwd: fixture });
  assert.equal(appliedInit.status, 0, appliedInit.stderr);
  assert.equal(JSON.parse(appliedInit.stdout).applied, true);
  const installedProfiles = fs.readdirSync(path.join(fixture, ".codex", "agents")).filter((name) => name.endsWith(".toml"));
  assert.equal(installedProfiles.length, agentProfiles.length);
  assert.match(fs.readFileSync(path.join(fixture, ".codex", "agents", "context_scout.toml"), "utf8"), /developer_instructions/);
});
