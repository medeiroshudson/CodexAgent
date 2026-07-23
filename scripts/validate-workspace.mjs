#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentProfiles } from "../plugins/codex-agent/generated/agent-profiles.mjs";
import { validateContextIndex } from "../plugins/codex-agent/scripts/lib/context-index.mjs";
import { loadAgentDefinitions, renderAgentProfilesModule, renderAgentToml } from "./sync-agent-profiles.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..");

const listFiles = (root) => {
  const files = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if ([".git", "node_modules"].includes(entry.name)) continue;
      if ([
        ".codex-agent/sessions", ".codex-agent/backups", ".codex-agent/.locks",
        ".codex-agent/.transactions"
      ].some((ignored) => relative === ignored || relative.startsWith(`${ignored}/`))) continue;
      if (relative === ".codex-agent/analysis.json") continue;
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
  const indexPath = requireFile(".codex-agent/context/index.json");
  const contextIndexSchemaPath = requireFile("schemas/context-index.schema.json");
  const contextProposalSchemaPath = requireFile("schemas/context-proposal.schema.json");
  const contextCandidateSchemaPath = requireFile("schemas/context-candidate.schema.json");
  const sessionManifestSchemaPath = requireFile("schemas/session-manifest.schema.json");
  const cliManifestPath = requireFile("packages/codex-agent-cli/package.json");
  const publishWorkflowPath = requireFile(".github/workflows/publish-cli.yml");
  const routingSuitePath = requireFile("evals/skill-routing.json");
  const behaviorSuitePath = requireFile("evals/behavior-contracts.json");
  const generatedAgentsPath = requireFile("plugins/codex-agent/generated/agent-profiles.mjs");
  requireFile("scripts/derive-cli-version.mjs");
  requireFile("package-lock.json");
  requireFile("plugins/codex-agent/hooks/hooks.json");
  requireFile("plugins/codex-agent/scripts/lib/safe-files.mjs");
  requireFile("plugins/codex-agent/scripts/lib/context-catalog.mjs");
  requireFile("plugins/codex-agent/scripts/lib/context-index.mjs");
  requireFile("plugins/codex-agent/scripts/lib/context-transaction.mjs");
  requireFile("plugins/codex-agent/scripts/context-project.mjs");
  requireFile("plugins/codex-agent/scripts/session-store.mjs");
  requireFile("plugins/codex-agent/scripts/context-candidate.mjs");
  requireFile("plugins/codex-agent/skills/context-curation/references/migration-policy.md");
  requireFile("plugins/codex-agent/skills/context-curation/scripts/navigation-migrate.mjs");

  for (const schema of [contextIndexSchemaPath, contextProposalSchemaPath, contextCandidateSchemaPath, sessionManifestSchemaPath]) {
    if (fs.existsSync(schema)) parseJson(schema, errors);
  }
  const routingSuite = fs.existsSync(routingSuitePath) ? parseJson(routingSuitePath, errors) : null;
  if (fs.existsSync(behaviorSuitePath)) parseJson(behaviorSuitePath, errors);

  let canonicalAgents = [];
  try {
    canonicalAgents = loadAgentDefinitions(workspace);
    if (canonicalAgents.length !== agentProfiles.length) errors.push("generated agent profile count does not match canonical sources");
    if (fs.existsSync(generatedAgentsPath) && fs.readFileSync(generatedAgentsPath, "utf8") !== renderAgentProfilesModule(canonicalAgents)) {
      errors.push("generated agent profile module is out of sync; run npm run agents:sync");
    }
    for (const definition of canonicalAgents) {
      for (const heading of ["Mission", "Operating contract", "Critical rules", "Workflow", "Return contract", "Avoid"]) {
        if (!new RegExp(`^## ${heading}$`, "m").test(definition.developerInstructions)) errors.push(`${definition.source}: missing required heading ${heading}`);
      }
      const template = path.join(workspace, "templates", "project", ".codex", "agents", definition.file);
      if (!fs.existsSync(template)) errors.push(`missing generated agent template: ${path.relative(workspace, template)}`);
      else if (fs.readFileSync(template, "utf8") !== renderAgentToml(definition)) errors.push(`${path.relative(workspace, template)}: out of sync with canonical prompt`);
    }
  } catch (error) {
    errors.push(`canonical agent profiles: ${error.message}`);
  }

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
    if (!/^\d+\.\d+\.\d+$/.test(cliManifest.version ?? "")) errors.push("CLI package base version must be stable SemVer");
    if (cliManifest.bin?.["codex-agent"] !== "dist/codex-agent.mjs") errors.push("CLI package bin must target dist/codex-agent.mjs");
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
      'node-version: "24"',
      "- name: Validate workspace",
      "- name: Derive commit version",
      "node scripts/derive-cli-version.mjs",
      "--no-git-tag-version",
      "npm run build --workspace @codex-agent/cli",
      "NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}",
      "npm publish --workspace @codex-agent/cli --access public --tag latest"
    ]) {
      if (!workflow.includes(required)) errors.push(`publish workflow missing: ${required.replaceAll("\n", " ")}`);
    }
    if (/^\s+tags:/m.test(workflow)) errors.push("publish workflow must not use Git tags");
    if (workflow.includes("workflow_dispatch:")) errors.push("publish workflow must not expose manual releases");
    if (workflow.includes("id-token: write")) errors.push("publish workflow must not request OIDC permissions");
    if (workflow.indexOf("- name: Derive commit version") < workflow.indexOf("- name: Validate workspace")) {
      errors.push("publish workflow must validate the stable base version before deriving the npm version");
    }
  }

  for (const obsolete of [
    ".github/workflows/bootstrap-cli.yml",
    "scripts/check-cli-release.mjs",
    "tests/release.test.mjs"
  ]) if (fs.existsSync(path.join(workspace, obsolete))) errors.push(`${obsolete}: obsolete release artifact must be removed`);

  const contextIndex = fs.existsSync(indexPath) ? parseJson(indexPath, errors) : null;
  const contextRoot = path.dirname(indexPath);
  if (contextIndex) {
    const validation = validateContextIndex(contextIndex, { root: workspace, contextRoot });
    for (const error of validation.errors) errors.push(`.codex-agent/context/index.json: ${error}`);
  }
  if (fs.existsSync(path.join(workspace, ".agents", "context"))) {
    errors.push(".agents/context: legacy context root must be migrated to .codex-agent/context");
  }
  const ignorePath = requireFile(".gitignore");
  if (fs.existsSync(ignorePath)) {
    const ignore = fs.readFileSync(ignorePath, "utf8");
    if (/^\.codex-agent\/$/m.test(ignore)) errors.push(".gitignore must not ignore the versioned .codex-agent/context root");
    for (const required of [
      ".codex-agent/analysis.json", ".codex-agent/sessions/", ".codex-agent/backups/",
      ".codex-agent/.locks/", ".codex-agent/.transactions/", ".codex-agent/**/*.tmp-*"
    ]) if (!ignore.includes(required)) errors.push(`.gitignore missing transient path: ${required}`);
  }

  const skillsRoot = path.join(workspace, "plugins", "codex-agent", "skills");
  const skillDirectories = fs.existsSync(skillsRoot)
    ? fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : [];
  const routedSkills = new Set((routingSuite?.cases ?? []).flatMap((item) => [item.expectedSkill, ...(item.expectedSkills ?? [])]).filter(Boolean));
  for (const skill of skillDirectories) if (!routedSkills.has(skill)) errors.push(`${skill}: missing positive routing fixture`);
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
    for (const heading of ["Outcome", "Critical rules", "Output contract"]) {
      if (!new RegExp(`^## ${heading}$`, "m").test(content)) errors.push(`${skill}: missing required heading ${heading}`);
    }
    if (!/^## .*workflow$/im.test(content)) errors.push(`${skill}: missing workflow section`);
    if (!fs.existsSync(metadataFile)) errors.push(`${skill}: missing agents/openai.yaml`);
    else if (!fs.readFileSync(metadataFile, "utf8").includes(`$${skill}`)) errors.push(`${skill}: default_prompt must mention $${skill}`);
    if (fs.existsSync(path.join(skillsRoot, skill, "README.md"))) errors.push(`${skill}: skills must not include README.md`);
  }

  const agentCount = listFiles(path.join(workspace, "plugins", "codex-agent", "agents")).filter((file) => file.endsWith(".md")).length;
  if (agentCount !== canonicalAgents.length) errors.push(`expected ${canonicalAgents.length} canonical agents, found ${agentCount}`);
  if (fs.existsSync(path.join(workspace, "plugins", "codex-agent", "commands"))) {
    errors.push("plugins/codex-agent/commands: plugin command prompts are not a supported distributed surface");
  }

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
