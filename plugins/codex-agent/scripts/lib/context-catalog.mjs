import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertValidContextIndex } from "./context-index.mjs";
import { withContextLock } from "./context-transaction.mjs";
import {
  assertInside,
  assertNoSymlink,
  assertSafeMarkdownContent,
  copyTreeSafely,
  ensureDirectory,
  listTreeFiles,
  resolveProjectRoot,
  safeRelativePath,
  sha256,
  slash
} from "./safe-files.mjs";

export const CANONICAL_CONTEXT_PATH = ".codex-agent/context";
export const LEGACY_CONTEXT_PATH = ".agents/context";
export const CONTEXT_CATALOG_STATES = Object.freeze([
  "none",
  "legacy-only",
  "canonical-only",
  "both-identical",
  "both-divergent",
  "invalid"
]);

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
};

const semanticIndex = (index) => {
  const normalized = stableValue(index);
  normalized.entries = [...index.entries].map((entry) => ({
    ...stableValue(entry),
    ...(Array.isArray(entry.tags) ? { tags: [...entry.tags].sort() } : {})
  })).sort((left, right) => String(left.path).localeCompare(String(right.path)) || String(left.id).localeCompare(String(right.id)));
  return normalized;
};

const inspectCatalog = ({ projectRoot, contextRoot, kind }) => {
  const relativeRoot = slash(path.relative(projectRoot, contextRoot));
  const result = {
    kind,
    path: contextRoot,
    relativePath: relativeRoot,
    exists: false,
    valid: true,
    errors: [],
    index: null,
    hash: null,
    files: []
  };
  try {
    assertNoSymlink(projectRoot, contextRoot, `${kind} context root`);
    if (!fs.existsSync(contextRoot)) return result;
    result.exists = true;
    if (!fs.lstatSync(contextRoot).isDirectory()) throw new Error(`${relativeRoot} is not a directory`);
    const files = listTreeFiles(contextRoot);
    const unsupported = files.find((file) => file.relative !== "index.json" && !file.relative.toLowerCase().endsWith(".md"));
    if (unsupported) throw new Error(`${relativeRoot} contains an unsupported file: ${unsupported.relative}`);
    for (const file of files.filter((entry) => entry.relative.toLowerCase().endsWith(".md"))) {
      assertSafeMarkdownContent(fs.readFileSync(file.absolute, "utf8"), `Context Markdown ${relativeRoot}/${file.relative}`);
    }
    const indexFile = files.find((file) => file.relative === "index.json");
    if (!indexFile) throw new Error(`${relativeRoot}/index.json is missing`);
    let index;
    try { index = JSON.parse(fs.readFileSync(indexFile.absolute, "utf8")); }
    catch (error) { throw new Error(`${relativeRoot}/index.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
    assertValidContextIndex(index, { root: projectRoot, contextRoot });

    const hash = crypto.createHash("sha256");
    hash.update(`index\0${JSON.stringify(semanticIndex(index))}\0`);
    for (const file of files.filter((item) => item.relative !== "index.json").sort((left, right) => left.relative.localeCompare(right.relative))) {
      hash.update(`file\0${file.relative}\0${sha256(fs.readFileSync(file.absolute))}\0`);
    }
    result.index = index;
    result.files = files.map((file) => file.relative);
    result.hash = hash.digest("hex");
    return result;
  } catch (error) {
    result.valid = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
};

export const resolveContextCatalog = ({ root }) => {
  const projectRoot = resolveProjectRoot(root);
  const canonical = inspectCatalog({ projectRoot, contextRoot: path.join(projectRoot, ...CANONICAL_CONTEXT_PATH.split("/")), kind: "canonical" });
  const legacy = inspectCatalog({ projectRoot, contextRoot: path.join(projectRoot, ...LEGACY_CONTEXT_PATH.split("/")), kind: "legacy" });
  let state;
  if (!canonical.valid || !legacy.valid) state = "invalid";
  else if (!canonical.exists && !legacy.exists) state = "none";
  else if (!canonical.exists) state = "legacy-only";
  else if (!legacy.exists) state = "canonical-only";
  else if (canonical.hash === legacy.hash) state = "both-identical";
  else state = "both-divergent";

  const warnings = [];
  if (state === "legacy-only") warnings.push("Using read-only legacy context from .agents/context; migrate it to .codex-agent/context before writing.");
  if (state === "both-identical") warnings.push("Both context catalogs are identical; reads use .codex-agent/context, but migration must remove the legacy catalog before writing.");
  if (state === "both-divergent") warnings.push("Canonical and legacy context catalogs diverge; resolve the conflict before reading or writing context.");
  if (state === "invalid") warnings.push("A context catalog is invalid; repair or migrate it before reading or writing context.");
  return {
    root: projectRoot,
    state,
    warnings,
    errors: [...canonical.errors, ...legacy.errors],
    canonical,
    legacy
  };
};

const catalogError = (resolution, action) => {
  const details = resolution.errors.length ? `\n- ${resolution.errors.join("\n- ")}` : "";
  return new Error(`Cannot ${action} context while catalog state is ${resolution.state}. Run the approved context catalog migration or resolve the catalog conflict first.${details}`);
};

export const getReadableContextCatalog = ({ root }) => {
  const resolution = resolveContextCatalog({ root });
  if (["invalid", "both-divergent"].includes(resolution.state)) throw catalogError(resolution, "read");
  const selected = resolution.state === "legacy-only" ? resolution.legacy
    : ["canonical-only", "both-identical"].includes(resolution.state) ? resolution.canonical
      : null;
  return {
    ...resolution,
    source: selected?.kind ?? null,
    contextRoot: selected?.path ?? resolution.canonical.path,
    indexPath: selected ? path.join(selected.path, "index.json") : path.join(resolution.canonical.path, "index.json"),
    index: selected?.index ?? null,
    hash: selected?.hash ?? null
  };
};

export const assertWritableContextCatalog = ({ root }) => {
  const resolution = resolveContextCatalog({ root });
  if (!["none", "canonical-only"].includes(resolution.state)) throw catalogError(resolution, "write");
  return {
    ...resolution,
    contextRoot: resolution.canonical.path,
    indexPath: path.join(resolution.canonical.path, "index.json"),
    index: resolution.canonical.index ?? { version: 1, entries: [] }
  };
};

const publicMigrationResult = ({ resolution, apply, changes, applied = false, backedUp = [] }) => ({
  root: resolution.root,
  mode: apply ? "apply" : "preview",
  state: resolution.state,
  changes,
  warnings: resolution.warnings,
  sourceHash: resolution.legacy.hash,
  backedUp,
  applied
});

const planMigration = (resolution, apply) => {
  if (["invalid", "both-divergent"].includes(resolution.state)) throw catalogError(resolution, "migrate");
  if (["none", "canonical-only"].includes(resolution.state)) return publicMigrationResult({ resolution, apply, changes: [] });
  return publicMigrationResult({
    resolution,
    apply,
    changes: [
      ...(resolution.state === "legacy-only" ? [{ action: "promote", from: LEGACY_CONTEXT_PATH, to: CANONICAL_CONTEXT_PATH }] : []),
      { action: "move-to-backup", from: LEGACY_CONTEXT_PATH, to: ".codex-agent/backups/<timestamp>/.agents/context" }
    ]
  });
};

const applyMigration = ({
  root,
  expectedState,
  expectedHash = null,
  backupPath = null,
  transactionId = null,
  lock = true
}) => {
  const operation = () => {
    const resolution = resolveContextCatalog({ root });
    if (resolution.state !== expectedState) throw new Error(`Context catalog changed during migration: expected ${expectedState}, found ${resolution.state}`);
    if (expectedHash !== null && resolution.legacy.hash !== expectedHash) throw new Error("Context catalog changed after preview; review a fresh migration plan");
    if (!["legacy-only", "both-identical"].includes(resolution.state)) return planMigration(resolution, true);

    const codexAgentRoot = ensureDirectory(resolution.root, path.join(resolution.root, ".codex-agent"), "Codex Agent state directory");
    const transactionDirectory = ensureDirectory(resolution.root, path.join(codexAgentRoot, ".transactions"), "Context transaction directory");
    const txid = transactionId ?? `catalog-${process.pid}-${Date.now()}-${crypto.randomUUID()}`;
    if (!/^catalog-[a-zA-Z0-9-]+$/.test(txid)) throw new Error("Invalid context catalog transaction id");
    const txroot = path.join(transactionDirectory, txid);
    const backupRelative = backupPath === null
      ? `.codex-agent/backups/${timestamp()}/.agents/context`
      : safeRelativePath(backupPath, "Context migration backup path");
    if (!/^\.codex-agent\/backups\/[^/]+\/\.agents\/context$/.test(backupRelative)) {
      throw new Error("Context migration backup path must use .codex-agent/backups/<id>/.agents/context");
    }
    const backupRoot = path.join(resolution.root, ...backupRelative.split("/"));
    assertInside(resolution.root, backupRoot, "Context migration backup");
    assertNoSymlink(resolution.root, backupRoot, "Context migration backup");
    if (fs.existsSync(backupRoot)) throw new Error(`Context migration backup already exists: ${backupRelative}`);
    fs.mkdirSync(txroot, { recursive: false });
    let cleanupTransaction = true;
    try {
      if (resolution.state === "legacy-only") {
        const staged = path.join(txroot, "context");
        copyTreeSafely(resolution.legacy.path, staged, { root: resolution.root });
        const stagedCatalog = inspectCatalog({ projectRoot: resolution.root, contextRoot: staged, kind: "staged" });
        if (!stagedCatalog.valid || stagedCatalog.hash !== resolution.legacy.hash) {
          throw new Error(`Staged context catalog verification failed${stagedCatalog.errors.length ? `: ${stagedCatalog.errors.join("; ")}` : ""}`);
        }
        assertNoSymlink(resolution.root, resolution.canonical.path, "Canonical context root");
        fs.renameSync(staged, resolution.canonical.path);
        const promotedCatalog = inspectCatalog({ projectRoot: resolution.root, contextRoot: resolution.canonical.path, kind: "canonical" });
        if (!promotedCatalog.valid || promotedCatalog.hash !== resolution.legacy.hash) throw new Error("Promoted context catalog verification failed");
      }

      assertNoSymlink(resolution.root, resolution.legacy.path, "Legacy context root");
      ensureDirectory(resolution.root, path.dirname(backupRoot), "Legacy context backup parent");
      fs.renameSync(resolution.legacy.path, backupRoot);
      const finalResolution = resolveContextCatalog({ root: resolution.root });
      if (finalResolution.state !== "canonical-only") throw new Error(`Context migration did not reach canonical-only state: ${finalResolution.state}`);
      return publicMigrationResult({
        resolution,
        apply: true,
        changes: planMigration(resolution, true).changes,
        applied: true,
        backedUp: [slash(path.relative(resolution.root, backupRoot))]
      });
    } catch (error) {
      let restoreError = null;
      try {
        if (!fs.existsSync(resolution.legacy.path) && fs.existsSync(backupRoot)) {
          ensureDirectory(resolution.root, path.dirname(resolution.legacy.path), "Legacy context parent");
          fs.renameSync(backupRoot, resolution.legacy.path);
        }
      } catch (rollbackError) {
        restoreError = rollbackError;
      }
      if (restoreError) {
        cleanupTransaction = false;
        throw new Error(`Context migration failed and legacy restore failed: ${error instanceof Error ? error.message : String(error)}; rollback: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
      }

      try {
        if (resolution.state === "legacy-only" && fs.existsSync(resolution.canonical.path)) {
          const failedCanonical = path.join(txroot, "canonical-rollback");
          fs.renameSync(resolution.canonical.path, failedCanonical);
        }
      } catch (rollbackError) {
        cleanupTransaction = false;
        throw new Error(`Context migration failed and canonical rollback failed after restoring legacy: ${error instanceof Error ? error.message : String(error)}; rollback: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
      throw error;
    } finally {
      if (cleanupTransaction) fs.rmSync(txroot, { recursive: true, force: true });
    }
  };
  return lock ? withContextLock({ root }, operation) : operation();
};

export const migrateContextCatalog = ({
  root,
  apply = false,
  expectedHash = null,
  backupPath = null,
  transactionId = null,
  lock = true
}) => {
  const resolution = resolveContextCatalog({ root });
  const preview = planMigration(resolution, apply);
  if (!apply || !["legacy-only", "both-identical"].includes(resolution.state)) return preview;
  return applyMigration({
    root: resolution.root,
    expectedState: resolution.state,
    expectedHash,
    backupPath,
    transactionId,
    lock
  });
};

export const inspectContextCatalogPath = ({ root, relativePath, kind = "recovery" }) => {
  const projectRoot = resolveProjectRoot(root);
  const normalized = safeRelativePath(relativePath, "Context catalog inspection path");
  const contextRoot = path.join(projectRoot, ...normalized.split("/"));
  assertInside(projectRoot, contextRoot, "Context catalog inspection path");
  return inspectCatalog({ projectRoot, contextRoot, kind });
};

const applyMigrationRollback = ({ root, migration }) => {
  if (!migration?.applied || !["legacy-only", "both-identical"].includes(migration.state)
    || migration.backedUp?.length !== 1 || !/^[0-9a-f]{64}$/.test(migration.sourceHash ?? "")) {
    throw new Error("Invalid context migration rollback contract");
  }
  const resolution = resolveContextCatalog({ root });
  if (resolution.state !== "canonical-only" || resolution.canonical.hash !== migration.sourceHash) {
    throw new Error(`Cannot roll back context migration from catalog state ${resolution.state}`);
  }
  const backupRelative = safeRelativePath(migration.backedUp[0], "Context migration backup path");
  const backupRoot = path.join(resolution.root, ...backupRelative.split("/"));
  assertInside(resolution.root, backupRoot, "Context migration backup");
  assertNoSymlink(resolution.root, backupRoot, "Context migration backup");
  const backupCatalog = inspectCatalog({ projectRoot: resolution.root, contextRoot: backupRoot, kind: "backup" });
  if (!backupCatalog.valid || backupCatalog.hash !== migration.sourceHash) {
    throw new Error("Context migration backup is missing or invalid");
  }
  ensureDirectory(resolution.root, path.dirname(resolution.legacy.path), "Legacy context parent");

  if (migration.state === "both-identical") {
    fs.renameSync(backupRoot, resolution.legacy.path);
    const restored = resolveContextCatalog({ root: resolution.root });
    if (restored.state !== "both-identical") {
      fs.renameSync(resolution.legacy.path, backupRoot);
      throw new Error(`Context migration rollback reached unexpected state: ${restored.state}`);
    }
    return restored;
  }

  const transactionsRoot = ensureDirectory(resolution.root, path.join(resolution.root, ".codex-agent", ".transactions"), "Context transaction directory");
  const rollbackRoot = path.join(transactionsRoot, `catalog-rollback-${process.pid}-${Date.now()}-${crypto.randomUUID()}`);
  fs.renameSync(resolution.canonical.path, rollbackRoot);
  try {
    fs.renameSync(backupRoot, resolution.legacy.path);
    const restored = resolveContextCatalog({ root: resolution.root });
    if (restored.state !== "legacy-only") throw new Error(`Context migration rollback reached unexpected state: ${restored.state}`);
    fs.rmSync(rollbackRoot, { recursive: true, force: true });
    return restored;
  } catch (error) {
    if (!fs.existsSync(resolution.canonical.path) && fs.existsSync(rollbackRoot)) fs.renameSync(rollbackRoot, resolution.canonical.path);
    throw error;
  }
};

export const rollbackContextCatalogMigration = ({ root, migration, lock = true }) => {
  const operation = () => applyMigrationRollback({ root, migration });
  return lock ? withContextLock({ root }, operation) : operation();
};
