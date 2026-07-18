#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..");

const listFiles = (root) => {
  const files = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if ([".git", "node_modules", ".codex-agent"].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files.sort();
};

const parseJson = (file, errors) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) {
    errors.push(`${path.relative(defaultRoot, file)}: invalid JSON: ${error.message}`);
    return null;
  }
};

const frontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const entries = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    entries[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return entries;
};

export const validateWorkspace = (root = defaultRoot) => {
  const workspace = path.resolve(root);
  const errors = [];
  const warnings = [];
  const requireFile = (relative) => {
    const absolute = path.join(workspace, relative);
    if (!fs.existsSync(absolute)) errors.push(`${relative}: required file is missing`);
    return absolute;
  };

  const manifestPath = requireFile("plugins/codex-agent/.codex-plugin/plugin.json");
  const marketplacePath = requireFile(".agents/plugins/marketplace.json");
  const indexPath = requireFile(".agents/context/index.json");
  const cliManifestPath = requireFile("packages/codex-agent-cli/package.json");
  const publishWorkflowPath = requireFile(".github/workflows/publish-cli.yml");
  requireFile("package-lock.json");
  requireFile("plugins/codex-agent/hooks/hooks.json");

  const manifest = fs.existsSync(manifestPath) ? parseJson(manifestPath, errors) : null;
  if (manifest) {
    if (manifest.name !== "codex-agent") errors.push("plugin manifest name must be codex-agent");
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version ?? "")) errors.push("plugin version must use semver");
    if (manifest.hooks !== undefined) errors.push("plugin manifest must rely on default hooks/hooks.json discovery");
    for (const field of ["name", "version", "description", "skills", "interface"]) {
      if (!manifest[field]) errors.push(`plugin manifest missing ${field}`);
    }
    for (const asset of [manifest.interface?.composerIcon, manifest.interface?.logo].filter(Boolean)) {
      const target = path.resolve(path.dirname(path.dirname(manifestPath)), asset);
      if (!fs.existsSync(target)) errors.push(`plugin asset missing: ${asset}`);
    }
  }

  const marketplace = fs.existsSync(marketplacePath) ? parseJson(marketplacePath, errors) : null;
  const entry = marketplace?.plugins?.find((plugin) => plugin.name === "codex-agent");
  if (!entry) errors.push("marketplace missing codex-agent entry");
  else {
    if (entry.source?.path !== "./plugins/codex-agent") errors.push("marketplace source.path must be ./plugins/codex-agent");
    if (!entry.policy?.installation || !entry.policy?.authentication || !entry.category) errors.push("marketplace entry missing policy or category");
  }

  const cliManifest = fs.existsSync(cliManifestPath) ? parseJson(cliManifestPath, errors) : null;
  if (cliManifest) {
    if (cliManifest.name !== "@codex-agent/cli") errors.push("CLI package name must be @codex-agent/cli");
    if (cliManifest.bin?.["codex-agent"] !== "./dist/codex-agent.mjs") errors.push("CLI package bin must target ./dist/codex-agent.mjs");
    if (!cliManifest.files?.includes("dist/")) errors.push("CLI package must publish dist/");
    if (cliManifest.scripts?.prepare) errors.push("CLI package must not build automatically during local install");
    if (cliManifest.publishConfig?.access !== "public") errors.push("CLI package must publish with public access");
    if (cliManifest.repository?.url !== "git+https://github.com/medeiroshudson/CodexAgent.git") {
      errors.push("CLI package repository.url must match the public GitHub repository");
    }
  }

  if (fs.existsSync(publishWorkflowPath)) {
    const workflow = fs.readFileSync(publishWorkflowPath, "utf8");
    for (const required of [
      'branches:\n      - main',
      'tags:\n      - "cli-v*"',
      "workflow_dispatch:",
      "Existing cli-v tag to publish",
      "id-token: write",
      'node-version: "24"',
      "node scripts/check-cli-release.mjs",
      "npm run build --workspace @codex-agent/cli",
      'npm view "@codex-agent/cli@$VERSION" version --json',
      "if: needs.verify.outputs.should_publish == 'true'",
      "npm publish --workspace @codex-agent/cli --access public"
    ]) {
      if (!workflow.includes(required)) errors.push(`publish workflow missing: ${required.replaceAll("\n", " ")}`);
    }
    if (/NPM_TOKEN|NODE_AUTH_TOKEN/.test(workflow)) errors.push("publish workflow must use OIDC instead of an npm token");
  }

  const contextIndex = fs.existsSync(indexPath) ? parseJson(indexPath, errors) : null;
  const contextRoot = path.dirname(indexPath);
  const ids = new Set();
  for (const item of contextIndex?.entries ?? []) {
    if (ids.has(item.id)) errors.push(`duplicate context id: ${item.id}`);
    ids.add(item.id);
    const target = path.resolve(contextRoot, item.path ?? "");
    if (!target.startsWith(`${contextRoot}${path.sep}`)) errors.push(`context path escapes root: ${item.path}`);
    else if (!fs.existsSync(target)) errors.push(`context path missing: ${item.path}`);
  }

  const skillsRoot = path.join(workspace, "plugins", "codex-agent", "skills");
  const skillDirectories = fs.existsSync(skillsRoot)
    ? fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];
  if (skillDirectories.length !== 9) errors.push(`expected 9 skills, found ${skillDirectories.length}`);
  for (const skill of skillDirectories) {
    const skillFile = path.join(skillsRoot, skill, "SKILL.md");
    const metadataFile = path.join(skillsRoot, skill, "agents", "openai.yaml");
    if (!fs.existsSync(skillFile)) {
      errors.push(`${skill}: missing SKILL.md`);
      continue;
    }
    const content = fs.readFileSync(skillFile, "utf8");
    const metadata = frontmatter(content);
    if (!metadata) errors.push(`${skill}: invalid frontmatter`);
    else {
      if (metadata.name !== skill) errors.push(`${skill}: frontmatter name mismatch`);
      if (!metadata.description || metadata.description.length < 40) errors.push(`${skill}: description is too short`);
      const extra = Object.keys(metadata).filter((key) => !["name", "description"].includes(key));
      if (extra.length) errors.push(`${skill}: unsupported frontmatter fields: ${extra.join(", ")}`);
    }
    if (/\[TODO|TODO:/i.test(content)) errors.push(`${skill}: contains TODO placeholders`);
    if (!fs.existsSync(metadataFile)) errors.push(`${skill}: missing agents/openai.yaml`);
    else if (!fs.readFileSync(metadataFile, "utf8").includes(`$${skill}`)) errors.push(`${skill}: default_prompt must mention $${skill}`);
    if (fs.existsSync(path.join(skillsRoot, skill, "README.md"))) errors.push(`${skill}: skills must not include README.md`);
  }

  const agentCount = listFiles(path.join(workspace, "plugins", "codex-agent", "agents")).filter((file) => file.endsWith(".md")).length;
  const commandCount = listFiles(path.join(workspace, "plugins", "codex-agent", "commands")).filter((file) => file.endsWith(".md")).length;
  if (agentCount !== 6) errors.push(`expected 6 plugin agents, found ${agentCount}`);
  if (commandCount !== 6) errors.push(`expected 6 commands, found ${commandCount}`);

  const predecessorName = ["Open", "Agents", "Control"].join("");
  const predecessorInitialisms = [["O", "A", "C"].join(""), ["A", "O", "C"].join("")];
  const forbidden = new RegExp(`${predecessorName}|\\b(?:${predecessorInitialisms.join("|")})\\b`);
  for (const file of listFiles(workspace)) {
    if (path.relative(workspace, file) === "README.md") continue;
    if (fs.statSync(file).size > 1_000_000) continue;
    const content = fs.readFileSync(file, "utf8");
    if (forbidden.test(content)) errors.push(`${path.relative(workspace, file)}: contains a predecessor product reference`);
  }

  if (skillDirectories.length > 20) warnings.push("large skill catalog may reduce discovery quality");
  return { ok: errors.length === 0, errors, warnings };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateWorkspace(process.argv[2] || defaultRoot);
  for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
  if (!result.ok) {
    for (const error of result.errors) process.stderr.write(`error: ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Workspace validation passed.\n");
  }
}
