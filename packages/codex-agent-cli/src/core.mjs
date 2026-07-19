import fs from "node:fs";
import path from "node:path";
import {
  analyzeProject,
  agentProfiles,
  initializeProject,
  renderProjectFiles,
  validateAnalysisEvidence,
  validateProjectAnalysis
} from "../../../plugins/codex-agent/skills/project-init/scripts/project-init.mjs";
import {
  buildContextIndex,
  normalizeContextProposal,
  renderContextProposal,
  saveContextProposal,
  validateContextProposal
} from "../../../plugins/codex-agent/skills/context-curation/scripts/context-save.mjs";
import {
  discoverNavigationContext,
  migrateNavigationContext
} from "../../../plugins/codex-agent/skills/context-curation/scripts/navigation-migrate.mjs";

export {
  analyzeProject,
  agentProfiles,
  buildContextIndex,
  discoverNavigationContext,
  initializeProject,
  migrateNavigationContext,
  normalizeContextProposal,
  renderContextProposal,
  renderProjectFiles,
  saveContextProposal,
  validateAnalysisEvidence,
  validateContextProposal,
  validateProjectAnalysis
};

export const listFiles = (root) => {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files.sort();
};

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

export const migrateContext = ({ root, source, dryRun = false, force = false }) => {
  if (!source) throw new Error("migrate requires --from PATH");
  const projectRoot = path.resolve(root);
  const sourceRoot = path.resolve(source);
  if (!fs.existsSync(sourceRoot)) throw new Error(`Migration source not found: ${sourceRoot}`);

  const sourceFiles = (fs.statSync(sourceRoot).isDirectory() ? listFiles(sourceRoot) : [sourceRoot])
    .filter((file) => file.endsWith(".md"));
  if (!sourceFiles.length) throw new Error("Migration source contains no Markdown context files.");

  const destinationRoot = path.join(projectRoot, ".agents", "context", "imported");
  const backupRoot = path.join(projectRoot, ".codex-agent", "backups", timestamp());
  const result = { imported: [], unchanged: [], conflicts: [], backedUp: [], dryRun };

  for (const sourceFile of sourceFiles) {
    const relative = fs.statSync(sourceRoot).isDirectory()
      ? path.relative(sourceRoot, sourceFile)
      : path.basename(sourceFile);
    const destination = path.join(destinationRoot, relative);
    const content = fs.readFileSync(sourceFile);

    if (!fs.existsSync(destination)) {
      result.imported.push(path.relative(projectRoot, destination));
      if (!dryRun) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, content);
      }
      continue;
    }

    if (content.equals(fs.readFileSync(destination))) {
      result.unchanged.push(path.relative(projectRoot, destination));
      continue;
    }

    if (!force) {
      result.conflicts.push(path.relative(projectRoot, destination));
      continue;
    }

    const backup = path.join(backupRoot, path.relative(projectRoot, destination));
    result.backedUp.push(path.relative(projectRoot, backup));
    result.imported.push(path.relative(projectRoot, destination));
    if (!dryRun) {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(destination, backup);
      fs.writeFileSync(destination, content);
    }
  }

  if (!dryRun && fs.existsSync(path.join(projectRoot, ".agents", "context"))) {
    buildContextIndex({ root: projectRoot });
  }
  return result;
};

const check = (checks, name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

const parseJson = (file) => {
  try { return { value: JSON.parse(fs.readFileSync(file, "utf8")) }; }
  catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
};

export const diagnoseProject = ({ root }) => {
  const projectRoot = path.resolve(root);
  const checks = [];
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  check(checks, "node", nodeMajor >= 20, `Node.js ${process.versions.node}; requires 20 or newer`);

  const manifest = path.join(projectRoot, "plugins", "codex-agent", ".codex-plugin", "plugin.json");
  const isSourceWorkspace = fs.existsSync(manifest);
  check(checks, "mode", true, isSourceWorkspace ? "plugin source workspace" : "initialized consumer project");

  if (isSourceWorkspace) {
    const marketplace = path.join(projectRoot, ".agents", "plugins", "marketplace.json");
    check(checks, "marketplace", fs.existsSync(marketplace), marketplace);
    if (fs.existsSync(marketplace)) {
      const parsed = parseJson(marketplace);
      check(checks, "marketplace-json", !parsed.error, parsed.error || parsed.value.name);
      check(
        checks,
        "marketplace-entry",
        parsed.value?.plugins?.some((plugin) => plugin.name === "codex-agent"),
        "codex-agent entry"
      );
    }

    check(checks, "plugin-manifest", true, manifest);
    const parsed = parseJson(manifest);
    check(checks, "plugin-json", !parsed.error, parsed.error || parsed.value.name);
    check(checks, "plugin-name", parsed.value?.name === "codex-agent", parsed.value?.name || "missing");
  } else {
    const config = path.join(projectRoot, ".codex", "config.toml");
    const agents = path.join(projectRoot, ".codex", "agents");
    const profiles = listFiles(agents).filter((file) => file.endsWith(".toml"));
    check(checks, "project-config", fs.existsSync(config), config);
    check(checks, "project-agents", profiles.length === agentProfiles.length, `${profiles.length}/${agentProfiles.length} profiles in ${agents}`);
  }

  const contextIndex = path.join(projectRoot, ".agents", "context", "index.json");
  check(checks, "context-index", fs.existsSync(contextIndex), contextIndex);
  if (fs.existsSync(contextIndex)) {
    const parsed = parseJson(contextIndex);
    check(checks, "context-json", !parsed.error, parsed.error || `${parsed.value.entries?.length ?? 0} entries`);
    const contextRoot = path.dirname(contextIndex);
    const invalid = (parsed.value?.entries ?? []).filter((entry) => {
      const target = path.resolve(contextRoot, entry.path || "");
      return !target.startsWith(`${contextRoot}${path.sep}`) || !fs.existsSync(target);
    });
    check(checks, "context-paths", invalid.length === 0, invalid.map((entry) => entry.path).join(", ") || "all paths valid");
  }

  if (isSourceWorkspace) {
    const skillsRoot = path.join(projectRoot, "plugins", "codex-agent", "skills");
    const skillFiles = listFiles(skillsRoot).filter((file) => file.endsWith(`${path.sep}SKILL.md`));
    const skillDirectories = fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
    check(checks, "skills", skillFiles.length > 0 && skillFiles.length === skillDirectories, `${skillFiles.length}/${skillDirectories} skill entrypoints`);

    const agentRoot = path.join(projectRoot, "plugins", "codex-agent", "agents");
    check(checks, "plugin-agents", listFiles(agentRoot).filter((file) => file.endsWith(".md")).length === agentProfiles.length, `${agentProfiles.length} canonical profiles in ${agentRoot}`);

    const hooks = path.join(projectRoot, "plugins", "codex-agent", "hooks", "hooks.json");
    check(checks, "hooks", fs.existsSync(hooks) && !parseJson(hooks).error, hooks);
  }

  return { root: projectRoot, ok: checks.every((item) => item.ok), checks };
};

export const evaluateRouting = ({ root }) => {
  const projectRoot = path.resolve(root);
  const suitePath = path.join(projectRoot, "evals", "skill-routing.json");
  if (!fs.existsSync(suitePath)) throw new Error(`Routing suite not found: ${suitePath}`);
  const suite = JSON.parse(fs.readFileSync(suitePath, "utf8"));
  const skillsRoot = path.join(projectRoot, "plugins", "codex-agent", "skills");
  const available = new Set(
    fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  );
  const ids = new Set();
  const failures = [];
  const byKind = { positive: 0, negative: 0, overlap: 0 };
  const positiveSkills = new Set();
  for (const item of suite.cases ?? []) {
    if (ids.has(item.id)) failures.push(`duplicate case id: ${item.id}`);
    ids.add(item.id);
    const kind = item.kind ?? "positive";
    if (!Object.hasOwn(byKind, kind)) failures.push(`${item.id}: invalid routing kind ${kind}`);
    else byKind[kind] += 1;
    if (!item.prompt || item.prompt.length < 20) failures.push(`${item.id}: prompt is too short`);
    if (kind === "positive" || kind === "overlap") {
      if (!available.has(item.expectedSkill)) failures.push(`${item.id}: missing skill ${item.expectedSkill}`);
      if (kind === "positive" && available.has(item.expectedSkill)) positiveSkills.add(item.expectedSkill);
    }
    if (kind === "overlap") {
      if (!Array.isArray(item.expectedSkills) || item.expectedSkills.length < 2) failures.push(`${item.id}: overlap case requires at least two expectedSkills`);
      else {
        if (!item.expectedSkills.includes(item.expectedSkill)) failures.push(`${item.id}: expectedSkills must include primary expectedSkill`);
        for (const skill of item.expectedSkills) if (!available.has(skill)) failures.push(`${item.id}: missing overlap skill ${skill}`);
      }
    }
    if (kind === "negative") {
      if (!Array.isArray(item.excludedSkills) || item.excludedSkills.length === 0) failures.push(`${item.id}: negative case requires excludedSkills`);
      else for (const skill of item.excludedSkills) if (!available.has(skill)) failures.push(`${item.id}: missing excluded skill ${skill}`);
      if (item.expectedSkill) failures.push(`${item.id}: negative case must not define expectedSkill`);
    }
    if (item.expectedDisposition && !["save-after-approval", "discard", "route-to-agents", "no-skill"].includes(item.expectedDisposition)) {
      failures.push(`${item.id}: invalid expectedDisposition`);
    }
  }
  for (const [kind, count] of Object.entries(byKind)) if (count === 0) failures.push(`routing suite has no ${kind} cases`);
  for (const skill of available) if (!positiveSkills.has(skill)) failures.push(`routing suite has no positive case for ${skill}`);
  return { ok: failures.length === 0, scenarios: suite.cases?.length ?? 0, skills: available.size, byKind, failures };
};

export const evaluateBehaviorContracts = ({ root }) => {
  const projectRoot = path.resolve(root);
  const suitePath = path.join(projectRoot, "evals", "behavior-contracts.json");
  if (!fs.existsSync(suitePath)) throw new Error(`Behavior suite not found: ${suitePath}`);
  const suite = JSON.parse(fs.readFileSync(suitePath, "utf8"));
  const skillsRoot = path.join(projectRoot, "plugins", "codex-agent", "skills");
  const availableSkills = new Set(
    fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  );
  const availableAgents = new Set(agentProfiles.map((profile) => profile.name));
  const coveredSkills = new Set();
  const coveredAgents = new Set();
  const ids = new Set();
  const failures = [];

  for (const item of suite.cases ?? []) {
    if (ids.has(item.id)) failures.push(`duplicate behavior case id: ${item.id}`);
    ids.add(item.id);
    if (!item.prompt || item.prompt.length < 20) failures.push(`${item.id}: prompt is too short`);
    if (!Array.isArray(item.requiredBehaviors) || item.requiredBehaviors.length < 2) failures.push(`${item.id}: requires at least two requiredBehaviors`);
    if (!Array.isArray(item.forbiddenBehaviors) || item.forbiddenBehaviors.length < 1) failures.push(`${item.id}: requires at least one forbiddenBehavior`);
    if (item.subjectType === "skill") {
      if (!availableSkills.has(item.subject)) failures.push(`${item.id}: unknown skill ${item.subject}`);
      else coveredSkills.add(item.subject);
    } else if (item.subjectType === "agent") {
      if (!availableAgents.has(item.subject)) failures.push(`${item.id}: unknown agent ${item.subject}`);
      else coveredAgents.add(item.subject);
    } else {
      failures.push(`${item.id}: invalid subjectType ${item.subjectType}`);
    }
  }

  for (const skill of availableSkills) if (!coveredSkills.has(skill)) failures.push(`missing behavior contract for skill ${skill}`);
  for (const agent of availableAgents) if (!coveredAgents.has(agent)) failures.push(`missing behavior contract for agent ${agent}`);
  return {
    ok: failures.length === 0,
    scenarios: suite.cases?.length ?? 0,
    skills: coveredSkills.size,
    agents: coveredAgents.size,
    failures
  };
};
