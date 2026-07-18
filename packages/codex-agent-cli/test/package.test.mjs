import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

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
});
