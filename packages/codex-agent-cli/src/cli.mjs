import fs from "node:fs";
import path from "node:path";
import {
  buildContextIndex,
  diagnoseProject,
  evaluateBehaviorContracts,
  evaluateRouting,
  initializeContext,
  lintContext,
  migrateContext,
  migrateNavigationContext,
  refreshContext,
  saveContextProposal
} from "./core.mjs";

const usage = `Codex Agent CLI

Usage:
  codex-agent context <command>
  codex-agent migrate --from PATH [--root PATH] [--dry-run] [--force] [--json]
  codex-agent migrate navigation --from PATH [--root PATH] [--apply] [--force] [--include-templates] [--include-workflows] [--include-navigation] [--json]
  codex-agent doctor [--root PATH] [--json]
  codex-agent eval [--root PATH] [--json]
  codex-agent help

Run "codex-agent context" to list context commands.`;

const contextUsage = `Codex Agent context commands

Usage:
  codex-agent context init [--root PATH] [--analysis FILE] [--exclude-managed PATH ...] [--apply --plan-hash HASH] [--force] [--json]
  codex-agent context refresh [--root PATH] [--analysis FILE] [--exclude-managed PATH ...] [--apply --plan-hash HASH] [--force] [--json]
  codex-agent context index [--root PATH] [--dry-run] [--json]
  codex-agent context lint [--root PATH] [--strict] [--json]
  codex-agent context save --proposal FILE [--root PATH] [--apply] [--update] [--json]

Both init and refresh show a human-readable plan by default. Approve the displayed plan; the plan hash remains an internal integrity check for apply.
Repeat --exclude-managed for optional managed paths that must remain untouched. Supported paths: .codex/config.toml and .gitignore.`;

const OPTION_KEYS = new Map([
  ["--analysis", "analysisFile"],
  ["--exclude-managed", "excludeManaged"],
  ["--from", "source"],
  ["--plan-hash", "expectedPlanHash"],
  ["--proposal", "proposalFile"],
  ["--root", "root"]
]);

const FLAG_KEYS = new Map([
  ["--apply", "apply"],
  ["--dry-run", "dryRun"],
  ["--force", "force"],
  ["--include-navigation", "includeNavigation"],
  ["--include-templates", "includeTemplates"],
  ["--include-workflows", "includeWorkflows"],
  ["--json", "json"],
  ["--strict", "strict"],
  ["--update", "update"]
]);

const parseOptions = (args, { command, options = [], flags = [] }) => {
  const allowedOptions = new Set(options);
  const allowedFlags = new Set(flags);
  const seen = new Set();
  const repeatableOptions = new Set(["--exclude-managed"]);
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("-")) throw new Error(`Unexpected argument for ${command}: ${argument}`);
    if (seen.has(argument) && !repeatableOptions.has(argument)) throw new Error(`Duplicate option for ${command}: ${argument}`);
    if (!repeatableOptions.has(argument)) seen.add(argument);

    if (allowedOptions.has(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) throw new Error(`${argument} requires a value for ${command}`);
      const key = OPTION_KEYS.get(argument);
      if (repeatableOptions.has(argument)) parsed[key] = [...(parsed[key] ?? []), value];
      else parsed[key] = value;
      index += 1;
      continue;
    }

    if (allowedFlags.has(argument)) {
      parsed[FLAG_KEYS.get(argument)] = true;
      continue;
    }

    throw new Error(`Unknown option for ${command}: ${argument}`);
  }

  parsed.root = path.resolve(parsed.root ?? process.cwd());
  return parsed;
};

const readJsonFile = (file, label) => {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) throw new Error(`${label} file not found: ${absolute}`);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
};

const write = (value, json) => {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (typeof value === "string") process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const listLine = (items, empty = "None") => items.length ? items.join(", ") : empty;
const actionLabel = (action) => ({ create: "Create", update: "Update", preserve: "Preserve", remove: "Remove", migrate: "Migrate", conflict: "Conflict" })[action] ?? action;

export const formatContextLifecyclePlan = (result) => {
  const plan = result.approvalPlan;
  if (!plan) return JSON.stringify(result, null, 2);
  const lines = [
    plan.status === "applied" ? `Context operation applied: ${plan.title}` : `Context approval plan: ${plan.title}`,
    "",
    `Outcome: ${plan.outcome}`,
    `Target: ${plan.target}`,
    `Status: ${plan.status}`,
    "",
    "Repository evidence",
    `- Project: ${plan.analysis.project}`,
    `- Languages: ${listLine(plan.analysis.languages)}`,
    `- Toolchains: ${listLine(plan.analysis.toolchains)}`,
    `- Technologies: ${listLine(plan.analysis.technologies)}`,
    `- Units: ${plan.analysis.units}; test units: ${plan.analysis.testUnits}`,
    `- Scan: ${plan.analysis.scan.files ?? "unknown"} files; ${plan.analysis.scan.truncated ? "truncated" : "complete"}`,
    "",
    "Planned changes"
  ];
  if (plan.changes.length) for (const change of plan.changes) lines.push(`- ${actionLabel(change.action)} ${change.path}`);
  else lines.push("- No file changes");
  lines.push("", "Preserved");
  lines.push(`- ${plan.preserved.manualContent}`);
  lines.push(`- ${plan.preserved.unchanged.length} managed files are unchanged.`);
  lines.push(`- Excluded managed paths: ${listLine(plan.preserved.excludedManaged)}`);
  const excluded = plan.analysis.scan.excluded;
  lines.push(`- Scan exclusions: ${listLine(excluded.slice(0, 12))}${excluded.length > 12 ? `, and ${excluded.length - 12} more` : ""}`);
  lines.push("", "Conflicts");
  if (plan.conflicts.length) for (const conflict of plan.conflicts) lines.push(`- ${conflict}`);
  else lines.push("- None");
  lines.push("", "Safeguards");
  for (const safeguard of plan.safeguards) lines.push(`- ${safeguard}`);
  lines.push("", "Residual risks");
  for (const risk of plan.residualRisks) lines.push(`- ${risk}`);
  lines.push("", `Approval: ${plan.approval}`, `Plan integrity: ${plan.integrityId}`);
  return lines.join("\n");
};

const finishWithConflicts = (result, json) => {
  write(json || !result.approvalPlan ? result : formatContextLifecyclePlan(result), json);
  if (result.conflicts.length) process.exitCode = 2;
};

export const main = async (args) => {
  const [command, ...rest] = args;

  if (!command || command === "help") {
    if (rest.length === 1 && rest[0] === "context") write(contextUsage, false);
    else if (rest.length > 0) throw new Error(`Unknown help topic: ${rest.join(" ")}`);
    else write(usage, false);
    return;
  }

  if (command === "context") {
    const [subcommand, ...contextArgs] = rest;
    if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
      write(contextUsage, false);
      return;
    }
    if (contextArgs.includes("--help") || contextArgs.includes("-h")) {
      if (!["init", "refresh", "index", "lint", "save"].includes(subcommand)) {
        throw new Error(`Unknown context command: ${subcommand}\n\n${contextUsage}`);
      }
      write(contextUsage, false);
      return;
    }

    if (subcommand === "init" || subcommand === "refresh") {
      const options = parseOptions(contextArgs, {
        command: `context ${subcommand}`,
        options: ["--root", "--analysis", "--exclude-managed", "--plan-hash"],
        flags: ["--apply", "--force", "--json"]
      });
      const analysis = options.analysisFile ? readJsonFile(options.analysisFile, "Analysis") : null;
      const operationOptions = { ...options, analysis };
      const result = subcommand === "init"
        ? initializeContext(operationOptions)
        : refreshContext(operationOptions);
      finishWithConflicts(result, options.json);
      return;
    }

    if (subcommand === "index") {
      const options = parseOptions(contextArgs, {
        command: "context index",
        options: ["--root"],
        flags: ["--dry-run", "--json"]
      });
      const result = buildContextIndex(options);
      write({ path: result.path, entries: result.index.entries.length, dryRun: result.dryRun }, options.json);
      return;
    }

    if (subcommand === "lint") {
      const options = parseOptions(contextArgs, {
        command: "context lint",
        options: ["--root"],
        flags: ["--strict", "--json"]
      });
      const result = lintContext(options);
      write(result, options.json);
      if (!result.ok) process.exitCode = 1;
      return;
    }

    if (subcommand === "save") {
      const options = parseOptions(contextArgs, {
        command: "context save",
        options: ["--root", "--proposal"],
        flags: ["--apply", "--update", "--json"]
      });
      if (!options.proposalFile) throw new Error("context save requires --proposal FILE");
      const proposal = readJsonFile(options.proposalFile, "Proposal");
      const result = saveContextProposal({ ...options, proposal });
      finishWithConflicts(result, options.json);
      return;
    }

    throw new Error(`Unknown context command: ${subcommand}\n\n${contextUsage}`);
  }

  if (args.includes("--help") || args.includes("-h")) {
    write(usage, false);
    return;
  }

  if (command === "doctor") {
    const options = parseOptions(rest, {
      command: "doctor",
      options: ["--root"],
      flags: ["--json"]
    });
    const result = diagnoseProject(options);
    write(result, options.json);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "migrate") {
    const navigation = rest[0] === "navigation";
    if (rest[0] && !rest[0].startsWith("-") && !navigation) {
      throw new Error(`Unknown migrate command: ${rest[0]}`);
    }
    const migrateArgs = navigation ? rest.slice(1) : rest;
    const options = parseOptions(migrateArgs, navigation ? {
      command: "migrate navigation",
      options: ["--from", "--root"],
      flags: ["--apply", "--force", "--include-templates", "--include-workflows", "--include-navigation", "--json"]
    } : {
      command: "migrate",
      options: ["--from", "--root"],
      flags: ["--dry-run", "--force", "--json"]
    });
    const result = navigation
      ? migrateNavigationContext(options)
      : migrateContext(options);
    finishWithConflicts(result, options.json);
    return;
  }

  if (command === "eval") {
    const options = parseOptions(rest, {
      command: "eval",
      options: ["--root"],
      flags: ["--json"]
    });
    const routing = evaluateRouting(options);
    const behavior = evaluateBehaviorContracts(options);
    const result = {
      ok: routing.ok && behavior.ok,
      routing,
      behavior,
      failures: [...routing.failures, ...behavior.failures]
    };
    write(result, options.json);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  throw new Error(`Unknown command: ${args.join(" ")}\n\n${usage}`);
};
