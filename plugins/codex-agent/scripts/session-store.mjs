import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertInside,
  assertNoSymlink,
  containsSensitiveContent,
  sha256
} from "./lib/safe-files.mjs";
import {
  parseContextCandidate,
  renderContextCandidate
} from "./context-candidate.mjs";

export const SESSION_HANDOFF_MARKER = "<!-- codex-agent:session-handoff:v1 -->";
export const SESSION_HANDOFF_LIMITS = Object.freeze({
  maxBytes: 64 * 1024,
  objective: 1000,
  phase: 80,
  nextAction: 1000,
  listItem: 500,
  scopeItems: 30,
  decisionItems: 50,
  selectedContextItems: 50,
  artifactItems: 200,
  validationItems: 100,
  blockerItems: 30,
  exitCriteriaItems: 50
});

const SESSION_ID = /^[a-z0-9][a-z0-9-]{7,79}$/;
const SESSION_STATUSES = new Set(["active", "paused", "completed", "abandoned"]);
const CANDIDATE_STATUSES = new Set(["proposed", "accepted", "rejected", "promoted", "superseded"]);
const CANDIDATE_TRANSITIONS = new Map([
  ["proposed", new Set(["accepted", "rejected", "superseded"])],
  ["accepted", new Set(["promoted", "rejected", "superseded"])],
  ["rejected", new Set()],
  ["promoted", new Set()],
  ["superseded", new Set()]
]);
const MANIFEST_FIELDS = new Set([
  "$schema", "version", "id", "resumable", "status", "revision", "createdAt",
  "updatedAt", "git", "handoff", "selectedContext", "artifacts", "candidates"
]);
const ARRAY_FIELDS = [
  ["scope", "Scope"],
  ["decisions", "Verified decisions"],
  ["selectedContext", "Selected context"],
  ["artifacts", "Artifacts"],
  ["validation", "Validation"],
  ["blockers", "Blockers"],
  ["exitCriteria", "Exit criteria"]
];
const HANDOFF_FIELDS = new Set(["objective", "scope", "phase", "decisions", "selectedContext", "artifacts", "validation", "blockers", "nextAction", "exitCriteria"]);
const HANDOFF_LIST_LIMITS = {
  scope: SESSION_HANDOFF_LIMITS.scopeItems,
  decisions: SESSION_HANDOFF_LIMITS.decisionItems,
  selectedContext: SESSION_HANDOFF_LIMITS.selectedContextItems,
  artifacts: SESSION_HANDOFF_LIMITS.artifactItems,
  validation: SESSION_HANDOFF_LIMITS.validationItems,
  blockers: SESSION_HANDOFF_LIMITS.blockerItems,
  exitCriteria: SESSION_HANDOFF_LIMITS.exitCriteriaItems
};

const slash = (value) => value.split(path.sep).join("/");
const digest = sha256;
const nowIso = () => new Date().toISOString();
const cleanLine = (value) => String(value).replace(/[\r\n]+/g, " ").trim();
const cleanScalar = (value) => cleanLine(value).replace(/^#{1,6}\s*/, "").trim();
const bulletList = (items) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- None.";

const boundedScalar = (value, field, maximum, fallback = "") => {
  if (value === undefined || value === null) value = fallback;
  if (typeof value !== "string") throw new Error(`Session ${field} must be a string`);
  const normalized = cleanScalar(value);
  if (normalized.length > maximum) throw new Error(`Session ${field} exceeds ${maximum} characters`);
  return normalized;
};

const boundedList = (value, field) => {
  if (value === undefined || value === null) value = [];
  if (!Array.isArray(value)) throw new Error(`Session ${field} must be an array`);
  const maximum = HANDOFF_LIST_LIMITS[field];
  if (value.length > maximum) throw new Error(`Session ${field} exceeds ${maximum} items`);
  const normalized = value.map((item, index) => {
    if (typeof item !== "string") throw new Error(`Session ${field}[${index}] must be a string`);
    const line = cleanLine(item);
    if (line.length > SESSION_HANDOFF_LIMITS.listItem) {
      throw new Error(`Session ${field}[${index}] exceeds ${SESSION_HANDOFF_LIMITS.listItem} characters`);
    }
    return line;
  }).filter(Boolean);
  return [...new Set(normalized)];
};

const assertHandoffSize = (content) => {
  const bytes = Buffer.byteLength(String(content), "utf8");
  if (bytes > SESSION_HANDOFF_LIMITS.maxBytes) {
    throw new Error(`Session handoff exceeds ${SESSION_HANDOFF_LIMITS.maxBytes} UTF-8 bytes`);
  }
};

export const createSessionId = (date = new Date()) => {
  const compact = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase();
  return `${compact}-${randomBytes(4).toString("hex")}`;
};

const sessionPaths = (root, id) => {
  if (!SESSION_ID.test(id)) throw new Error(`Invalid resumable session id: ${id}`);
  const projectRoot = path.resolve(root);
  const dataRoot = path.join(projectRoot, ".codex-agent");
  const sessionsRoot = path.join(dataRoot, "sessions");
  const directory = path.join(sessionsRoot, id);
  assertInside(projectRoot, directory, "session path");
  assertNoSymlink(projectRoot, directory);
  return {
    projectRoot,
    dataRoot,
    sessionsRoot,
    directory,
    manifest: path.join(directory, "manifest.json"),
    handoff: path.join(directory, "handoff.md"),
    candidates: path.join(directory, "candidates"),
    locks: path.join(dataRoot, ".locks"),
    lock: path.join(dataRoot, ".locks", `session-${id}.lock`),
    transactions: path.join(dataRoot, ".transactions"),
    transaction: path.join(dataRoot, ".transactions", `session-${id}`)
  };
};

const runGit = (root, args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
};

const WORKTREE_PATHSPEC = [
  ".",
  ":(exclude).codex-agent/sessions/**",
  ":(exclude).codex-agent/backups/**",
  ":(exclude).codex-agent/.locks/**",
  ":(exclude).codex-agent/.transactions/**",
  ":(exclude).codex-agent/analysis.json"
];

const worktreeFingerprint = (root) => {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...WORKTREE_PATHSPEC], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) return null;
  const status = result.stdout;
  const tokens = status.split("\0").filter(Boolean);
  const changedPaths = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const record = tokens[index];
    const statusCode = record.slice(0, 2);
    changedPaths.push(record.slice(3));
    if (/[RC]/.test(statusCode)) changedPaths.push(tokens[++index]);
  }

  const hash = createHash("sha256");
  hash.update(`status\0${status}\0`);
  for (const relativePath of [...new Set(changedPaths)].sort()) {
    if (!relativePath) continue;
    const target = path.resolve(root, relativePath);
    assertInside(root, target, "Git worktree path");
    let stat;
    try { stat = fs.lstatSync(target); }
    catch (error) {
      if (error?.code === "ENOENT") {
        hash.update(`missing\0${relativePath}\0`);
        continue;
      }
      throw error;
    }
    hash.update(`path\0${relativePath}\0mode\0${stat.mode.toString(8)}\0`);
    if (stat.isSymbolicLink()) hash.update(`symlink\0${fs.readlinkSync(target)}\0`);
    else if (stat.isFile()) hash.update(`file\0${sha256(fs.readFileSync(target))}\0`);
    else hash.update(`type\0${stat.isDirectory() ? "directory" : "other"}\0mtime\0${stat.mtimeMs}\0size\0${stat.size}\0`);
  }
  return hash.digest("hex");
};

export const captureSessionGitState = (root) => {
  const projectRoot = path.resolve(root);
  const head = runGit(projectRoot, ["rev-parse", "HEAD"]);
  const branch = runGit(projectRoot, ["branch", "--show-current"]);
  return {
    branch: branch || null,
    head: /^[0-9a-f]{40}$/.test(head ?? "") ? head : null,
    worktreeHash: worktreeFingerprint(projectRoot)
  };
};

const repositoryFileDigest = (root, relativePath, { required }) => {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`Session file path must be repository-relative: ${relativePath}`);
  }
  const projectRoot = path.resolve(root);
  const target = path.resolve(projectRoot, relativePath);
  assertInside(projectRoot, target, "session file path");
  assertNoSymlink(projectRoot, target);
  if (!fs.existsSync(target)) {
    if (required) throw new Error(`Session file path does not exist: ${relativePath}`);
    return { path: slash(path.relative(projectRoot, target)), sha256: null };
  }
  if (!fs.statSync(target).isFile()) throw new Error(`Session file path is not a file: ${relativePath}`);
  return { path: slash(path.relative(projectRoot, target)), sha256: digest(fs.readFileSync(target)) };
};

const normalizeHandoff = (state) => {
  const normalized = {
    objective: boundedScalar(state.objective, "objective", SESSION_HANDOFF_LIMITS.objective),
    scope: boundedList(state.scope, "scope"),
    phase: boundedScalar(state.phase, "phase", SESSION_HANDOFF_LIMITS.phase, "discovery"),
    decisions: boundedList(state.decisions, "decisions"),
    selectedContext: boundedList(state.selectedContext, "selectedContext"),
    artifacts: boundedList(state.artifacts, "artifacts"),
    validation: boundedList(state.validation, "validation"),
    blockers: boundedList(state.blockers, "blockers"),
    nextAction: boundedScalar(state.nextAction, "nextAction", SESSION_HANDOFF_LIMITS.nextAction),
    exitCriteria: boundedList(state.exitCriteria, "exitCriteria")
  };
  if (normalized.objective.length < 5) throw new Error("Session objective must contain at least 5 characters");
  if (!normalized.phase) throw new Error("Session phase is required");
  if (containsSensitiveContent(JSON.stringify(normalized))) {
    throw new Error("Session handoff appears to contain a secret or credential");
  }
  return normalized;
};

export const renderSessionHandoff = (state) => {
  const normalized = normalizeHandoff(state);
  const sections = [
    SESSION_HANDOFF_MARKER,
    "# Resumable session handoff",
    "",
    "## Objective",
    "",
    normalized.objective,
    "",
    "## Phase",
    "",
    normalized.phase,
    ""
  ];
  for (const [field, heading] of ARRAY_FIELDS) {
    sections.push(`## ${heading}`, "", bulletList(normalized[field]), "");
  }
  sections.push("## Next action", "", normalized.nextAction || "None.", "");
  const content = sections.join("\n");
  assertHandoffSize(content);
  return content;
};

const sectionValue = (content, heading) => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.match(new RegExp(`^## ${escaped}\\n\\n([\\s\\S]*?)(?=\\n## |\\s*$)`, "m"))?.[1]?.trim() ?? "";
};

const parseBullets = (value) => value
  .split("\n")
  .map((line) => line.match(/^-\s+(.+)$/)?.[1]?.trim())
  .filter((item) => item && item !== "None.");

export const parseSessionHandoff = (content) => {
  const text = String(content);
  assertHandoffSize(text);
  if (!text.startsWith(`${SESSION_HANDOFF_MARKER}\n`)) throw new Error("Invalid session handoff marker");
  const state = {
    objective: sectionValue(text, "Objective"),
    phase: sectionValue(text, "Phase"),
    nextAction: sectionValue(text, "Next action")
  };
  for (const [field, heading] of ARRAY_FIELDS) state[field] = parseBullets(sectionValue(text, heading));
  if (state.nextAction === "None.") state.nextAction = "";
  return normalizeHandoff(state);
};

const validDigest = (value, nullable = false) => (nullable && value === null) || /^[0-9a-f]{64}$/.test(value ?? "");
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const portableRelativePath = (value) => typeof value === "string" && value.length > 0 && value.length <= 500
  && !value.includes("\\") && !path.posix.isAbsolute(value) && path.posix.normalize(value) === value
  && value !== "." && value !== ".." && !value.startsWith("../");
const validFileEntry = (entry, { nullableHash }) => entry && typeof entry === "object" && !Array.isArray(entry)
  && Object.keys(entry).every((field) => ["path", "sha256"].includes(field))
  && portableRelativePath(entry.path)
  && validDigest(entry.sha256, nullableHash);

export const validateSessionManifest = (manifest) => {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  const extras = Object.keys(manifest).filter((field) => !MANIFEST_FIELDS.has(field));
  if (extras.length) errors.push(`unsupported manifest fields: ${extras.join(", ")}`);
  if (manifest.$schema !== undefined && typeof manifest.$schema !== "string") errors.push("manifest $schema must be a string");
  if (manifest.version !== 1) errors.push("manifest version must be 1");
  if (!SESSION_ID.test(manifest.id ?? "")) errors.push("manifest id is invalid");
  if (manifest.resumable !== true) errors.push("manifest resumable must be true");
  if (!SESSION_STATUSES.has(manifest.status)) errors.push("manifest status is invalid");
  if (!Number.isInteger(manifest.revision) || manifest.revision < 1) errors.push("manifest revision is invalid");
  if (!validDate(manifest.createdAt) || !validDate(manifest.updatedAt)) errors.push("manifest timestamps are invalid");
  if (!manifest.git || typeof manifest.git !== "object" || Array.isArray(manifest.git)
    || Object.keys(manifest.git).some((field) => !["branch", "head", "worktreeHash"].includes(field))
    || (manifest.git.branch !== null && typeof manifest.git.branch !== "string")
    || (manifest.git.head !== null && !/^[0-9a-f]{40}$/.test(manifest.git.head ?? ""))
    || !validDigest(manifest.git.worktreeHash, true)) errors.push("manifest git state is invalid");
  if (!validFileEntry(manifest.handoff, { nullableHash: false }) || manifest.handoff?.path !== "handoff.md") {
    errors.push("manifest handoff entry is invalid");
  }
  for (const field of ["selectedContext", "artifacts"]) {
    if (!Array.isArray(manifest[field])) errors.push(`manifest ${field} must be an array`);
    else {
      const maximum = field === "selectedContext" ? 50 : 200;
      if (manifest[field].length > maximum) errors.push(`manifest ${field} exceeds ${maximum} entries`);
      for (const [index, entry] of manifest[field].entries()) {
        if (!validFileEntry(entry, { nullableHash: field === "artifacts" })) errors.push(`manifest ${field}[${index}] is invalid`);
      }
    }
  }
  if (!Array.isArray(manifest.candidates)) errors.push("manifest candidates must be an array");
  else {
    if (manifest.candidates.length > 100) errors.push("manifest candidates exceeds 100 entries");
    const ids = new Set();
    const paths = new Set();
    for (const [index, entry] of manifest.candidates.entries()) {
      const fields = entry && typeof entry === "object" ? Object.keys(entry) : [];
      if (!entry || fields.some((field) => !["id", "path", "sha256", "status"].includes(field))
        || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(entry?.id ?? "")
        || entry?.path !== `candidates/${entry?.id}.md`
        || !validDigest(entry?.sha256)
        || !CANDIDATE_STATUSES.has(entry?.status)) errors.push(`manifest candidates[${index}] is invalid`);
      if (ids.has(entry?.id)) errors.push(`duplicate candidate id: ${entry?.id}`);
      if (paths.has(entry?.path)) errors.push(`duplicate candidate path: ${entry?.path}`);
      ids.add(entry?.id);
      paths.add(entry?.path);
    }
  }
  if (containsSensitiveContent(JSON.stringify(manifest))) errors.push("manifest appears to contain a secret or credential");
  return { ok: errors.length === 0, errors };
};

const readManifest = (file) => {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`Invalid session manifest: ${error instanceof Error ? error.message : String(error)}`); }
  const validation = validateSessionManifest(manifest);
  if (!validation.ok) throw new Error(`Invalid session manifest:\n- ${validation.errors.join("\n- ")}`);
  return manifest;
};

const sessionTransactionJournal = (paths) => path.join(paths.transaction, "journal.json");
const transactionFields = new Set(["version", "sessionId", "status", "files"]);
const transactionFileFields = new Set(["path", "staged", "backup", "existed", "newSha256", "oldSha256"]);

const parseSessionTransaction = (paths) => {
  const journalPath = sessionTransactionJournal(paths);
  if (!fs.existsSync(journalPath)) return null;
  assertNoSymlink(paths.transaction, journalPath, "Session transaction journal");
  let journal;
  try { journal = JSON.parse(fs.readFileSync(journalPath, "utf8")); }
  catch (error) { throw new Error(`Invalid session transaction journal: ${error instanceof Error ? error.message : String(error)}`); }
  if (!journal || typeof journal !== "object" || Array.isArray(journal)
    || Object.keys(journal).some((field) => !transactionFields.has(field))
    || journal.version !== 1 || journal.sessionId !== path.basename(paths.directory)
    || !["prepared", "committed"].includes(journal.status)
    || !Array.isArray(journal.files) || journal.files.length < 2) {
    throw new Error("Invalid session transaction journal contract");
  }
  const seen = new Set();
  for (const [index, entry] of journal.files.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).some((field) => !transactionFileFields.has(field))
      || !portableRelativePath(entry.path) || !portableRelativePath(entry.staged)
      || (entry.backup !== null && !portableRelativePath(entry.backup))
      || typeof entry.existed !== "boolean" || !validDigest(entry.newSha256)
      || (entry.existed ? !validDigest(entry.oldSha256) || entry.backup === null : entry.oldSha256 !== null || entry.backup !== null)) {
      throw new Error(`Invalid session transaction file ${index}`);
    }
    const destination = path.resolve(paths.projectRoot, entry.path);
    assertInside(paths.directory, destination, `session transaction file ${index}`);
    if (seen.has(entry.path)) throw new Error(`Duplicate session transaction path: ${entry.path}`);
    seen.add(entry.path);
  }
  return journal;
};

const removeSessionTransaction = (paths) => {
  if (!fs.existsSync(paths.transaction)) return;
  assertNoSymlink(paths.projectRoot, paths.transaction, "Session transaction directory");
  fs.rmSync(paths.transaction, { recursive: true, force: true });
};

const recoverSessionTransaction = (paths) => {
  if (!fs.existsSync(paths.transaction)) return false;
  assertNoSymlink(paths.projectRoot, paths.transaction, "Session transaction directory");
  if (!fs.lstatSync(paths.transaction).isDirectory()) throw new Error("Session transaction path is not a directory");
  const journal = parseSessionTransaction(paths);
  if (!journal || journal.status === "committed") {
    removeSessionTransaction(paths);
    return true;
  }

  for (const [index, entry] of journal.files.entries()) {
    const destination = path.resolve(paths.projectRoot, entry.path);
    assertInside(paths.directory, destination, `session transaction file ${index}`);
    assertNoSymlink(paths.projectRoot, destination, `session transaction file ${index}`);
    if (!entry.existed) {
      if (fs.existsSync(destination)) {
        if (!fs.lstatSync(destination).isFile()) throw new Error(`Session transaction destination is not a file: ${entry.path}`);
        if (digest(fs.readFileSync(destination)) !== entry.newSha256) {
          throw new Error(`Session transaction destination changed after interruption: ${entry.path}`);
        }
        fs.unlinkSync(destination);
      }
      continue;
    }

    const backup = path.resolve(paths.transaction, entry.backup);
    assertInside(paths.transaction, backup, `session transaction backup ${index}`);
    assertNoSymlink(paths.transaction, backup, `session transaction backup ${index}`);
    if (!fs.existsSync(backup) || !fs.lstatSync(backup).isFile() || digest(fs.readFileSync(backup)) !== entry.oldSha256) {
      throw new Error(`Session transaction backup is missing or invalid: ${entry.path}`);
    }
    if (!fs.existsSync(destination) || !fs.lstatSync(destination).isFile()) {
      throw new Error(`Session transaction destination changed after interruption: ${entry.path}`);
    }
    const destinationHash = digest(fs.readFileSync(destination));
    if (destinationHash !== entry.oldSha256 && destinationHash !== entry.newSha256) {
      throw new Error(`Session transaction destination changed after interruption: ${entry.path}`);
    }
    if (destinationHash === entry.oldSha256) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    assertNoSymlink(paths.projectRoot, path.dirname(destination), `session transaction parent ${index}`);
    const temporary = `${destination}.recover-${process.pid}-${randomBytes(4).toString("hex")}`;
    try {
      fs.copyFileSync(backup, temporary, fs.constants.COPYFILE_EXCL);
      fs.renameSync(temporary, destination);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  removeSessionTransaction(paths);
  return true;
};

const processIsAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
};

const recoverStaleSessionLock = (paths) => {
  if (!fs.existsSync(paths.lock)) return;
  assertNoSymlink(paths.projectRoot, paths.lock, "Session lock");
  let token;
  try { token = fs.readFileSync(paths.lock, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  let owner;
  try { owner = JSON.parse(token); }
  catch { throw new Error(`Resumable session is locked: ${paths.directory}`); }
  if (!owner || owner.hostname !== os.hostname() || !Number.isInteger(owner.pid) || owner.pid < 1 || processIsAlive(owner.pid)) {
    throw new Error(`Resumable session is locked: ${paths.directory}`);
  }
  try {
    if (fs.readFileSync(paths.lock, "utf8") !== token) throw new Error(`Resumable session is locked: ${paths.directory}`);
    fs.unlinkSync(paths.lock);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
};

const withSessionLock = (paths, callback) => {
  fs.mkdirSync(paths.locks, { recursive: true });
  assertNoSymlink(paths.projectRoot, paths.locks);
  recoverStaleSessionLock(paths);
  let descriptor;
  const token = `${JSON.stringify({ pid: process.pid, hostname: os.hostname(), createdAt: nowIso(), nonce: randomBytes(16).toString("hex") })}\n`;
  try {
    descriptor = fs.openSync(paths.lock, "wx", 0o600);
    fs.writeFileSync(descriptor, token);
  } catch (error) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch { /* preserve acquisition error */ }
    if (descriptor !== undefined) try { fs.unlinkSync(paths.lock); } catch { /* preserve acquisition error */ }
    if (error?.code === "EEXIST") throw new Error(`Resumable session is locked: ${paths.directory}`);
    throw error;
  }
  try {
    recoverSessionTransaction(paths);
    return callback();
  }
  finally {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch { /* callback outcome remains authoritative */ }
    try {
      if (fs.readFileSync(paths.lock, "utf8") === token) fs.unlinkSync(paths.lock);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
};

const writeJournal = (paths, journal) => {
  const journalPath = sessionTransactionJournal(paths);
  const temporary = `${journalPath}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, journalPath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
};

const writePair = (paths, handoffContent, manifest, extraFiles = []) => {
  assertHandoffSize(handoffContent);
  const validation = validateSessionManifest(manifest);
  if (!validation.ok) throw new Error(`Invalid session manifest:\n- ${validation.errors.join("\n- ")}`);
  if (manifest.handoff.sha256 !== digest(handoffContent)) throw new Error("Session handoff content does not match manifest hash");
  fs.mkdirSync(paths.directory, { recursive: true });
  assertNoSymlink(paths.projectRoot, paths.directory);
  fs.mkdirSync(paths.transactions, { recursive: true });
  assertNoSymlink(paths.projectRoot, paths.transactions, "Session transaction parent");
  if (fs.existsSync(paths.transaction)) throw new Error(`Session transaction already exists: ${slash(path.relative(paths.projectRoot, paths.transaction))}`);
  fs.mkdirSync(path.join(paths.transaction, "staged"), { recursive: true });
  fs.mkdirSync(path.join(paths.transaction, "rollback"), { recursive: true });

  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const requested = [
    { destination: paths.handoff, content: handoffContent },
    ...extraFiles,
    { destination: paths.manifest, content: manifestContent }
  ];
  const seen = new Set();
  let journal;
  try {
    journal = {
      version: 1,
      sessionId: manifest.id,
      status: "prepared",
      files: requested.map((file, index) => {
        if (!file || typeof file !== "object" || !(typeof file.content === "string" || Buffer.isBuffer(file.content))) {
          throw new Error(`Invalid session transaction input ${index}`);
        }
        const destination = path.resolve(file.destination);
        assertInside(paths.directory, destination, `session transaction destination ${index}`);
        assertNoSymlink(paths.projectRoot, destination, `session transaction destination ${index}`);
        const relativePath = slash(path.relative(paths.projectRoot, destination));
        if (seen.has(relativePath)) throw new Error(`Duplicate session transaction path: ${relativePath}`);
        seen.add(relativePath);
        const staged = `staged/${String(index).padStart(3, "0")}.new`;
        const backup = `rollback/${String(index).padStart(3, "0")}.old`;
        const stagedPath = path.join(paths.transaction, ...staged.split("/"));
        fs.writeFileSync(stagedPath, file.content, { mode: 0o600 });
        const existed = fs.existsSync(destination);
        let oldSha256 = null;
        if (existed) {
          if (!fs.lstatSync(destination).isFile()) throw new Error(`Session transaction destination is not a file: ${relativePath}`);
          const oldContent = fs.readFileSync(destination);
          oldSha256 = digest(oldContent);
          fs.writeFileSync(path.join(paths.transaction, ...backup.split("/")), oldContent, { mode: 0o600 });
        }
        return {
          path: relativePath,
          staged,
          backup: existed ? backup : null,
          existed,
          newSha256: digest(file.content),
          oldSha256
        };
      })
    };
    writeJournal(paths, journal);
    for (const [index, entry] of journal.files.entries()) {
      const destination = path.resolve(paths.projectRoot, entry.path);
      const staged = path.resolve(paths.transaction, entry.staged);
      assertInside(paths.transaction, staged, `session transaction staged file ${index}`);
      assertNoSymlink(paths.transaction, staged, `session transaction staged file ${index}`);
      if (!fs.existsSync(staged) || !fs.lstatSync(staged).isFile() || digest(fs.readFileSync(staged)) !== entry.newSha256) {
        throw new Error(`Session transaction staged file is missing or invalid: ${entry.path}`);
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      assertNoSymlink(paths.projectRoot, path.dirname(destination), `session transaction parent ${index}`);
      fs.renameSync(staged, destination);
    }
    journal.status = "committed";
    writeJournal(paths, journal);
    removeSessionTransaction(paths);
  } catch (error) {
    try { recoverSessionTransaction(paths); }
    catch (recoveryError) {
      throw new Error(`Session transaction failed and recovery failed: ${error instanceof Error ? error.message : String(error)}; recovery: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`);
    }
    throw error;
  }
};

const buildManifestIndexes = (root, handoff, previous = {}) => ({
  selectedContext: handoff.selectedContext.map((item) => repositoryFileDigest(root, item, { required: true })),
  artifacts: handoff.artifacts.map((item) => repositoryFileDigest(root, item, { required: false })),
  candidates: previous.candidates ?? []
});

export const createResumableSession = ({ root, id = createSessionId(), status = "active", ...state }) => {
  if (!SESSION_STATUSES.has(status)) throw new Error(`Invalid session status: ${status}`);
  const unsupported = Object.keys(state).filter((field) => !HANDOFF_FIELDS.has(field));
  if (unsupported.length) throw new Error(`Unsupported session fields: ${unsupported.join(", ")}`);
  const paths = sessionPaths(root, id);
  const handoff = normalizeHandoff(state);
  const content = renderSessionHandoff(handoff);
  const createdAt = nowIso();
  const indexes = buildManifestIndexes(paths.projectRoot, handoff);
  const manifest = {
    version: 1,
    id,
    resumable: true,
    status,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    git: captureSessionGitState(paths.projectRoot),
    handoff: { path: "handoff.md", sha256: digest(content) },
    ...indexes
  };
  withSessionLock(paths, () => {
    if (fs.existsSync(paths.manifest) || fs.existsSync(paths.handoff)) throw new Error(`Resumable session already exists: ${id}`);
    writePair(paths, content, manifest);
  });
  return { root: paths.projectRoot, directory: slash(path.relative(paths.projectRoot, paths.directory)), manifest, handoff };
};

export const readResumableSession = ({ root, id, includeCandidates = false }) => {
  const paths = sessionPaths(root, id);
  assertNoSymlink(paths.projectRoot, paths.manifest, "Session manifest");
  assertNoSymlink(paths.projectRoot, paths.handoff, "Session handoff");
  if (!fs.existsSync(paths.manifest) || !fs.existsSync(paths.handoff)) throw new Error(`Resumable session not found: ${id}`);
  const manifest = readManifest(paths.manifest);
  if (manifest.id !== id) throw new Error(`Session manifest id mismatch: ${manifest.id}`);
  const handoffStat = fs.statSync(paths.handoff);
  if (!handoffStat.isFile()) throw new Error("Session handoff is not a file");
  if (handoffStat.size > SESSION_HANDOFF_LIMITS.maxBytes) {
    throw new Error(`Session handoff exceeds ${SESSION_HANDOFF_LIMITS.maxBytes} UTF-8 bytes`);
  }
  const content = fs.readFileSync(paths.handoff, "utf8");
  if (digest(content) !== manifest.handoff.sha256) throw new Error("Session handoff hash does not match manifest");
  const handoff = parseSessionHandoff(content);
  const candidates = includeCandidates ? manifest.candidates.map((item) => {
    const candidatePath = path.resolve(paths.directory, item.path);
    assertInside(paths.directory, candidatePath, "candidate path");
    assertNoSymlink(paths.directory, candidatePath);
    if (!fs.existsSync(candidatePath)) throw new Error(`Session candidate is missing: ${item.path}`);
    if (!fs.statSync(candidatePath).isFile()) throw new Error(`Session candidate is not a file: ${item.path}`);
    const candidateContent = fs.readFileSync(candidatePath, "utf8");
    if (digest(candidateContent) !== item.sha256) throw new Error(`Candidate hash mismatch: ${item.path}`);
    return { ...item, candidate: parseContextCandidate(candidateContent, { root: paths.projectRoot }) };
  }) : [];
  return { root: paths.projectRoot, directory: paths.directory, manifest, handoff, candidates };
};

export const updateResumableSession = ({ root, id, expectedRevision, patch }) => {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Session patch must be an object");
  const unsupported = Object.keys(patch).filter((field) => field !== "status" && !HANDOFF_FIELDS.has(field));
  if (unsupported.length) throw new Error(`Unsupported session patch fields: ${unsupported.join(", ")}`);
  const paths = sessionPaths(root, id);
  return withSessionLock(paths, () => {
    const current = readResumableSession({ root, id });
    if (current.manifest.revision !== expectedRevision) {
      throw new Error(`Session revision mismatch: expected ${expectedRevision}, found ${current.manifest.revision}`);
    }
    const status = patch.status ?? current.manifest.status;
    if (!SESSION_STATUSES.has(status)) throw new Error(`Invalid session status: ${status}`);
    const handoff = normalizeHandoff({ ...current.handoff, ...patch });
    const content = renderSessionHandoff(handoff);
    const indexes = buildManifestIndexes(paths.projectRoot, handoff, current.manifest);
    const manifest = {
      ...current.manifest,
      status,
      revision: current.manifest.revision + 1,
      updatedAt: nowIso(),
      git: captureSessionGitState(paths.projectRoot),
      handoff: { path: "handoff.md", sha256: digest(content) },
      ...indexes
    };
    writePair(paths, content, manifest);
    return { root: paths.projectRoot, directory: slash(path.relative(paths.projectRoot, paths.directory)), manifest, handoff };
  });
};

export const addSessionContextCandidate = ({ root, id, expectedRevision, candidate }) => {
  const paths = sessionPaths(root, id);
  return withSessionLock(paths, () => {
    const current = readResumableSession({ root, id });
    if (current.manifest.revision !== expectedRevision) {
      throw new Error(`Session revision mismatch: expected ${expectedRevision}, found ${current.manifest.revision}`);
    }
    const content = renderContextCandidate(candidate, { root: paths.projectRoot, sourceSessionId: id });
    const parsed = parseContextCandidate(content, { root: paths.projectRoot });
    const relativePath = `candidates/${parsed.metadata.id}.md`;
    const destination = path.join(paths.directory, relativePath);
    assertInside(paths.directory, destination, "candidate path");
    assertNoSymlink(paths.directory, destination);
    if (fs.existsSync(destination)) throw new Error(`Session candidate already exists: ${parsed.metadata.id}`);

    const candidateEntry = { id: parsed.metadata.id, path: relativePath, sha256: digest(content), status: "proposed" };
    const manifest = {
      ...current.manifest,
      revision: current.manifest.revision + 1,
      updatedAt: nowIso(),
      candidates: [...current.manifest.candidates, candidateEntry]
    };
    writePair(paths, fs.readFileSync(paths.handoff, "utf8"), manifest, [{ destination, content }]);
    return { manifest, candidate: candidateEntry, path: slash(path.relative(paths.projectRoot, destination)) };
  });
};

export const setSessionCandidateStatus = ({ root, id, candidateId, status, expectedRevision, expectedCandidateHash }) => {
  if (!CANDIDATE_STATUSES.has(status)) throw new Error(`Invalid candidate status: ${status}`);
  const paths = sessionPaths(root, id);
  return withSessionLock(paths, () => {
    const current = readResumableSession({ root, id, includeCandidates: true });
    if (current.manifest.revision !== expectedRevision) {
      throw new Error(`Session revision mismatch: expected ${expectedRevision}, found ${current.manifest.revision}`);
    }
    let found = false;
    const candidates = current.manifest.candidates.map((item) => {
      if (item.id !== candidateId) return item;
      found = true;
      if (!expectedCandidateHash || expectedCandidateHash !== item.sha256) {
        throw new Error(`Candidate hash mismatch for status transition: ${candidateId}`);
      }
      if (!CANDIDATE_TRANSITIONS.get(item.status)?.has(status)) {
        throw new Error(`Invalid candidate status transition: ${item.status} -> ${status}`);
      }
      return { ...item, status };
    });
    if (!found) throw new Error(`Session candidate not found: ${candidateId}`);
    const manifest = {
      ...current.manifest,
      revision: current.manifest.revision + 1,
      updatedAt: nowIso(),
      candidates
    };
    writePair(paths, fs.readFileSync(paths.handoff, "utf8"), manifest);
    return { manifest };
  });
};

const verifyDigestEntries = (root, entries, base = root) => entries.flatMap((item) => {
  const target = path.resolve(base, item.path);
  try {
    assertInside(base, target, "session manifest path");
    assertNoSymlink(base, target);
    if (!fs.existsSync(target)) return [{ path: item.path, reason: "missing" }];
    const actual = digest(fs.readFileSync(target));
    return actual === item.sha256 ? [] : [{ path: item.path, reason: "hash-changed", expected: item.sha256, actual }];
  } catch (error) {
    return [{ path: item.path, reason: error instanceof Error ? error.message : String(error) }];
  }
});

export const verifyResumableSession = ({ root, id }) => {
  const current = readResumableSession({ root, id });
  const git = captureSessionGitState(current.root);
  const mismatches = [];
  for (const field of ["branch", "head", "worktreeHash"]) {
    if (git[field] !== current.manifest.git[field]) {
      mismatches.push({ kind: "git", field, expected: current.manifest.git[field], actual: git[field] });
    }
  }
  mismatches.push(...verifyDigestEntries(current.root, current.manifest.selectedContext).map((item) => ({ kind: "selected-context", ...item })));
  for (const item of current.manifest.artifacts) {
    const target = path.resolve(current.root, item.path);
    if (item.sha256 === null && !fs.existsSync(target)) continue;
    mismatches.push(...verifyDigestEntries(current.root, [item]).map((entry) => ({ kind: "artifact", ...entry })));
  }
  mismatches.push(...verifyDigestEntries(current.root, current.manifest.candidates, current.directory).map((item) => ({ kind: "candidate", ...item })));
  return { ok: mismatches.length === 0, id, revision: current.manifest.revision, mismatches, currentGit: git };
};
