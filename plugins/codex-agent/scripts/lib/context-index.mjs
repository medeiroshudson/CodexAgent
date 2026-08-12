import fs from "node:fs";
import path from "node:path";
import { containsSensitiveContent } from "./safe-files.mjs";

const ROOT_FIELDS = new Set(["$schema", "version", "entries"]);
const BASE_ENTRY_FIELDS = ["id", "path", "summary", "tags", "priority"];
const V1_ENTRY_FIELDS = new Set(BASE_ENTRY_FIELDS);
const V2_ENTRY_FIELDS = new Set([
  ...BASE_ENTRY_FIELDS,
  "kind", "scope", "confidence", "status", "recordedAt", "lastVerifiedAt",
  "reviewAfter", "aliases", "related", "supersedes", "supersededBy", "evidence"
]);
const PRIORITIES = ["critical", "high", "medium", "low"];
const KINDS = ["architecture", "standard", "project", "decision", "constraint", "operation", "domain", "pitfall", "imported"];
const CONFIDENCE = ["high", "medium", "low", "unknown"];
const STATUSES = ["active", "conflicted", "superseded"];
const EVIDENCE_TYPES = ["repository", "external", "decision"];
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH_PATTERN = /^(?!\/)(?!.*\.\.\/).+\.md$/;
const TAG_PATTERN = /^[a-z0-9_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f\u2028\u2029]/;

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const unsupportedFields = (value, allowed) => Object.keys(value).filter((field) => !allowed.has(field)).sort();
const codePointLength = (value) => [...value].length;
const isDateString = (value) => typeof value === "string" && DATE_PATTERN.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export const contextDate = (date = new Date()) => date.toISOString().slice(0, 10);

export const inferContextKind = (entryPath) => {
  const normalized = String(entryPath ?? "").toLowerCase();
  if (normalized.startsWith("architecture/")) return "architecture";
  if (normalized.startsWith("standards/")) return "standard";
  if (normalized.startsWith("project-intelligence/")) return "project";
  if (normalized.startsWith("decisions/")) return "decision";
  if (normalized.startsWith("constraints/")) return "constraint";
  if (normalized.startsWith("operations/")) return "operation";
  if (normalized.startsWith("domain/")) return "domain";
  if (normalized.startsWith("pitfalls/")) return "pitfall";
  return "imported";
};

export const upgradeContextIndexEntry = (entry, { recordedAt = contextDate() } = {}) => ({
  ...entry,
  kind: entry.kind ?? inferContextKind(entry.path),
  scope: entry.scope ?? (String(entry.path ?? "").split("/").slice(0, -1).join("/") || "repository"),
  confidence: entry.confidence ?? "unknown",
  status: entry.status ?? "active",
  recordedAt: entry.recordedAt ?? recordedAt,
  lastVerifiedAt: entry.lastVerifiedAt ?? recordedAt
});

export const upgradeContextIndex = (index, options = {}) => ({
  ...(index?.$schema ? { $schema: index.$schema } : {}),
  version: 2,
  entries: (index?.entries ?? []).map((entry) => upgradeContextIndexEntry(entry, options))
});

const isContextPath = (value) => typeof value === "string"
  && !value.includes("\\")
  && !CONTROL_CHARACTERS.test(value)
  && PATH_PATTERN.test(value)
  && !path.posix.isAbsolute(value)
  && path.posix.normalize(value) === value;

const lstat = (target) => {
  try { return { stat: fs.lstatSync(target), error: null }; }
  catch (error) {
    if (error?.code === "ENOENT") return { stat: null, error: null };
    return { stat: null, error };
  }
};

const filesystemErrorCode = (error) => typeof error?.code === "string" ? error.code : "UNKNOWN";

const isInside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

const inspectAncestry = (root, target) => {
  let current = root;
  const relative = path.relative(root, target);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  for (const [position, segment] of segments.entries()) {
    current = path.join(current, segment);
    const inspected = lstat(current);
    if (inspected.error) return { error: inspected.error };
    if (!inspected.stat) return { missing: true };
    if (inspected.stat.isSymbolicLink()) return { symlink: current };
    if (position < segments.length - 1 && !inspected.stat.isDirectory()) return { nonDirectory: current };
  }
  return {};
};

const filesystemContext = (options, errors) => {
  const hasRoot = options.root !== undefined;
  const hasContextRoot = options.contextRoot !== undefined;
  if (!hasRoot && !hasContextRoot) return null;
  if (!hasRoot || !hasContextRoot) {
    errors.push("context index filesystem validation requires root and contextRoot");
    return null;
  }
  if (typeof options.root !== "string" || !options.root) {
    errors.push("context index root must be a non-empty path string");
    return null;
  }
  if (typeof options.contextRoot !== "string" || !options.contextRoot) {
    errors.push("context index contextRoot must be a non-empty path string");
    return null;
  }

  const root = path.resolve(options.root);
  const contextRoot = path.isAbsolute(options.contextRoot)
    ? path.resolve(options.contextRoot)
    : path.resolve(root, options.contextRoot);
  if (!isInside(root, contextRoot)) {
    errors.push("context index contextRoot escapes root");
    return null;
  }

  const inspectedRoot = lstat(root);
  if (inspectedRoot.error) {
    errors.push(`context index root could not be inspected: ${filesystemErrorCode(inspectedRoot.error)}`);
    return null;
  }
  if (!inspectedRoot.stat) {
    errors.push("context index root does not exist");
    return null;
  }
  if (inspectedRoot.stat.isSymbolicLink()) {
    errors.push("context index root must not be a symbolic link");
    return null;
  }
  if (!inspectedRoot.stat.isDirectory()) {
    errors.push("context index root must be a directory");
    return null;
  }

  const contextAncestry = inspectAncestry(root, contextRoot);
  if (contextAncestry.error) {
    errors.push(`context index contextRoot could not be inspected: ${filesystemErrorCode(contextAncestry.error)}`);
    return null;
  }
  if (contextAncestry.symlink) {
    errors.push(`context index contextRoot contains a symbolic link: ${path.relative(root, contextAncestry.symlink).split(path.sep).join("/") || "."}`);
    return null;
  }
  if (contextAncestry.nonDirectory) {
    errors.push("context index contextRoot must be a directory");
    return null;
  }

  const inspectedContextRoot = lstat(contextRoot);
  if (inspectedContextRoot.error) {
    errors.push(`context index contextRoot could not be inspected: ${filesystemErrorCode(inspectedContextRoot.error)}`);
    return null;
  }
  if (inspectedContextRoot.stat && !inspectedContextRoot.stat.isDirectory()) {
    errors.push("context index contextRoot must be a directory");
    return null;
  }

  const pendingPaths = new Set();
  if (options.pendingPaths !== undefined) {
    if (!Array.isArray(options.pendingPaths)) {
      errors.push("context index pendingPaths must be an array");
    } else {
      for (const [position, pendingPath] of options.pendingPaths.entries()) {
        if (!isContextPath(pendingPath)) {
          errors.push(`context index pendingPaths[${position}] must be a normalized POSIX-relative Markdown path`);
        } else {
          pendingPaths.add(pendingPath);
        }
      }
    }
  }
  return { root, contextRoot, pendingPaths };
};

const validateFilesystemEntry = ({ contextRoot, pendingPaths }, entryPath, errors) => {
  const target = path.join(contextRoot, ...entryPath.split("/"));
  if (!isInside(contextRoot, target)) {
    errors.push(`context index entry escapes contextRoot: ${entryPath}`);
    return;
  }

  const ancestry = inspectAncestry(contextRoot, target);
  if (ancestry.error) {
    errors.push(`context index entry could not be inspected: ${entryPath} (${filesystemErrorCode(ancestry.error)})`);
    return;
  }
  if (ancestry.symlink) {
    errors.push(`context index entry contains a symbolic link: ${entryPath}`);
    return;
  }
  if (ancestry.nonDirectory) {
    errors.push(`context index entry is not a file: ${entryPath}`);
    return;
  }

  const inspected = lstat(target);
  if (inspected.error) {
    errors.push(`context index entry could not be inspected: ${entryPath} (${filesystemErrorCode(inspected.error)})`);
  } else if (!inspected.stat) {
    if (!pendingPaths.has(entryPath)) errors.push(`context index entry is missing: ${entryPath}`);
  } else if (inspected.stat.isSymbolicLink()) {
    errors.push(`context index entry contains a symbolic link: ${entryPath}`);
  } else if (!inspected.stat.isFile()) {
    errors.push(`context index entry is not a file: ${entryPath}`);
  }
};

/**
 * Validate a parsed context index without mutating it.
 *
 * Supplying both root and contextRoot enables filesystem containment, symlink,
 * and file checks. pendingPaths may name transaction documents that do not
 * exist yet; existing pending targets are still checked normally.
 */
export const validateContextIndex = (value, options = {}) => {
  const errors = [];
  if (!isObject(options)) {
    return { ok: false, errors: ["context index validation options must be an object"] };
  }

  const filesystem = filesystemContext(options, errors);
  if (!isObject(value)) {
    errors.unshift("context index must be an object");
    return { ok: false, errors };
  }

  if (containsSensitiveContent(JSON.stringify(value))) {
    errors.push("context index appears to contain sensitive content");
  }

  for (const field of unsupportedFields(value, ROOT_FIELDS)) {
    errors.push(`context index has unsupported field: ${field}`);
  }
  if (Object.hasOwn(value, "$schema") && typeof value.$schema !== "string") {
    errors.push("context index.$schema must be a string");
  }
  if (!Object.hasOwn(value, "version") || ![1, 2].includes(value.version)) {
    errors.push("context index.version must be 1 or 2");
  }
  if (!Object.hasOwn(value, "entries") || !Array.isArray(value.entries)) {
    errors.push("context index.entries must be an array");
    return { ok: false, errors };
  }

  const ids = new Set();
  const paths = new Set();
  const filesystemPaths = [];
  const relationships = [];
  const entryItems = new Map();
  for (const [position, item] of value.entries.entries()) {
    const label = `context index.entries[${position}]`;
    if (!isObject(item)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    const entryFields = value.version === 2 ? V2_ENTRY_FIELDS : V1_ENTRY_FIELDS;
    for (const field of unsupportedFields(item, entryFields)) {
      errors.push(`${label} has unsupported field: ${field}`);
    }

    const validId = Object.hasOwn(item, "id") && typeof item.id === "string" && ID_PATTERN.test(item.id);
    if (!validId) {
      errors.push(`${label}.id must match ${ID_PATTERN.source}`);
    } else if (ids.has(item.id)) {
      errors.push(`context index has duplicate id: ${item.id}`);
    } else {
      ids.add(item.id);
      entryItems.set(item.id, item);
    }

    const validPath = Object.hasOwn(item, "path") && isContextPath(item.path);
    if (!validPath) {
      errors.push(`${label}.path must be a normalized POSIX-relative Markdown path`);
    } else if (paths.has(item.path)) {
      errors.push(`context index has duplicate path: ${item.path}`);
    } else {
      paths.add(item.path);
      filesystemPaths.push(item.path);
    }

    const validSummary = Object.hasOwn(item, "summary")
      && typeof item.summary === "string"
      && codePointLength(item.summary) >= 10
      && codePointLength(item.summary) <= 240;
    if (!validSummary) {
      errors.push(`${label}.summary must be a string between 10 and 240 characters`);
    }

    if (!Object.hasOwn(item, "tags") || !Array.isArray(item.tags) || item.tags.length === 0) {
      errors.push(`${label}.tags must be a non-empty array`);
    } else {
      const duplicateTags = [];
      const tags = new Set();
      for (const [tagPosition, tag] of item.tags.entries()) {
        if (typeof tag !== "string" || !TAG_PATTERN.test(tag)) {
          errors.push(`${label}.tags[${tagPosition}] must match ${TAG_PATTERN.source}`);
        }
        if (tags.has(tag) && !duplicateTags.includes(tag)) duplicateTags.push(tag);
        tags.add(tag);
      }
      if (duplicateTags.length) errors.push(`${label}.tags must contain unique values: ${duplicateTags.join(", ")}`);
    }

    if (!Object.hasOwn(item, "priority") || !PRIORITIES.includes(item.priority)) {
      errors.push(`${label}.priority must be one of: ${PRIORITIES.join(", ")}`);
    }

    if (value.version === 2) {
      if (!Object.hasOwn(item, "kind") || !KINDS.includes(item.kind)) {
        errors.push(`${label}.kind must be one of: ${KINDS.join(", ")}`);
      }
      if (!Object.hasOwn(item, "scope") || typeof item.scope !== "string"
        || codePointLength(item.scope) < 2 || codePointLength(item.scope) > 120) {
        errors.push(`${label}.scope must be a string between 2 and 120 characters`);
      }
      if (!Object.hasOwn(item, "confidence") || !CONFIDENCE.includes(item.confidence)) {
        errors.push(`${label}.confidence must be one of: ${CONFIDENCE.join(", ")}`);
      }
      if (!Object.hasOwn(item, "status") || !STATUSES.includes(item.status)) {
        errors.push(`${label}.status must be one of: ${STATUSES.join(", ")}`);
      }
      for (const dateField of ["recordedAt", "lastVerifiedAt"]) {
        if (!Object.hasOwn(item, dateField) || !isDateString(item[dateField])) {
          errors.push(`${label}.${dateField} must use YYYY-MM-DD`);
        }
      }
      if (item.reviewAfter !== undefined && !isDateString(item.reviewAfter)) {
        errors.push(`${label}.reviewAfter must use YYYY-MM-DD`);
      }

      for (const field of ["aliases", "related", "supersedes", "supersededBy"]) {
        if (item[field] === undefined) continue;
        if (!Array.isArray(item[field]) || item[field].length > 20) {
          errors.push(`${label}.${field} must be an array with at most 20 values`);
          continue;
        }
        const seen = new Set();
        for (const [relationPosition, relation] of item[field].entries()) {
          const validRelation = typeof relation === "string" && (field === "aliases" ? relation.trim().length >= 2 : ID_PATTERN.test(relation));
          if (!validRelation) errors.push(`${label}.${field}[${relationPosition}] is invalid`);
          if (seen.has(relation)) errors.push(`${label}.${field} must contain unique values: ${relation}`);
          seen.add(relation);
          if (field !== "aliases" && relation === item.id) errors.push(`${label}.${field} must not reference its own id`);
          if (field !== "aliases" && validRelation) relationships.push({ label, field, target: relation });
        }
      }

      if (item.evidence !== undefined) {
        if (!Array.isArray(item.evidence) || item.evidence.length > 20) {
          errors.push(`${label}.evidence must be an array with at most 20 values`);
        } else for (const [evidencePosition, evidence] of item.evidence.entries()) {
          const evidenceLabel = `${label}.evidence[${evidencePosition}]`;
          if (!isObject(evidence)) {
            errors.push(`${evidenceLabel} must be an object`);
            continue;
          }
          for (const field of unsupportedFields(evidence, new Set([
            "type", "locator", "note", "title", "version", "sha256", "retrievedAt", "publishedAt", "decidedAt", "decisionId"
          ]))) {
            errors.push(`${evidenceLabel} has unsupported field: ${field}`);
          }
          if (!EVIDENCE_TYPES.includes(evidence.type)) errors.push(`${evidenceLabel}.type is invalid`);
          if (typeof evidence.locator !== "string" || !evidence.locator || evidence.locator.length > 500) {
            errors.push(`${evidenceLabel}.locator must be a non-empty string of at most 500 characters`);
          } else if (evidence.type === "external") {
            try {
              const url = new URL(evidence.locator);
              if (url.protocol !== "https:") errors.push(`${evidenceLabel}.locator must use https`);
              if (url.username || url.password) errors.push(`${evidenceLabel}.locator must not contain credentials`);
            } catch {
              errors.push(`${evidenceLabel}.locator must be an absolute URL`);
            }
          } else if (path.posix.isAbsolute(evidence.locator) || path.posix.normalize(evidence.locator) !== evidence.locator
            || evidence.locator.includes("\\") || evidence.locator.startsWith("../")) {
            errors.push(`${evidenceLabel}.locator must be a normalized repository-relative path`);
          }
          if (typeof evidence.note !== "string" || evidence.note.trim().length < 5 || evidence.note.length > 300) {
            errors.push(`${evidenceLabel}.note must be a string between 5 and 300 characters`);
          }
          if (["repository", "decision"].includes(evidence.type) && !SHA_PATTERN.test(evidence.sha256 ?? "")) {
            errors.push(`${evidenceLabel}.sha256 is required for repository evidence`);
          } else if (evidence.sha256 !== undefined && !SHA_PATTERN.test(evidence.sha256)) {
            errors.push(`${evidenceLabel}.sha256 is invalid`);
          }
          for (const dateField of ["retrievedAt", "publishedAt", "decidedAt"]) {
            if (evidence[dateField] !== undefined && !isDateString(evidence[dateField])) {
              errors.push(`${evidenceLabel}.${dateField} must use YYYY-MM-DD`);
            }
          }
          for (const textField of ["title", "version", "decisionId"]) {
            if (evidence[textField] !== undefined && (typeof evidence[textField] !== "string" || !evidence[textField].trim() || evidence[textField].length > 200)) {
              errors.push(`${evidenceLabel}.${textField} must be a non-empty string of at most 200 characters`);
            }
          }
        }
      }
    }
  }

  if (value.version === 2) {
    for (const relationship of relationships) {
      if (!ids.has(relationship.target)) errors.push(`${relationship.label}.${relationship.field} references unknown id: ${relationship.target}`);
    }
    for (const [id, item] of entryItems) {
      for (const targetId of item.supersedes ?? []) {
        const target = entryItems.get(targetId);
        if (target && !(target.supersededBy ?? []).includes(id)) errors.push(`context index supersession is asymmetric: ${id} supersedes ${targetId}`);
        if (target && target.status !== "superseded") errors.push(`context index superseded entry must have status superseded: ${targetId}`);
      }
      for (const targetId of item.supersededBy ?? []) {
        const target = entryItems.get(targetId);
        if (target && !(target.supersedes ?? []).includes(id)) errors.push(`context index supersession is asymmetric: ${id} is superseded by ${targetId}`);
      }
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const target of entryItems.get(id)?.supersedes ?? []) if (entryItems.has(target) && visit(target)) return true;
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    for (const id of entryItems.keys()) {
      if (visit(id)) {
        errors.push(`context index supersession graph contains a cycle involving: ${id}`);
        break;
      }
    }
  }

  if (filesystem) {
    for (const entryPath of filesystemPaths) validateFilesystemEntry(filesystem, entryPath, errors);
  }
  return { ok: errors.length === 0, errors };
};

export const assertValidContextIndex = (value, options = {}) => {
  const validation = validateContextIndex(value, options);
  if (!validation.ok) throw new Error(`Invalid context index:\n- ${validation.errors.join("\n- ")}`);
  return value;
};
