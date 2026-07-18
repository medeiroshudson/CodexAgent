import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(packageRoot, "../..");

export const resolveTemplateRoot = () => {
  const candidates = [
    process.env.CODEX_AGENT_TEMPLATE_ROOT,
    path.join(packageRoot, "templates", "project"),
    path.join(workspaceRoot, "templates", "project")
  ].filter(Boolean);

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) throw new Error("Could not find Codex Agent project templates.");
  return path.resolve(match);
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

export const initializeProject = ({ root, templateRoot = resolveTemplateRoot(), dryRun = false, force = false }) => {
  const projectRoot = path.resolve(root);
  const backupRoot = path.join(projectRoot, ".codex-agent", "backups", timestamp());
  const result = { created: [], unchanged: [], conflicts: [], backedUp: [], dryRun };

  for (const source of listFiles(templateRoot)) {
    const relative = path.relative(templateRoot, source);
    const destination = path.join(projectRoot, relative);
    const sourceContent = fs.readFileSync(source);

    if (!fs.existsSync(destination)) {
      result.created.push(relative);
      if (!dryRun) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, sourceContent);
      }
      continue;
    }

    const destinationContent = fs.readFileSync(destination);
    if (sourceContent.equals(destinationContent)) {
      result.unchanged.push(relative);
      continue;
    }

    if (!force) {
      result.conflicts.push(relative);
      continue;
    }

    const backup = path.join(backupRoot, relative);
    result.backedUp.push(path.relative(projectRoot, backup));
    result.created.push(relative);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(destination, backup);
      fs.writeFileSync(destination, sourceContent);
    }
  }

  return result;
};

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

const firstHeading = (content, fallback) => {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || fallback;
};

const firstParagraph = (content, fallback) => {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/^#+\s+.*$/gm, "").replace(/^[-*]\s+/gm, "").trim())
    .filter(Boolean);
  return (paragraphs[0] || fallback).replace(/\s+/g, " ").slice(0, 240);
};

const slug = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 64);

export const buildContextIndex = ({ root, dryRun = false }) => {
  const projectRoot = path.resolve(root);
  const contextRoot = path.join(projectRoot, ".agents", "context");
  if (!fs.existsSync(contextRoot)) throw new Error(`Context directory not found: ${contextRoot}`);

  const indexPath = path.join(contextRoot, "index.json");
  let prior = { entries: [] };
  if (fs.existsSync(indexPath)) {
    try { prior = JSON.parse(fs.readFileSync(indexPath, "utf8")); } catch { prior = { entries: [] }; }
  }
  const priorByPath = new Map((prior.entries ?? []).map((entry) => [entry.path, entry]));

  const entries = listFiles(contextRoot)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const relative = path.relative(contextRoot, file).split(path.sep).join("/");
      const content = fs.readFileSync(file, "utf8");
      const title = firstHeading(content, path.basename(file, ".md"));
      const existing = priorByPath.get(relative);
      const tags = [...new Set([
        ...relative.replace(/\.md$/, "").split("/"),
        ...title.toLowerCase().split(/[^a-z0-9_-]+/).filter((term) => term.length > 2)
      ].map(slug).filter(Boolean))].slice(0, 10);
      return {
        id: existing?.id || slug(relative.replace(/\.md$/, "").replaceAll("/", "-")),
        path: relative,
        summary: existing?.summary || firstParagraph(content, `${title} project context.`),
        tags: existing?.tags?.length ? existing.tags : tags,
        priority: existing?.priority || "medium"
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const schemaPath = path.join(projectRoot, "schemas", "context-index.schema.json");
  const index = {
    ...(fs.existsSync(schemaPath) ? { $schema: "../../schemas/context-index.schema.json" } : {}),
    version: 1,
    entries
  };

  if (!dryRun) fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return { path: indexPath, index, dryRun };
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
    check(checks, "skills", skillFiles.length >= 8, `${skillFiles.length} skills`);

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
  }
  return { ok: failures.length === 0, scenarios: suite.cases?.length ?? 0, skills: available.size, failures };
};
