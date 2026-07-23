#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertWritableContextCatalog } from "../../../scripts/lib/context-catalog.mjs";
import { assertValidContextIndex } from "../../../scripts/lib/context-index.mjs";
import { applyContextTransaction, withContextLock } from "../../../scripts/lib/context-transaction.mjs";
import { assertInside, assertNoSymlink, containsSensitiveContent, resolveProjectRoot, slash } from "../../../scripts/lib/safe-files.mjs";
import { slug } from "./context-save.mjs";

const PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const MAX_FILES = 1000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MANAGED_START = (id) => `<!-- codex-agent:migrated:start ${id} -->`;
const MANAGED_END = (id) => `<!-- codex-agent:migrated:end ${id} -->`;

const unique = (items) => [...new Set(items.filter(Boolean))];
const safeText = (value, limit = 300) => String(value).replace(/[\r\n]+/g, " ").trim().slice(0, limit);

const readJson = (file, label) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`Invalid ${label}: ${error instanceof Error ? error.message : String(error)}`); }
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
  const quoted = quote ? safeText(markdownText(quote), 240) : "";
  if (quoted.length >= 10) return quoted;
  const paragraphs = content.split(/\n\s*\n/).map(markdownText).filter((value) => value && value !== title && value.length >= 10);
  return safeText(paragraphs[0] || `${title} migrated project context.`, 240);
};

const rewriteContent = (content) => content
  .replace(/\[([^\]]+)\]\([^)]*navigation\.md(?:#[^)]*)?\)/gi, "$1 (catalog: `.codex-agent/context/index.json`)")
  .replace(/@?(?:\.opencode|\.claude)\/context\//g, ".codex-agent/context/migrated/")
  .replace(/`(?:\.opencode|\.claude)\/context`/g, "`.codex-agent/context/migrated`")
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

const diff = (before, after) => {
  if (before === after) return "";
  const oldLines = (before ?? "").split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  return [`@@ line ${prefix + 1} @@`, ...oldLines.slice(prefix).map((line) => `- ${line}`), ...newLines.slice(prefix).map((line) => `+ ${line}`)].join("\n");
};

const prepareNavigationContext = ({
  root,
  source,
  apply = false,
  force = false,
  includeNavigation = false,
  includeTemplates = false,
  includeWorkflows = false
}) => {
  const projectRoot = resolveProjectRoot(root);
  const discovery = discoverNavigationContext({ source });
  const writableCatalog = assertWritableContextCatalog({ root: projectRoot });
  const contextRoot = writableCatalog.contextRoot;
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
    const reason = containsSensitiveContent(original)
      ? "sensitive-content"
      : classify({ relative, content: metadata.content, includeNavigation, includeTemplates, includeWorkflows });
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
  const targetIndex = writableCatalog.index;
  const priorIndexContent = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : null;
  const changes = [];
  const conflicts = [];
  const migrationEntries = [];
  const candidateIdOwners = new Map();
  for (const candidate of candidates) {
    const owners = candidateIdOwners.get(candidate.id) ?? new Set();
    owners.add(candidate.destinationRelative);
    candidateIdOwners.set(candidate.id, owners);
  }
  for (const candidate of candidates) {
    assertInside(destinationRoot, candidate.destination, `Migration destination ${candidate.destinationRelative}`);
    assertNoSymlink(projectRoot, candidate.destination, "Migration destination");
    const current = fs.existsSync(candidate.destination) ? fs.readFileSync(candidate.destination, "utf8") : null;
    const merge = mergeManaged(current, candidate.id, candidate.managed, force);
    if (candidateIdOwners.get(candidate.id).size > 1) {
      conflicts.push(candidate.destinationRelative);
      changes.push({
        source: candidate.source,
        path: candidate.destinationRelative,
        status: "conflict",
        diff: "Migration candidates generate the same context ID and must be renamed before migration."
      });
      continue;
    }
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
  assertValidContextIndex(nextIndex, {
    root: projectRoot,
    contextRoot,
    pendingPaths: migrationEntries.map((entry) => entry.path)
  });
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
    index: { path: ".codex-agent/context/index.json", entries: nextIndex.entries.length, diff: diff(priorIndexContent, indexContent) },
    applied: false,
    transaction: {
      documents: changes.filter((change) => change.status !== "unchanged" && change.status !== "conflict")
        .map((change) => ({ path: change.path, content: change.content })),
      indexContent,
      backupPaths: [
        ...changes.filter((change) => change.backup && change.before !== null).map((change) => change.path),
        ...(changes.some((change) => change.backup) && priorIndexContent !== null ? ["index.json"] : [])
      ]
    },
    unchanged: changes.every((change) => ["unchanged", "conflict"].includes(change.status)) && priorIndexContent === indexContent
  };
  return result;
};

const publicNavigationResult = ({ transaction, unchanged, ...result }) => result;

export const migrateNavigationContext = (options) => {
  const preview = prepareNavigationContext(options);
  if (!options.apply || preview.conflicts.length) return publicNavigationResult(preview);
  return withContextLock({ root: preview.root }, () => {
    const prepared = prepareNavigationContext({ ...options, root: preview.root, apply: true });
    if (prepared.conflicts.length) return publicNavigationResult(prepared);
    if (!prepared.unchanged) {
      const transaction = applyContextTransaction({
        root: prepared.root,
        documents: prepared.transaction.documents,
        indexContent: prepared.transaction.indexContent,
        backupPaths: prepared.transaction.backupPaths,
        lock: false
      });
      prepared.backedUp = transaction.backedUp;
    }
    prepared.applied = true;
    return publicNavigationResult(prepared);
  });
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
