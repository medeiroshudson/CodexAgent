import fs from "node:fs";
import path from "node:path";
import { buildContextIndex, diagnoseProject, evaluateRouting, initializeProject, migrateContext } from "./core.mjs";

const usage = `Codex Agent CLI

Usage:
  codex-agent init [--root PATH] [--analysis FILE] [--apply | --refresh] [--force] [--json]
  codex-agent migrate --from PATH [--root PATH] [--dry-run] [--force] [--json]
  codex-agent doctor [--root PATH] [--json]
  codex-agent context index [--root PATH] [--dry-run] [--json]
  codex-agent eval [--root PATH] [--json]
  codex-agent help
`;

const option = (args, name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const flags = (args) => ({
  root: path.resolve(option(args, "--root", process.cwd())),
  dryRun: args.includes("--dry-run"),
  apply: args.includes("--apply"),
  refresh: args.includes("--refresh"),
  force: args.includes("--force"),
  json: args.includes("--json")
});

const write = (value, json) => {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (typeof value === "string") process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

export const main = async (args) => {
  const [command, subcommand] = args;
  const options = flags(args);

  if (!command || command === "help" || args.includes("--help") || args.includes("-h")) {
    write(usage.trimEnd(), false);
    return;
  }

  if (command === "init") {
    const analysisFile = option(args, "--analysis");
    let analysis = null;
    if (analysisFile) {
      const absolute = path.resolve(analysisFile);
      if (!fs.existsSync(absolute)) throw new Error(`Analysis file not found: ${absolute}`);
      analysis = JSON.parse(fs.readFileSync(absolute, "utf8"));
    }
    const result = initializeProject({ ...options, analysis });
    write(result, options.json);
    if (result.conflicts.length) process.exitCode = 2;
    return;
  }

  if (command === "doctor") {
    const result = diagnoseProject(options);
    write(result, options.json);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "migrate") {
    const result = migrateContext({ ...options, source: option(args, "--from") });
    write(result, options.json);
    if (result.conflicts.length) process.exitCode = 2;
    return;
  }

  if (command === "context" && subcommand === "index") {
    const result = buildContextIndex(options);
    write({ path: result.path, entries: result.index.entries.length, dryRun: result.dryRun }, options.json);
    return;
  }

  if (command === "eval") {
    const result = evaluateRouting(options);
    write(result, options.json);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  throw new Error(`Unknown command: ${args.join(" ")}\n\n${usage}`);
};
