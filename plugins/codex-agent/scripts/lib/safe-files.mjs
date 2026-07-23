import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/
];

export const slash = (value) => String(value).split(path.sep).join("/");
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const containsSensitiveContent = (value) => SECRET_PATTERNS.some((pattern) => pattern.test(String(value)));

export const assertSafeMarkdownContent = (value, label = "Markdown") => {
  if (containsSensitiveContent(value)) throw new Error(`${label} contains sensitive content`);
};

export const resolveProjectRoot = (root) => {
  const absolute = path.resolve(root);
  if (!fs.existsSync(absolute)) throw new Error(`Repository root not found: ${absolute}`);
  if (!fs.statSync(absolute).isDirectory()) throw new Error(`Repository root is not a directory: ${absolute}`);
  return fs.realpathSync(absolute);
};

export const assertInside = (root, target, label = "Path") => {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  if (absoluteTarget !== absoluteRoot && !absoluteTarget.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`${label} escapes its allowed root`);
  }
  return absoluteTarget;
};

const lstatIfPresent = (target) => {
  try { return fs.lstatSync(target); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

export const assertNoSymlink = (root, target, label = "Path") => {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = assertInside(absoluteRoot, target, label);
  if (lstatIfPresent(absoluteRoot)?.isSymbolicLink()) {
    throw new Error(`${label} ancestry contains a symbolic link: ${absoluteRoot}`);
  }
  let current = absoluteRoot;
  for (const segment of path.relative(absoluteRoot, absoluteTarget).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (lstatIfPresent(current)?.isSymbolicLink()) {
      throw new Error(`${label} ancestry contains a symbolic link: ${slash(path.relative(absoluteRoot, current))}`);
    }
  }
  return absoluteTarget;
};

export const ensureDirectory = (root, directory, label = "Directory") => {
  const target = assertNoSymlink(root, directory, label);
  fs.mkdirSync(target, { recursive: true });
  assertNoSymlink(root, target, label);
  if (!fs.statSync(target).isDirectory()) throw new Error(`${label} is not a directory: ${target}`);
  return target;
};

export const listTreeFiles = (root, { includeDirectories = false } = {}) => {
  const absoluteRoot = path.resolve(root);
  const rootStat = lstatIfPresent(absoluteRoot);
  if (!rootStat) return [];
  if (rootStat.isSymbolicLink()) throw new Error(`Refusing to traverse symbolic link: ${absoluteRoot}`);
  if (!rootStat.isDirectory()) throw new Error(`Expected directory: ${absoluteRoot}`);
  const entries = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = slash(path.relative(absoluteRoot, absolute));
      if (entry.isSymbolicLink()) throw new Error(`Refusing to traverse symbolic link: ${relative}`);
      if (entry.isDirectory()) {
        if (includeDirectories) entries.push({ absolute, relative, type: "directory" });
        visit(absolute);
      } else if (entry.isFile()) entries.push({ absolute, relative, type: "file" });
      else throw new Error(`Unsupported filesystem entry in context catalog: ${relative}`);
    }
  };
  visit(absoluteRoot);
  return entries;
};

export const copyTreeSafely = (source, destination, { root } = {}) => {
  const absoluteSource = path.resolve(source);
  const absoluteDestination = path.resolve(destination);
  const allowedRoot = path.resolve(root ?? path.dirname(absoluteDestination));
  assertInside(allowedRoot, absoluteDestination, "Copy destination");
  assertNoSymlink(path.dirname(absoluteSource), absoluteSource, "Copy source");
  if (lstatIfPresent(absoluteDestination)) throw new Error(`Copy destination already exists: ${absoluteDestination}`);
  const entries = listTreeFiles(absoluteSource, { includeDirectories: true });
  for (const entry of entries) {
    if (entry.type === "file" && entry.relative.toLowerCase().endsWith(".md")) {
      assertSafeMarkdownContent(fs.readFileSync(entry.absolute, "utf8"), `Markdown file ${entry.relative}`);
    }
  }
  fs.mkdirSync(absoluteDestination, { recursive: false });
  try {
    for (const entry of entries) {
      const target = path.join(absoluteDestination, ...entry.relative.split("/"));
      assertInside(absoluteDestination, target, "Copied context path");
      if (entry.type === "directory") fs.mkdirSync(target, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(entry.absolute, target, fs.constants.COPYFILE_EXCL);
      }
    }
  } catch (error) {
    fs.rmSync(absoluteDestination, { recursive: true, force: true });
    throw error;
  }
  return absoluteDestination;
};

export const safeRelativePath = (value, label = "Path") => {
  if (typeof value !== "string" || !value || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty portable relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${label} escapes or is not normalized: ${value}`);
  }
  return normalized;
};
