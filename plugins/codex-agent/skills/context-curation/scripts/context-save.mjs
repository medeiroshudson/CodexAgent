#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertWritableContextCatalog } from "../../../scripts/lib/context-catalog.mjs";
import { assertValidContextIndex } from "../../../scripts/lib/context-index.mjs";
import { applyContextTransaction, withContextLock } from "../../../scripts/lib/context-transaction.mjs";
import {
  assertInside,
  assertNoSymlink,
  assertSafeMarkdownContent,
  containsSensitiveContent,
  listTreeFiles,
  resolveProjectRoot,
  sha256,
  slash
} from "../../../scripts/lib/safe-files.mjs";

export { containsSensitiveContent };

const KINDS = {
  decision: "decisions",
  constraint: "constraints",
  operation: "operations",
  domain: "domain",
  pitfall: "pitfalls"
};
const PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const CONFIDENCE = new Set(["high", "medium"]);
const PROPOSAL_FIELDS = new Set([
  "version", "title", "kind", "summary", "scope", "contentMarkdown",
  "evidence", "tags", "priority", "confidence", "reviewWhen"
]);
const unique = (items) => [...new Set(items)];
const safeText = (value, limit = 300) => String(value).replace(/[\r\n]+/g, " ").replace(/`/g, "'").trim().slice(0, limit);
const mdCode = (value) => `\`${safeText(value)}\``;
const normalizeForComparison = (value) => String(value).toLowerCase().replace(/\s+/g, " ").trim();

export const slug = (value) => {
  const normalized = String(value).normalize("NFKC").trim();
  if (!normalized) return "";
  const decomposed = normalized.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const ascii = decomposed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  const unicodeSuffix = `u-${sha256(Buffer.from(normalized)).slice(0, 16)}`;
  if (!ascii) return unicodeSuffix;
  if (/[^\x00-\x7f]/.test(decomposed)) return `${ascii.slice(0, 45).replace(/-$/g, "")}-${unicodeSuffix}`;
  return ascii;
};

const firstHeading = (content, fallback) => content.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
const firstParagraph = (content, fallback) => {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/^#+\s+.*$/gm, "").replace(/^[-*]\s+/gm, "").trim())
    .filter(Boolean);
  const candidate = (paragraphs[0] || "").replace(/\s+/g, " ").slice(0, 240);
  return candidate.length >= 10 ? candidate : String(fallback).replace(/\s+/g, " ").slice(0, 240);
};

const listMarkdown = (root) => {
  if (!fs.existsSync(root)) return [];
  return listTreeFiles(root).filter((entry) => entry.relative.toLowerCase().endsWith(".md")).map((entry) => entry.absolute);
};

export const prepareContextIndex = ({ root, pendingDocuments = [] }) => {
  const writable = assertWritableContextCatalog({ root });
  const projectRoot = writable.root;
  const contextRoot = writable.contextRoot;
  if (!fs.existsSync(contextRoot) && pendingDocuments.length === 0) throw new Error(`Context directory not found: ${contextRoot}`);
  assertNoSymlink(projectRoot, contextRoot, "Canonical context root");
  const indexPath = path.join(contextRoot, "index.json");
  const prior = writable.index;
  const priorByPath = new Map(prior.entries.map((entry) => [entry.path, entry]));
  const pending = new Map();
  for (const [index, document] of pendingDocuments.entries()) {
    if (!document || typeof document.path !== "string" || typeof document.content !== "string") {
      throw new Error(`Pending context document ${index} is invalid`);
    }
    assertSafeMarkdownContent(document.content, `Pending context document ${index}`);
    const target = path.resolve(contextRoot, document.path);
    assertInside(contextRoot, target, `Pending context document ${index}`);
    const relative = slash(path.relative(contextRoot, target));
    if (!relative || relative.startsWith("../") || relative === "index.json" || !relative.endsWith(".md")) {
      throw new Error(`Pending context document ${index} has an invalid path: ${document.path}`);
    }
    pending.set(relative, document.content);
  }
  const diskPaths = listMarkdown(contextRoot).map((file) => slash(path.relative(contextRoot, file)));
  const entries = [...new Set([...diskPaths, ...pending.keys()])].sort().map((relative) => {
    const content = pending.has(relative)
      ? pending.get(relative)
      : fs.readFileSync(path.join(contextRoot, ...relative.split("/")), "utf8");
    assertSafeMarkdownContent(content, `Context Markdown ${relative}`);
    const title = firstHeading(content, path.basename(relative, ".md"));
    const existing = priorByPath.get(relative);
    const tags = unique([
      ...relative.replace(/\.md$/, "").split("/"),
      ...title.toLowerCase().split(/[^a-z0-9_-]+/).filter((term) => term.length > 2)
    ].map(slug).filter(Boolean)).slice(0, 10);
    return {
      id: existing?.id || slug(relative.replace(/\.md$/, "").replaceAll("/", "-")),
      path: relative,
      summary: existing?.summary || firstParagraph(content, `${title} project context.`),
      tags: existing?.tags?.length ? existing.tags : tags,
      priority: existing?.priority || "medium"
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const schemaPath = path.join(projectRoot, "schemas", "context-index.schema.json");
  const index = {
    ...(fs.existsSync(schemaPath) ? { $schema: "../../schemas/context-index.schema.json" } : prior.$schema ? { $schema: prior.$schema } : {}),
    version: 1,
    entries
  };
  assertValidContextIndex(index, { root: projectRoot, contextRoot, pendingPaths: [...pending.keys()] });
  const content = `${JSON.stringify(index, null, 2)}\n`;
  return { projectRoot, path: indexPath, index, content };
};

export const buildContextIndex = ({ root, dryRun = false }) => {
  const preview = prepareContextIndex({ root });
  if (dryRun) return { path: preview.path, index: preview.index, content: preview.content, dryRun: true };
  return withContextLock({ root: preview.projectRoot }, () => {
    const prepared = prepareContextIndex({ root: preview.projectRoot });
    applyContextTransaction({
      root: prepared.projectRoot,
      documents: [],
      indexContent: prepared.content,
      backupPaths: fs.existsSync(prepared.path) ? ["index.json"] : [],
      lock: false
    });
    return { path: prepared.path, index: prepared.index, content: prepared.content, dryRun: false };
  });
};

const checkString = (errors, proposal, field, minimum, maximum) => {
  const value = proposal[field];
  if (typeof value !== "string" || value.trim().length < minimum || value.length > maximum) {
    errors.push(`${field} must be a string between ${minimum} and ${maximum} characters`);
  }
};

export const validateContextProposal = (proposal, { root } = {}) => {
  const errors = [];
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return { ok: false, errors: ["proposal must be an object"] };
  for (const field of Object.keys(proposal)) if (!PROPOSAL_FIELDS.has(field)) errors.push(`unsupported field: ${field}`);
  if (proposal.version !== 1) errors.push("version must be 1");
  checkString(errors, proposal, "title", 5, 100);
  checkString(errors, proposal, "summary", 10, 240);
  checkString(errors, proposal, "scope", 2, 120);
  checkString(errors, proposal, "contentMarkdown", 20, 10000);
  if (!Object.hasOwn(KINDS, proposal.kind)) errors.push(`kind must be one of: ${Object.keys(KINDS).join(", ")}`);
  if (!PRIORITIES.has(proposal.priority)) errors.push("priority is invalid");
  if (!CONFIDENCE.has(proposal.confidence)) errors.push("confidence must be high or medium");
  if (!Array.isArray(proposal.tags) || proposal.tags.length < 1 || proposal.tags.length > 10) errors.push("tags must contain between 1 and 10 values");
  else {
    if (new Set(proposal.tags).size !== proposal.tags.length) errors.push("tags must be unique");
    for (const tag of proposal.tags) if (typeof tag !== "string" || !/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(tag)) errors.push(`invalid tag: ${String(tag)}`);
  }
  if (!Array.isArray(proposal.evidence) || proposal.evidence.length < 1 || proposal.evidence.length > 20) errors.push("evidence must contain between 1 and 20 entries");
  else for (const [index, item] of proposal.evidence.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => !["path", "note"].includes(key))) {
      errors.push(`evidence[${index}] is invalid`);
      continue;
    }
    if (typeof item.path !== "string" || !item.path || item.path.length > 300 || path.isAbsolute(item.path)) errors.push(`evidence[${index}].path must be repository-relative`);
    if (typeof item.note !== "string" || item.note.trim().length < 5 || item.note.length > 300) errors.push(`evidence[${index}].note is invalid`);
  }
  if (proposal.reviewWhen !== undefined && (!Array.isArray(proposal.reviewWhen) || proposal.reviewWhen.length > 5
    || proposal.reviewWhen.some((item) => typeof item !== "string" || item.trim().length < 5 || item.length > 240))) {
    errors.push("reviewWhen must contain up to 5 non-empty strings");
  }
  const combined = JSON.stringify(proposal);
  if (combined.includes("codex-agent:context:start") || combined.includes("codex-agent:context:end")) errors.push("proposal must not contain managed marker text");
  if (containsSensitiveContent(combined)) errors.push("proposal appears to contain a secret or credential");

  if (root && Array.isArray(proposal.evidence)) {
    const projectRoot = fs.realpathSync(path.resolve(root));
    for (const [index, item] of proposal.evidence.entries()) {
      if (!item || typeof item.path !== "string" || path.isAbsolute(item.path)) continue;
      const target = path.resolve(projectRoot, item.path);
      if (target !== projectRoot && !target.startsWith(`${projectRoot}${path.sep}`)) {
        errors.push(`evidence[${index}].path escapes the repository`);
        continue;
      }
      try { assertNoSymlink(projectRoot, target, `evidence[${index}].path`); }
      catch {
        errors.push(`evidence[${index}].path must not traverse a symbolic link`);
        continue;
      }
      if (!fs.existsSync(target)) errors.push(`evidence[${index}].path does not exist: ${item.path}`);
    }
  }
  return { ok: errors.length === 0, errors };
};

export const normalizeContextProposal = (proposal) => ({
  version: 1,
  title: proposal.title.trim(),
  kind: proposal.kind,
  summary: proposal.summary.trim(),
  scope: proposal.scope.trim(),
  contentMarkdown: proposal.contentMarkdown.trim(),
  evidence: proposal.evidence.map((item) => ({ path: slash(item.path), note: item.note.trim() })),
  tags: proposal.tags,
  priority: proposal.priority,
  confidence: proposal.confidence,
  ...(proposal.reviewWhen?.length ? { reviewWhen: proposal.reviewWhen.map((item) => item.trim()) } : {})
});

export const renderContextProposal = (proposal, { recordedAt = new Date().toISOString().slice(0, 10) } = {}) => {
  const id = `${proposal.kind}-${slug(proposal.title)}`;
  const evidence = proposal.evidence.map((item) => `- ${mdCode(item.path)} — ${safeText(item.note)}`).join("\n");
  const review = proposal.reviewWhen?.length
    ? `\n\n## Review when\n\n${proposal.reviewWhen.map((item) => `- ${safeText(item, 240)}`).join("\n")}`
    : "";
  const body = [
    `- Kind: \`${proposal.kind}\``,
    `- Scope: ${safeText(proposal.scope, 120)}`,
    `- Confidence: \`${proposal.confidence}\``,
    `- Recorded: \`${recordedAt}\``,
    "",
    "## Summary",
    "",
    safeText(proposal.summary, 240),
    "",
    "## Knowledge",
    "",
    proposal.contentMarkdown.trim(),
    "",
    "## Evidence",
    "",
    evidence
  ].join("\n");
  const managed = `<!-- codex-agent:context:start ${id} -->\n${body}${review}\n<!-- codex-agent:context:end ${id} -->`;
  return { id, managed, content: `# ${safeText(proposal.title, 100)}\n\n${managed}\n` };
};

const mergeManaged = (current, rendered, update) => {
  if (current === null) return { status: "create", content: rendered.content, conflict: false };
  const start = `<!-- codex-agent:context:start ${rendered.id} -->`;
  const end = `<!-- codex-agent:context:end ${rendered.id} -->`;
  const startIndex = current.indexOf(start);
  const endIndex = current.indexOf(end);
  if (startIndex >= 0 && endIndex > startIndex) {
    const content = `${current.slice(0, startIndex)}${rendered.managed}${current.slice(endIndex + end.length)}`.replace(/\s*$/, "\n");
    if (content === current) return { status: "unchanged", content, conflict: false };
    return update ? { status: "update", content, conflict: false } : { status: "conflict", content, conflict: true };
  }
  if ((startIndex >= 0) !== (endIndex >= 0) || endIndex < startIndex) return { status: "conflict", content: rendered.content, conflict: true };
  return update ? { status: "update", content: rendered.content, conflict: false } : { status: "conflict", content: rendered.content, conflict: true };
};

const diff = (before, after) => {
  if (before === after) return "";
  const oldLines = (before ?? "").split("\n");
  const newLines = after.split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  return [`@@ line ${prefix + 1} @@`, ...oldLines.slice(prefix).map((line) => `- ${line}`), ...newLines.slice(prefix).map((line) => `+ ${line}`)].join("\n");
};

const prepareContextProposal = ({ root, proposal, apply, update }) => {
  const projectRoot = resolveProjectRoot(root);
  const validation = validateContextProposal(proposal, { root: projectRoot });
  if (!validation.ok) throw new Error(`Invalid context proposal:\n- ${validation.errors.join("\n- ")}`);
  const normalized = normalizeContextProposal(proposal);
  const rendered = renderContextProposal(normalized);
  const writable = assertWritableContextCatalog({ root: projectRoot });
  const contextRoot = writable.contextRoot;
  const relativePath = `${KINDS[normalized.kind]}/${slug(normalized.title)}.md`;
  const destination = path.join(contextRoot, ...relativePath.split("/"));
  assertInside(contextRoot, destination, "context destination");
  assertNoSymlink(projectRoot, contextRoot, "Canonical context root");
  assertNoSymlink(projectRoot, destination, "Context destination");
  const indexPath = writable.indexPath;
  const index = writable.index;
  const currentIndexContent = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : null;
  const duplicate = index.entries.find((entry) => entry.path !== relativePath
    && (entry.id === rendered.id || normalizeForComparison(entry.summary) === normalizeForComparison(normalized.summary)));
  if (duplicate) throw new Error(`Duplicate context candidate: ${duplicate.path}`);
  const current = fs.existsSync(destination) ? fs.readFileSync(destination, "utf8") : null;
  const merge = mergeManaged(current, rendered, update);
  const priorEntry = index.entries.find((entry) => entry.path === relativePath || entry.id === rendered.id);
  if (priorEntry && priorEntry.path !== relativePath) throw new Error(`Context id already belongs to another path: ${priorEntry.path}`);
  const nextEntry = {
    id: rendered.id,
    path: relativePath,
    summary: normalized.summary,
    tags: unique([normalized.kind, ...normalized.tags]).slice(0, 10),
    priority: normalized.priority
  };
  const nextIndex = {
    ...(index.$schema ? { $schema: index.$schema } : {}),
    version: 1,
    entries: [...index.entries.filter((entry) => entry.path !== relativePath && entry.id !== rendered.id), nextEntry]
      .sort((left, right) => left.path.localeCompare(right.path))
  };
  assertValidContextIndex(nextIndex, { root: projectRoot, contextRoot, pendingPaths: [relativePath] });
  const indexContent = `${JSON.stringify(nextIndex, null, 2)}\n`;
  const metadataChanged = Boolean(priorEntry) && JSON.stringify(priorEntry) !== JSON.stringify(nextEntry);
  const conflicts = merge.conflict || (metadataChanged && !update) ? [relativePath] : [];
  const overallStatus = merge.status === "unchanged" && metadataChanged ? "update" : merge.status;
  const result = {
    root: projectRoot,
    mode: apply ? "apply" : "preview",
    proposal: normalized,
    id: rendered.id,
    path: relativePath,
    status: overallStatus,
    diff: diff(current, merge.content),
    indexDiff: diff(currentIndexContent, indexContent),
    index: { path: ".codex-agent/context/index.json", entries: nextIndex.entries.length },
    conflicts,
    backedUp: [],
    applied: false,
    transaction: {
      documents: [{ path: relativePath, content: merge.content }],
      indexContent,
      backupPaths: current !== null && overallStatus === "update"
        ? [...(merge.status === "update" ? [relativePath] : []), ...(currentIndexContent !== null ? ["index.json"] : [])]
        : []
    },
    unchanged: current === merge.content && currentIndexContent === indexContent
  };
  return result;
};

const publicProposalResult = ({ transaction, unchanged, ...result }) => result;

export const saveContextProposal = ({ root, proposal, apply = false, update = false }) => {
  const preview = prepareContextProposal({ root, proposal, apply, update });
  if (!apply || preview.conflicts.length) return publicProposalResult(preview);
  return withContextLock({ root: preview.root }, () => {
    const prepared = prepareContextProposal({ root: preview.root, proposal, apply: true, update });
    if (prepared.conflicts.length) return publicProposalResult(prepared);
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
    return publicProposalResult(prepared);
  });
};

const option = (args, name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

export const main = (args = process.argv.slice(2)) => {
  const proposalFile = option(args, "--proposal");
  if (!proposalFile) throw new Error("context save requires --proposal FILE");
  const absolute = path.resolve(proposalFile);
  if (!fs.existsSync(absolute)) throw new Error(`Proposal file not found: ${absolute}`);
  let proposal;
  try { proposal = JSON.parse(fs.readFileSync(absolute, "utf8")); }
  catch (error) { throw new Error(`Could not parse proposal file: ${error instanceof Error ? error.message : String(error)}`); }
  const result = saveContextProposal({
    root: path.resolve(option(args, "--root", process.cwd())),
    proposal,
    apply: args.includes("--apply"),
    update: args.includes("--update")
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.conflicts.length) process.exitCode = 2;
};

if (process.argv[1] && path.basename(process.argv[1]) === "context-save.mjs" && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
