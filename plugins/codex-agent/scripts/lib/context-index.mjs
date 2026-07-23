import fs from "node:fs";
import path from "node:path";
import { containsSensitiveContent } from "./safe-files.mjs";

const ROOT_FIELDS = new Set(["$schema", "version", "entries"]);
const ENTRY_FIELDS = new Set(["id", "path", "summary", "tags", "priority"]);
const PRIORITIES = ["critical", "high", "medium", "low"];
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH_PATTERN = /^(?!\/)(?!.*\.\.\/).+\.md$/;
const TAG_PATTERN = /^[a-z0-9_-]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f\u2028\u2029]/;

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const unsupportedFields = (value, allowed) => Object.keys(value).filter((field) => !allowed.has(field)).sort();
const codePointLength = (value) => [...value].length;

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
  if (!Object.hasOwn(value, "version") || value.version !== 1) {
    errors.push("context index.version must be 1");
  }
  if (!Object.hasOwn(value, "entries") || !Array.isArray(value.entries)) {
    errors.push("context index.entries must be an array");
    return { ok: false, errors };
  }

  const ids = new Set();
  const paths = new Set();
  const filesystemPaths = [];
  for (const [position, item] of value.entries.entries()) {
    const label = `context index.entries[${position}]`;
    if (!isObject(item)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    for (const field of unsupportedFields(item, ENTRY_FIELDS)) {
      errors.push(`${label} has unsupported field: ${field}`);
    }

    const validId = Object.hasOwn(item, "id") && typeof item.id === "string" && ID_PATTERN.test(item.id);
    if (!validId) {
      errors.push(`${label}.id must match ${ID_PATTERN.source}`);
    } else if (ids.has(item.id)) {
      errors.push(`context index has duplicate id: ${item.id}`);
    } else {
      ids.add(item.id);
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
