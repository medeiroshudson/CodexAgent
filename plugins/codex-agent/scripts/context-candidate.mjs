import fs from "node:fs";
import path from "node:path";
import {
  assertInside,
  assertNoSymlink,
  containsSensitiveContent,
  sha256
} from "./lib/safe-files.mjs";

export const CONTEXT_CANDIDATE_MARKER = "<!-- codex-agent:context-candidate:v1 -->";

const KINDS = new Set(["decision", "constraint", "operation", "domain", "pitfall"]);
const PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const CONFIDENCE = new Set(["high", "medium"]);
const METADATA_FIELDS = new Set([
  "version", "id", "sourceSessionId", "createdAt", "title", "kind", "summary",
  "scope", "evidence", "tags", "priority", "confidence", "reviewWhen"
]);

const unique = (items) => [...new Set(items)];
const compact = (value) => String(value).replace(/[\r\n]+/g, " ").trim();

export const candidateSlug = (value) => {
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

const requireString = (errors, value, name, minimum, maximum) => {
  if (typeof value !== "string" || value.trim().length < minimum || value.length > maximum) {
    errors.push(`${name} must be a string between ${minimum} and ${maximum} characters`);
  }
};

const validateEvidence = (errors, evidence, root) => {
  if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 20) {
    errors.push("evidence must contain between 1 and 20 items");
    return;
  }
  for (const [index, item] of evidence.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`evidence[${index}] must be an object`);
      continue;
    }
    const extras = Object.keys(item).filter((field) => !["path", "note"].includes(field));
    if (extras.length) errors.push(`evidence[${index}] has unsupported fields: ${extras.join(", ")}`);
    requireString(errors, item.path, `evidence[${index}].path`, 1, 300);
    requireString(errors, item.note, `evidence[${index}].note`, 5, 300);
    if (typeof item.path !== "string" || !item.path) continue;
    if (path.isAbsolute(item.path)) {
      errors.push(`evidence[${index}].path must be repository-relative`);
      continue;
    }
    const target = path.resolve(root, item.path);
    try {
      assertInside(root, target, `evidence[${index}].path`);
      assertNoSymlink(root, target);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        errors.push(`evidence[${index}].path does not name an existing file: ${item.path}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
};

export const validateContextCandidate = ({ metadata, knowledge }, { root }) => {
  if (!root) return { ok: false, errors: ["repository root is required"] };
  const projectRoot = path.resolve(root);
  const errors = [];
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { ok: false, errors: ["candidate metadata must be an object"] };
  }

  const extras = Object.keys(metadata).filter((field) => !METADATA_FIELDS.has(field));
  if (extras.length) errors.push(`candidate metadata has unsupported fields: ${extras.join(", ")}`);
  if (metadata.version !== 1) errors.push("version must be 1");
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(metadata.id ?? "")) errors.push("id is invalid");
  if (!/^[a-z0-9][a-z0-9-]{7,79}$/.test(metadata.sourceSessionId ?? "")) errors.push("sourceSessionId is invalid");
  if (!Number.isFinite(Date.parse(metadata.createdAt ?? ""))) errors.push("createdAt must be an ISO date-time");
  requireString(errors, metadata.title, "title", 5, 100);
  if (!KINDS.has(metadata.kind)) errors.push("kind is invalid");
  requireString(errors, metadata.summary, "summary", 10, 240);
  requireString(errors, metadata.scope, "scope", 2, 120);
  validateEvidence(errors, metadata.evidence, projectRoot);

  if (!Array.isArray(metadata.tags) || metadata.tags.length < 1 || metadata.tags.length > 10) {
    errors.push("tags must contain between 1 and 10 items");
  } else {
    if (unique(metadata.tags).length !== metadata.tags.length) errors.push("tags must be unique");
    for (const tag of metadata.tags) {
      if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(tag)) errors.push(`invalid tag: ${tag}`);
    }
  }
  if (!PRIORITIES.has(metadata.priority)) errors.push("priority is invalid");
  if (!CONFIDENCE.has(metadata.confidence)) errors.push("confidence is invalid");
  if (metadata.reviewWhen !== undefined) {
    if (!Array.isArray(metadata.reviewWhen) || metadata.reviewWhen.length > 5) {
      errors.push("reviewWhen must contain at most 5 items");
    } else for (const [index, item] of metadata.reviewWhen.entries()) {
      requireString(errors, item, `reviewWhen[${index}]`, 5, 240);
    }
  }

  requireString(errors, knowledge, "knowledge", 20, 10000);
  if (containsSensitiveContent(JSON.stringify(metadata)) || containsSensitiveContent(knowledge ?? "")) {
    errors.push("candidate appears to contain a secret or credential");
  }
  return { ok: errors.length === 0, errors };
};

export const normalizeContextCandidate = (candidate, { sourceSessionId, now = new Date() } = {}) => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Context candidate must be an object");
  }
  const title = compact(candidate.title ?? "");
  const baseId = candidateSlug(candidate.id || `${candidate.kind || "context"}-${title}`);
  const metadata = {
    version: 1,
    id: baseId,
    sourceSessionId: sourceSessionId || candidate.sourceSessionId,
    createdAt: candidate.createdAt || now.toISOString(),
    title,
    kind: candidate.kind,
    summary: compact(candidate.summary ?? ""),
    scope: compact(candidate.scope ?? ""),
    evidence: (candidate.evidence ?? []).map((item) => ({
      path: String(item.path ?? "").split(path.sep).join("/"),
      note: compact(item.note ?? "")
    })),
    tags: unique((candidate.tags ?? []).map((tag) => String(tag).toLowerCase())),
    priority: candidate.priority,
    confidence: candidate.confidence,
    ...(candidate.reviewWhen?.length ? { reviewWhen: unique(candidate.reviewWhen.map(compact)) } : {})
  };
  return { metadata, knowledge: String(candidate.knowledge ?? candidate.contentMarkdown ?? "").trim() };
};

export const renderContextCandidate = (candidate, options = {}) => {
  const normalized = normalizeContextCandidate(candidate, options);
  const validation = validateContextCandidate(normalized, { root: options.root });
  if (!validation.ok) throw new Error(`Invalid context candidate:\n- ${validation.errors.join("\n- ")}`);
  return [
    CONTEXT_CANDIDATE_MARKER,
    "",
    `# ${normalized.metadata.title}`,
    "",
    "## Metadata",
    "",
    "```json",
    JSON.stringify(normalized.metadata, null, 2),
    "```",
    "",
    "## Knowledge",
    "",
    normalized.knowledge,
    ""
  ].join("\n");
};

export const parseContextCandidate = (content, { root }) => {
  const text = String(content);
  if (!text.startsWith(`${CONTEXT_CANDIDATE_MARKER}\n`)) throw new Error("Missing context candidate marker");
  const match = text.match(/^<!-- codex-agent:context-candidate:v1 -->\n\n# ([^\n]+)\n\n## Metadata\n\n```json\n([\s\S]*?)\n```\n\n## Knowledge\n\n([\s\S]*?)\n?$/);
  if (!match) throw new Error("Invalid context candidate Markdown structure");
  let metadata;
  try { metadata = JSON.parse(match[2]); }
  catch (error) { throw new Error(`Invalid context candidate metadata JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (match[1].trim() !== metadata.title) throw new Error("Context candidate heading does not match metadata title");
  const candidate = { metadata, knowledge: match[3].trim() };
  const validation = validateContextCandidate(candidate, { root });
  if (!validation.ok) throw new Error(`Invalid context candidate:\n- ${validation.errors.join("\n- ")}`);
  return candidate;
};

export const contextCandidateToProposal = ({ metadata, knowledge }) => ({
  version: 1,
  title: metadata.title,
  kind: metadata.kind,
  summary: metadata.summary,
  scope: metadata.scope,
  contentMarkdown: knowledge,
  evidence: metadata.evidence,
  tags: metadata.tags,
  priority: metadata.priority,
  confidence: metadata.confidence,
  ...(metadata.reviewWhen?.length ? { reviewWhen: metadata.reviewWhen } : {})
});
