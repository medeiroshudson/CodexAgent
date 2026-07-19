#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { containsSensitiveContent, slug } from "./context-save.mjs";

const PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const MAX_FILES = 1000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MANAGED_START = (id) => `<!-- codex-agent:migrated:start ${id} -->`;
const MANAGED_END = (id) => `<!-- codex-agent:migrated:end ${id} -->`;

const slash = (value) => value.split(path.sep).join("/");
const unique = (items) => [...new Set(items.filter(Boolean))];
const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const safeText = (value, limit = 300) => String(value).replace(/[\r\n]+/g, " ").trim().slice(0, limit);

const readJson = (file, label) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`Invalid ${label}: ${error instanceof Error ? error.message : String(error)}`); }
};

const assertInside = (root, target, label) => {
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`${label} escapes its allowed root`);
};

const assertNoSymlink = (root, target, label) => {
  const relative = path.relative(root, target);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} traverses a symbolic link: ${slash(path.relative(root, current))}`);
    }
  }
};

const hasNavigation = (directory) => fs.existsSync(path.join(directory, "navigation.md"))
  || fs.existsSync(path.join(directory, "index.md"));

export const discoverNavigationContext = ({ source }) => {
  if (!source) throw new Error("navigation migration requires --from PATH");
  const requested = path.resolve(source);
  if (!fs.existsSync(requested)) throw new Error(`Migration source not found: ${requested}`);
  if (!fs.statSync(requested).isDirectory()) throw new Error("Navigation migration source must be a directory");
  const sourceRoot = fs.realpathSync(requested);
  const candidates = [];
  const configPath = path.join(sourceRoot, ".oac.json");
  if (fs.existsSync(configPath)) {
    const config = readJson(configPath, ".oac.json");
    const configured = config?.context?.root;
    if (typeof configured === "string" && configured.trim()) {
      if (path.isAbsolute(configured)) throw new Error("Configured context root must be project-relative; pass a global context directory directly");
      const target = path.resolve(sourceRoot, configured);
      assertInside(sourceRoot, target, "Configured context root");
      candidates.push({ path: target, detectedBy: ".oac.json" });
    }
  }
  candidates.push(
    { path: path.join(sourceRoot, ".claude", "context"), detectedBy: ".claude/context" },
    { path: path.join(sourceRoot, "context"), detectedBy: "context" },
    { path: path.join(sourceRoot, ".opencode", "context"), detectedBy: ".opencode/context" },
    { path: sourceRoot, detectedBy: "source directory" }
  );
  const selected = candidates.find((candidate, index) => candidates.findIndex((item) => item.path === candidate.path) === index
    && fs.existsSync(candidate.path) && fs.statSync(candidate.path).isDirectory() && hasNavigation(candidate.path));
  if (!selected) throw new Error("Could not find a navigation-based context root. Pass the context directory directly or provide a valid .oac.json context.root");
  assertNoSymlink(sourceRoot, selected.path, "Context root");
  const contextRoot = fs.realpathSync(selected.path);
  assertInside(sourceRoot, contextRoot, "Context root");

  const manifestCandidates = [
    path.join(contextRoot, ".context-manifest.json"),
    path.join(path.dirname(contextRoot), ".context-manifest.json"),
    path.join(sourceRoot, ".context-manifest.json")
  ];
  const manifestPath = unique(manifestCandidates).find((file) => fs.existsSync(file));
  const manifest = manifestPath ? readJson(manifestPath, ".context-manifest.json") : null;
  return {
    sourceRoot,
    contextRoot,
    detectedBy: selected.detectedBy,
    manifest: manifest ? {
      version: manifest.version ?? null,
      profile: manifest.profile ?? null,
      source: manifest.source ?? null,
      categories: manifest.categories ?? null
    } : null
  };
};

const walkMarkdown = (root) => {
  const files = [];
  const skipped = [];
  let totalBytes = 0;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        skipped.push({ source: slash(path.relative(root, absolute)), reason: "symbolic-link" });
        continue;
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const size = fs.statSync(absolute).size;
        if (size > MAX_FILE_BYTES) throw new Error(`Source context file exceeds ${MAX_FILE_BYTES} bytes: ${slash(path.relative(root, absolute))}`);
        totalBytes += size;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`Source context exceeds ${MAX_TOTAL_BYTES} bytes`);
        files.push(absolute);
        if (files.length > MAX_FILES) throw new Error(`Source context contains more than ${MAX_FILES} Markdown files`);
      }
    }
  };
  visit(root);
  return { files: files.sort(), skipped: skipped.sort((left, right) => left.source.localeCompare(right.source)) };
};

const parseMetadata = (content) => {
  const match = content.match(/^\uFEFF?<!--\s*Context:\s*([^|]+?)\s*\|\s*Priority:\s*(critical|high|medium|low)\s*\|\s*Version:\s*([^|]+?)\s*\|\s*Updated:\s*([^>]+?)\s*-->\s*/i);
  if (!match) return { content, context: null, priority: "medium", version: null, updated: null };
  return {
    content: content.slice(match[0].length),
    context: match[1].trim(),
    priority: match[2].toLowerCase(),
    version: match[3].trim(),
    updated: match[4].trim()
  };
};

const placeholderCount = (content) => (content.match(/\[[^\]\n]{2,100}\](?!\()/g) ?? [])
  .filter((value) => /\b(?:name|what|why|how|description|decision|rationale|option|constraint|project|date|status|owner|actual|goal|solution|technology|version|link|item)\b/i.test(value))
  .length;

const runtimeReferenceCount = (content) => {
  const predecessorName = ["Open", "Agents", "Control"].join("");
  const patterns = [
    new RegExp(predecessorName, "g"), /\bOpenCode\b/g, /packages\/opencode\//g,
    /\.opencode\//g, /\.claude\//g, /\bContextScout\b/g, /\/install-context\b/g
  ];
  return patterns.reduce((total, pattern) => total + (content.match(pattern)?.length ?? 0), 0);
};

const classify = ({ relative, content, includeNavigation, includeTemplates, includeWorkflows }) => {
  const normalized = relative.toLowerCase();
  const basename = path.posix.basename(normalized);
  const segments = normalized.split("/");
  if (!includeNavigation && (["navigation.md", "index.md"].includes(basename) || basename.endsWith("-navigation.md"))) return "navigation";
  if (/deprecated/i.test(content.slice(0, 1200))) return "deprecated";
  if (!includeWorkflows && (segments.includes("workflows") || segments.includes("task-management")
    || segments.includes("context-system") || segments.includes("system-builder-templates")
    || segments.includes("openagents-repo") || (segments[0] === "core" && (segments.includes("system") || segments.includes("guides"))))) {
    return "runtime-or-workflow";
  }
  if (!includeWorkflows && runtimeReferenceCount(content) >= 3) return "runtime-specific-content";
  if (!includeTemplates && (placeholderCount(content) >= 8 || /no context files yet|planned context files/i.test(content))) return "template";
  if (containsSensitiveContent(content)) return "sensitive-content";
  return null;
};

const markdownText = (value) => value
  .replace(/<!--[^>]*-->/g, " ")
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/^#+\s+/gm, "")
  .replace(/^>\s?/gm, "")
  .replace(/^[-*]\s+/gm, "")
  .replace(/[*_`|]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const firstHeading = (content, fallback) => safeText(content.match(/^#\s+(.+)$/m)?.[1] || fallback, 120);
const summary = (content, title) => {
  const quote = content.match(/^>\s+(.+)$/m)?.[1];
  if (quote) return safeText(markdownText(quote), 240);
  const paragraphs = content.split(/\n\s*\n/).map(markdownText).filter((value) => value && value !== title && value.length >= 10);
  return safeText(paragraphs[0] || `${title} migrated project context.`, 240);
};

const rewriteContent = (content) => content
  .replace(/\[([^\]]+)\]\([^)]*navigation\.md(?:#[^)]*)?\)/gi, "$1 (catalog: `.agents/context/index.json`)")
  .replace(/@?(?:\.opencode|\.claude)\/context\//g, ".agents/context/migrated/")
  .replace(/`(?:\.opencode|\.claude)\/context`/g, "`.agents/context/migrated`")
  .trim();

const entryTags = ({ relative, metadata, title }) => unique([
  "migrated",
  ...relative.replace(/\.md$/i, "").split("/"),
  ...(metadata.context ? metadata.context.split(/[\/\s]+/) : []),
  ...title.toLowerCase().split(/[^a-z0-9_-]+/).filter((term) => term.length > 2)
].map(slug)).slice(0, 10);

const mergeManaged = (current, id, managed, force) => {
  if (current === null) return { status: "create", content: `${managed}\n`, backup: false };
  const start = MANAGED_START(id);
  const end = MANAGED_END(id);
  const startIndex = current.indexOf(start);
  const endIndex = current.indexOf(end);
  if (startIndex >= 0 && endIndex > startIndex) {
    const content = `${current.slice(0, startIndex)}${managed}${current.slice(endIndex + end.length)}`.replace(/\s*$/, "\n");
    if (content === current) return { status: "unchanged", content, backup: false };
    return force ? { status: "update", content, backup: true } : { status: "conflict", content, backup: false };
  }
  return force ? { status: "update", content: `${managed}\n`, backup: true } : { status: "conflict", content: `${managed}\n`, backup: false };
};

const readTargetIndex = (indexPath, contextRoot) => {
  if (!fs.existsSync(indexPath)) return { version: 1, entries: [] };
  const index = readJson(indexPath, "target context index");
  if (!index || typeof index !== "object" || !Array.isArray(index.entries)) throw new Error("Invalid target context index: entries must be an array");
  const ids = new Set();
  const paths = new Set();
  for (const entry of index.entries) {
    if (ids.has(entry.id)) throw new Error(`Invalid target context index: duplicate id ${entry.id}`);
    if (paths.has(entry.path)) throw new Error(`Invalid target context index: duplicate path ${entry.path}`);
    ids.add(entry.id);
    paths.add(entry.path);
    const target = path.resolve(contextRoot, entry.path || "");
    assertInside(contextRoot, target, `Target context entry ${entry.path}`);
    if (!fs.existsSync(target)) throw new Error(`Invalid target context index: missing path ${entry.path}`);
  }
  return index;
};

const diff = (before, after) => {
  if (before === after) return "";
  const oldLines = (before ?? "").split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  return [`@@ line ${prefix + 1} @@`, ...oldLines.slice(prefix, prefix + 60).map((line) => `- ${line}`), ...newLines.slice(prefix, prefix + 60).map((line) => `+ ${line}`)].join("\n");
};

const restore = (snapshots, indexPath, priorIndexContent) => {
  for (const snapshot of [...snapshots].reverse()) {
    if (snapshot.before === null) {
      if (fs.existsSync(snapshot.destination)) fs.unlinkSync(snapshot.destination);
    } else {
      fs.mkdirSync(path.dirname(snapshot.destination), { recursive: true });
      fs.writeFileSync(snapshot.destination, snapshot.before);
    }
  }
  if (priorIndexContent === null) {
    if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
  } else {
    fs.writeFileSync(indexPath, priorIndexContent);
  }
};

export const migrateNavigationContext = ({
  root,
  source,
  apply = false,
  force = false,
  includeNavigation = false,
  includeTemplates = false,
  includeWorkflows = false
}) => {
  const projectRoot = fs.realpathSync(path.resolve(root));
  const discovery = discoverNavigationContext({ source });
  const contextRoot = path.join(projectRoot, ".agents", "context");
  const destinationRoot = path.join(contextRoot, "migrated");
  assertNoSymlink(projectRoot, contextRoot, "Target context root");
  const sourceWalk = walkMarkdown(discovery.contextRoot);
  const sourceFiles = sourceWalk.files;
  const skipped = [...sourceWalk.skipped];
  const candidates = [];
  for (const sourceFile of sourceFiles) {
    const relative = slash(path.relative(discovery.contextRoot, sourceFile));
    const original = fs.readFileSync(sourceFile, "utf8");
    const metadata = parseMetadata(original);
    const reason = classify({ relative, content: metadata.content, includeNavigation, includeTemplates, includeWorkflows });
    if (reason) {
      skipped.push({ source: relative, reason });
      continue;
    }
    const transformed = rewriteContent(metadata.content);
    if (!transformed) {
      skipped.push({ source: relative, reason: "empty" });
      continue;
    }
    const destinationRelative = `migrated/${relative}`;
    const id = slug(`migrated-${relative.replace(/\.md$/i, "")}`);
    const title = firstHeading(transformed, path.basename(relative, ".md"));
    const managed = `${MANAGED_START(id)}\n<!-- source: ${relative} -->\n${transformed}\n${MANAGED_END(id)}`;
    candidates.push({
      sourceFile,
      source: relative,
      destinationRelative,
      destination: path.join(destinationRoot, ...relative.split("/")),
      id,
      title,
      summary: summary(transformed, title),
      tags: entryTags({ relative, metadata, title }),
      priority: PRIORITIES.has(metadata.priority) ? metadata.priority : "medium",
      metadata: { context: metadata.context, version: metadata.version, updated: metadata.updated },
      managed
    });
  }

  const indexPath = path.join(contextRoot, "index.json");
  const targetIndex = readTargetIndex(indexPath, contextRoot);
  const priorIndexContent = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : null;
  const changes = [];
  const conflicts = [];
  const migrationEntries = [];
  for (const candidate of candidates) {
    assertInside(destinationRoot, candidate.destination, `Migration destination ${candidate.destinationRelative}`);
    assertNoSymlink(projectRoot, candidate.destination, "Migration destination");
    const current = fs.existsSync(candidate.destination) ? fs.readFileSync(candidate.destination, "utf8") : null;
    const merge = mergeManaged(current, candidate.id, candidate.managed, force);
    const idOwner = targetIndex.entries.find((entry) => entry.id === candidate.id && entry.path !== candidate.destinationRelative);
    const pathOwner = targetIndex.entries.find((entry) => entry.path === candidate.destinationRelative && entry.id !== candidate.id);
    if (idOwner || pathOwner) {
      conflicts.push(candidate.destinationRelative);
      changes.push({ source: candidate.source, path: candidate.destinationRelative, status: "conflict", diff: "Target index ownership collides with another ID or path and must be resolved manually." });
      continue;
    }
    if (merge.status === "conflict") {
      conflicts.push(candidate.destinationRelative);
      changes.push({
        source: candidate.source,
        path: candidate.destinationRelative,
        status: "conflict",
        message: "Existing destination differs; review the diff and use --force to replace it with backup.",
        diff: diff(current, merge.content)
      });
      continue;
    }
    changes.push({
      source: candidate.source,
      path: candidate.destinationRelative,
      status: merge.status,
      diff: merge.status === "unchanged" ? "" : diff(current, merge.content),
      backup: merge.backup,
      destination: candidate.destination,
      before: current,
      content: merge.content
    });
    migrationEntries.push({
      id: candidate.id,
      path: candidate.destinationRelative,
      summary: candidate.summary,
      tags: candidate.tags,
      priority: candidate.priority
    });
  }

  const migratingIds = new Set(migrationEntries.map((entry) => entry.id));
  const migratingPaths = new Set(migrationEntries.map((entry) => entry.path));
  const nextIndex = {
    ...(targetIndex.$schema ? { $schema: targetIndex.$schema } : {}),
    version: 1,
    entries: [
      ...targetIndex.entries.filter((entry) => !migratingIds.has(entry.id) && !migratingPaths.has(entry.path)),
      ...migrationEntries
    ].sort((left, right) => left.path.localeCompare(right.path))
  };
  const indexContent = `${JSON.stringify(nextIndex, null, 2)}\n`;
  const result = {
    root: projectRoot,
    mode: apply ? "apply" : "preview",
    format: "navigation-markdown",
    source: {
      requested: path.resolve(source),
      contextRoot: discovery.contextRoot,
      detectedBy: discovery.detectedBy,
      manifest: discovery.manifest
    },
    changes: changes.map(({ destination, before, content, backup, ...change }) => change),
    skipped,
    conflicts: unique(conflicts),
    backedUp: [],
    index: { path: ".agents/context/index.json", entries: nextIndex.entries.length, diff: diff(priorIndexContent, indexContent) },
    applied: false
  };
  if (!apply || result.conflicts.length) return result;

  const writable = changes.filter((change) => change.status !== "unchanged");
  const snapshots = writable.map((change) => ({ destination: change.destination, before: change.before }));
  if (writable.some((change) => change.backup)) {
    const backupRoot = path.join(projectRoot, ".codex-agent", "backups", timestamp());
    for (const change of writable.filter((item) => item.backup && item.before !== null)) {
      const backup = path.join(backupRoot, ...change.path.split("/"));
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, change.before);
      result.backedUp.push(slash(path.relative(projectRoot, backup)));
    }
    if (priorIndexContent !== null) {
      const backup = path.join(backupRoot, ".agents", "context", "index.json");
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, priorIndexContent);
      result.backedUp.push(slash(path.relative(projectRoot, backup)));
    }
  }
  try {
    for (const change of writable) {
      fs.mkdirSync(path.dirname(change.destination), { recursive: true });
      fs.writeFileSync(change.destination, change.content);
    }
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, indexContent);
  } catch (error) {
    restore(snapshots, indexPath, priorIndexContent);
    throw error;
  }
  result.applied = true;
  return result;
};

const option = (args, name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

export const main = (args = process.argv.slice(2)) => {
  const result = migrateNavigationContext({
    root: path.resolve(option(args, "--root", process.cwd())),
    source: option(args, "--from"),
    apply: args.includes("--apply"),
    force: args.includes("--force"),
    includeNavigation: args.includes("--include-navigation"),
    includeTemplates: args.includes("--include-templates"),
    includeWorkflows: args.includes("--include-workflows")
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.conflicts.length) process.exitCode = 2;
};

if (process.argv[1] && path.basename(process.argv[1]) === "navigation-migrate.mjs" && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
