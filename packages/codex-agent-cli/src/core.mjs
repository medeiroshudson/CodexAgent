import fs from "node:fs";
import path from "node:path";
import {
  analyzeProject,
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
    check(checks, "project-agents", profiles.length >= 6, `${profiles.length} profiles in ${agents}`);
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
    check(checks, "skills", skillFiles.length >= 9, `${skillFiles.length} skills`);

    const agentRoot = path.join(projectRoot, "plugins", "codex-agent", "agents");
    check(checks, "plugin-agents", listFiles(agentRoot).filter((file) => file.endsWith(".md")).length >= 6, agentRoot);

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
  for (const item of suite.cases ?? []) {
    if (ids.has(item.id)) failures.push(`duplicate case id: ${item.id}`);
    ids.add(item.id);
    if (!item.prompt || item.prompt.length < 20) failures.push(`${item.id}: prompt is too short`);
    if (!available.has(item.expectedSkill)) failures.push(`${item.id}: missing skill ${item.expectedSkill}`);
    if (item.expectedDisposition && !["save-after-approval", "discard", "route-to-agents"].includes(item.expectedDisposition)) {
      failures.push(`${item.id}: invalid expectedDisposition`);
    }
  }
  return { ok: failures.length === 0, scenarios: suite.cases?.length ?? 0, skills: available.size, failures };
};
