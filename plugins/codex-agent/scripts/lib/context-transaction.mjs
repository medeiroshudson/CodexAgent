import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertValidContextIndex } from "./context-index.mjs";
import {
  assertInside,
  assertNoSymlink,
  assertSafeMarkdownContent,
  ensureDirectory,
  listTreeFiles,
  resolveProjectRoot,
  safeRelativePath,
  sha256,
  slash
} from "./safe-files.mjs";

const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const transactionId = () => `${process.pid}-${Date.now()}-${crypto.randomUUID()}`;
const CONTEXT_TRANSACTION_VERSION = 1;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

const cleanupLock = ({ descriptor, lockPath, token }) => {
  try { fs.closeSync(descriptor); } catch { /* the callback error remains authoritative */ }
  try {
    if (fs.readFileSync(lockPath, "utf8") === token) fs.unlinkSync(lockPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
};

const localProcessIsDead = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
};

const reclaimStaleLocalLock = ({ projectRoot, lockPath }) => {
  let token;
  try { token = fs.readFileSync(lockPath, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  let owner;
  try { owner = JSON.parse(token); }
  catch { return false; }
  if (!owner || typeof owner !== "object" || Array.isArray(owner)
    || owner.hostname !== os.hostname() || !Number.isSafeInteger(owner.pid) || owner.pid <= 0
    || typeof owner.nonce !== "string" || !owner.nonce || !localProcessIsDead(owner.pid)) {
    return false;
  }
  try {
    if (fs.readFileSync(lockPath, "utf8") !== token) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw new Error(`Could not reclaim stale context lock: ${slash(path.relative(projectRoot, lockPath))}`);
  }
};

const acquireContextLock = ({ projectRoot, lockPath, token }) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    let descriptor;
    try {
      descriptor = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(descriptor, token);
      return descriptor;
    } catch (error) {
      if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch { /* ignore close failure */ }
      if (descriptor !== undefined) try { fs.unlinkSync(lockPath); } catch { /* preserve the acquisition error */ }
      if (error?.code !== "EEXIST") throw error;
      if (attempt === 0 && reclaimStaleLocalLock({ projectRoot, lockPath })) continue;
      throw new Error(`Context catalog is locked: ${slash(path.relative(projectRoot, lockPath))}`);
    }
  }
  throw new Error(`Context catalog is locked: ${slash(path.relative(projectRoot, lockPath))}`);
};

const fileHash = ({ projectRoot, file, label }) => {
  assertInside(projectRoot, file, label);
  assertNoSymlink(projectRoot, file, label);
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error(`${label} is not a regular file`);
  return sha256(fs.readFileSync(file));
};

const validateRecoveryManifest = ({ projectRoot, transactionRoot, manifest }) => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || manifest.version !== CONTEXT_TRANSACTION_VERSION || manifest.type !== "context"
    || manifest.transactionId !== path.basename(transactionRoot)
    || manifest.contextRoot !== ".codex-agent/context" || typeof manifest.contextExisted !== "boolean"
    || !Array.isArray(manifest.items) || manifest.items.length < 1) {
    throw new Error(`Invalid context transaction recovery manifest: ${path.basename(transactionRoot)}`);
  }
  const seen = new Set();
  const items = manifest.items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.existed !== "boolean") {
      throw new Error(`Invalid context transaction recovery item ${index}`);
    }
    const relativePath = safeRelativePath(item.path, `Context transaction recovery item ${index} path`);
    if (seen.has(relativePath)) throw new Error(`Duplicate context transaction recovery path: ${relativePath}`);
    if (relativePath !== "index.json" && !relativePath.toLowerCase().endsWith(".md")) {
      throw new Error(`Context transaction recovery path must reference Markdown: ${relativePath}`);
    }
    if ((item.beforeHash !== null && !HASH_PATTERN.test(item.beforeHash)) || !HASH_PATTERN.test(item.afterHash)
      || item.existed !== (item.beforeHash !== null)) {
      throw new Error(`Invalid hashes in context transaction recovery item: ${relativePath}`);
    }
    seen.add(relativePath);
    return { path: relativePath, existed: item.existed, beforeHash: item.beforeHash, afterHash: item.afterHash };
  });
  if (items.at(-1)?.path !== "index.json" || items.slice(0, -1).some((item) => item.path === "index.json")) {
    throw new Error("Context transaction recovery manifest must promote index.json last");
  }
  return { contextExisted: manifest.contextExisted, items };
};

const transactionItemState = ({ projectRoot, contextRoot, transactionRoot, item }) => {
  const destination = path.join(contextRoot, ...item.path.split("/"));
  const staged = path.join(transactionRoot, "staged", ...item.path.split("/"));
  const rollback = path.join(transactionRoot, "rollback", ...item.path.split("/"));
  return {
    ...item,
    destination,
    staged,
    rollback,
    destinationHash: fileHash({ projectRoot, file: destination, label: `Context recovery destination ${item.path}` }),
    stagedHash: fileHash({ projectRoot, file: staged, label: `Context recovery staged file ${item.path}` }),
    rollbackHash: fileHash({ projectRoot, file: rollback, label: `Context recovery rollback file ${item.path}` })
  };
};

const assertRecoverableState = (state) => {
  if (state.stagedHash !== null && state.stagedHash !== state.afterHash) {
    throw new Error(`Context transaction staged file changed unexpectedly: ${state.path}`);
  }
  if (state.rollbackHash !== null && state.rollbackHash !== state.beforeHash) {
    throw new Error(`Context transaction rollback file changed unexpectedly: ${state.path}`);
  }
  if (state.destinationHash !== null && ![state.beforeHash, state.afterHash].includes(state.destinationHash)) {
    throw new Error(`Context transaction destination changed unexpectedly: ${state.path}`);
  }
  if (!state.existed && state.rollbackHash !== null) {
    throw new Error(`Context transaction has an unexpected rollback file: ${state.path}`);
  }
  if (state.existed && state.rollbackHash === null && state.destinationHash !== state.beforeHash) {
    throw new Error(`Context transaction cannot restore its prior file: ${state.path}`);
  }
};

const pruneEmptyParents = ({ contextRoot, destination, removeContextRoot }) => {
  let current = path.dirname(destination);
  while (current !== contextRoot && current.startsWith(`${contextRoot}${path.sep}`)) {
    if (!fs.existsSync(current) || !fs.lstatSync(current).isDirectory() || fs.readdirSync(current).length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
  if (removeContextRoot && fs.existsSync(contextRoot) && fs.readdirSync(contextRoot).length === 0) fs.rmdirSync(contextRoot);
};

const removeTransactionTree = ({ projectRoot, transactionRoot }) => {
  assertNoSymlink(projectRoot, transactionRoot, "Context transaction recovery directory");
  fs.rmSync(transactionRoot, { recursive: true, force: true });
};

const recoverContextTransaction = ({ projectRoot, transactionRoot, manifest }) => {
  const normalized = validateRecoveryManifest({ projectRoot, transactionRoot, manifest });
  const contextRoot = path.join(projectRoot, ".codex-agent", "context");
  const states = normalized.items.map((item) => transactionItemState({ projectRoot, contextRoot, transactionRoot, item }));
  for (const state of states) assertRecoverableState(state);

  if (states.every((state) => state.destinationHash === state.afterHash)) {
    removeTransactionTree({ projectRoot, transactionRoot });
    return "completed";
  }

  for (const state of [...states].reverse()) {
    if (state.rollbackHash !== null) {
      if (fs.existsSync(state.destination)) fs.unlinkSync(state.destination);
      fs.mkdirSync(path.dirname(state.destination), { recursive: true });
      fs.renameSync(state.rollback, state.destination);
    } else if (!state.existed && state.destinationHash === state.afterHash) {
      fs.unlinkSync(state.destination);
    }
  }
  for (const state of states) {
    const restoredHash = fileHash({ projectRoot, file: state.destination, label: `Restored context file ${state.path}` });
    if (restoredHash !== state.beforeHash) throw new Error(`Context transaction rollback verification failed: ${state.path}`);
    if (!state.existed) pruneEmptyParents({ contextRoot, destination: state.destination, removeContextRoot: !normalized.contextExisted });
  }
  removeTransactionTree({ projectRoot, transactionRoot });
  return "rolled-back";
};

const validateProjectRecoveryManifest = ({ transactionRoot, manifest }) => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || manifest.version !== CONTEXT_TRANSACTION_VERSION || manifest.type !== "project"
    || manifest.transactionId !== path.basename(transactionRoot)
    || typeof manifest.indexPath !== "string" || !Array.isArray(manifest.items) || manifest.items.length < 1) {
    throw new Error(`Invalid project transaction recovery manifest: ${path.basename(transactionRoot)}`);
  }
  const indexPath = safeRelativePath(manifest.indexPath, "Project transaction recovery index path");
  const seen = new Set();
  const items = manifest.items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.existed !== "boolean") {
      throw new Error(`Invalid project transaction recovery item ${index}`);
    }
    const relativePath = safeRelativePath(item.path, `Project transaction recovery item ${index} path`);
    if (relativePath.startsWith(".codex-agent/.transactions/") || relativePath.startsWith(".codex-agent/.locks/")) {
      throw new Error(`Project transaction recovery path targets internal transaction state: ${relativePath}`);
    }
    if (seen.has(relativePath)) throw new Error(`Duplicate project transaction recovery path: ${relativePath}`);
    if ((item.beforeHash !== null && !HASH_PATTERN.test(item.beforeHash)) || !HASH_PATTERN.test(item.afterHash)
      || item.existed !== (item.beforeHash !== null)) {
      throw new Error(`Invalid hashes in project transaction recovery item: ${relativePath}`);
    }
    seen.add(relativePath);
    return { path: relativePath, existed: item.existed, beforeHash: item.beforeHash, afterHash: item.afterHash };
  });
  if (items.at(-1)?.path !== indexPath || items.slice(0, -1).some((item) => item.path === indexPath)) {
    throw new Error("Project transaction recovery manifest must promote its index last");
  }
  return { indexPath, items };
};

const recoverProjectTransaction = ({ projectRoot, transactionRoot, manifest }) => {
  const normalized = validateProjectRecoveryManifest({ transactionRoot, manifest });
  const states = normalized.items.map((item) => {
    const destination = path.join(projectRoot, ...item.path.split("/"));
    const staged = path.join(transactionRoot, "staged", ...item.path.split("/"));
    const rollback = path.join(transactionRoot, "rollback", ...item.path.split("/"));
    return {
      ...item,
      destination,
      staged,
      rollback,
      destinationHash: fileHash({ projectRoot, file: destination, label: `Project recovery destination ${item.path}` }),
      stagedHash: fileHash({ projectRoot, file: staged, label: `Project recovery staged file ${item.path}` }),
      rollbackHash: fileHash({ projectRoot, file: rollback, label: `Project recovery rollback file ${item.path}` })
    };
  });
  for (const state of states) assertRecoverableState(state);

  if (states.every((state) => state.destinationHash === state.afterHash)) {
    removeTransactionTree({ projectRoot, transactionRoot });
    return "completed";
  }

  for (const state of [...states].reverse()) {
    if (state.rollbackHash !== null) {
      if (fs.existsSync(state.destination)) fs.unlinkSync(state.destination);
      fs.mkdirSync(path.dirname(state.destination), { recursive: true });
      fs.renameSync(state.rollback, state.destination);
    } else if (!state.existed && state.destinationHash === state.afterHash) {
      fs.unlinkSync(state.destination);
    }
  }
  for (const state of states) {
    const restoredHash = fileHash({ projectRoot, file: state.destination, label: `Restored project file ${state.path}` });
    if (restoredHash !== state.beforeHash) throw new Error(`Project transaction rollback verification failed: ${state.path}`);
    if (!state.existed) pruneEmptyParents({ contextRoot: projectRoot, destination: state.destination, removeContextRoot: false });
  }
  removeTransactionTree({ projectRoot, transactionRoot });
  return "rolled-back";
};

const recoverPendingContextTransactions = (projectRoot) => {
  const transactionsRoot = path.join(projectRoot, ".codex-agent", ".transactions");
  assertNoSymlink(projectRoot, transactionsRoot, "Context transaction directory");
  if (!fs.existsSync(transactionsRoot)) return [];
  const recovered = [];
  for (const entry of fs.readdirSync(transactionsRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".lifecycle-tmp-")) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`Invalid lifecycle preparation entry: ${entry.name}`);
      const transactionRoot = path.join(transactionsRoot, entry.name);
      removeTransactionTree({ projectRoot, transactionRoot });
      recovered.push({ transactionId: entry.name, outcome: "discarded-before-promotion" });
      continue;
    }
    if (!entry.name.startsWith("context-") && !entry.name.startsWith("project-")) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`Invalid context transaction recovery entry: ${entry.name}`);
    const transactionRoot = path.join(transactionsRoot, entry.name);
    const manifestPath = path.join(transactionRoot, "manifest.json");
    assertNoSymlink(projectRoot, manifestPath, "Context transaction recovery manifest");
    if (!fs.existsSync(manifestPath)) {
      removeTransactionTree({ projectRoot, transactionRoot });
      recovered.push({ transactionId: entry.name, outcome: "discarded-before-promotion" });
      continue;
    }
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
    catch { throw new Error(`Invalid context transaction recovery manifest: ${entry.name}`); }
    const outcome = entry.name.startsWith("context-")
      ? recoverContextTransaction({ projectRoot, transactionRoot, manifest })
      : recoverProjectTransaction({ projectRoot, transactionRoot, manifest });
    recovered.push({ transactionId: entry.name, outcome });
  }
  return recovered;
};

const pendingLifecycleTransactionNames = (projectRoot) => {
  const transactionsRoot = path.join(projectRoot, ".codex-agent", ".transactions");
  assertNoSymlink(projectRoot, transactionsRoot, "Context transaction directory");
  if (!fs.existsSync(transactionsRoot)) return [];
  return fs.readdirSync(transactionsRoot, { withFileTypes: true })
    .filter((entry) => entry.name.startsWith("lifecycle-"))
    .map((entry) => {
      if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`Invalid lifecycle recovery entry: ${entry.name}`);
      return entry.name;
    })
    .sort();
};

export const withContextLock = ({ root, allowPendingLifecycle = false }, callback) => {
  if (typeof callback !== "function") throw new Error("withContextLock requires a callback");
  const projectRoot = resolveProjectRoot(root);
  const lockDirectory = ensureDirectory(projectRoot, path.join(projectRoot, ".codex-agent", ".locks"), "Context lock directory");
  const lockPath = path.join(lockDirectory, "context.lock");
  assertNoSymlink(projectRoot, lockPath, "Context lock");
  const token = `${JSON.stringify({ version: 1, pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString(), nonce: crypto.randomUUID() })}\n`;
  const descriptor = acquireContextLock({ projectRoot, lockPath, token });

  let result;
  try {
    const recoveredTransactions = recoverPendingContextTransactions(projectRoot);
    const pendingLifecycleTransactions = pendingLifecycleTransactionNames(projectRoot);
    if (pendingLifecycleTransactions.length && !allowPendingLifecycle) {
      throw new Error(`Context lifecycle recovery is pending: ${pendingLifecycleTransactions.join(", ")}`);
    }
    result = callback({ root: projectRoot, lockPath, recoveredTransactions, pendingLifecycleTransactions });
  }
  catch (error) {
    cleanupLock({ descriptor, lockPath, token });
    throw error;
  }
  if (result && typeof result.then === "function") {
    return result.finally(() => cleanupLock({ descriptor, lockPath, token }));
  }
  cleanupLock({ descriptor, lockPath, token });
  return result;
};

const validateDocuments = (documents) => {
  if (!Array.isArray(documents)) throw new Error("Context transaction documents must be an array");
  const paths = new Set();
  return documents.map((document, index) => {
    if (!document || typeof document !== "object") throw new Error(`Context transaction document ${index} is invalid`);
    const relativePath = safeRelativePath(document.path, `Context transaction document ${index} path`);
    if (relativePath === "index.json") throw new Error("Context documents must not replace index.json");
    if (!relativePath.toLowerCase().endsWith(".md")) throw new Error(`Context transaction document must reference Markdown: ${relativePath}`);
    if (paths.has(relativePath)) throw new Error(`Duplicate context transaction document: ${relativePath}`);
    if (typeof document.content !== "string") throw new Error(`Context transaction document ${relativePath} content must be a string`);
    assertSafeMarkdownContent(document.content, `Context transaction document ${relativePath}`);
    paths.add(relativePath);
    return { path: relativePath, content: document.content };
  }).sort((left, right) => left.path.localeCompare(right.path));
};

const validateProjectFiles = (files) => {
  if (!Array.isArray(files) || files.length === 0) throw new Error("Project transaction files must be a non-empty array");
  const paths = new Set();
  return files.map((file, index) => {
    if (!file || typeof file !== "object") throw new Error(`Project transaction file ${index} is invalid`);
    const relativePath = safeRelativePath(file.path, `Project transaction file ${index} path`);
    if (paths.has(relativePath)) throw new Error(`Duplicate project transaction file: ${relativePath}`);
    if (typeof file.content !== "string") throw new Error(`Project transaction file ${relativePath} content must be a string`);
    if (file.expected !== null && file.expected !== undefined && typeof file.expected !== "string") {
      throw new Error(`Project transaction file ${relativePath} expected content must be a string or null`);
    }
    paths.add(relativePath);
    return { path: relativePath, content: file.content, expected: file.expected };
  }).sort((left, right) => left.path.localeCompare(right.path));
};

const validateProjectPreconditions = (preconditions) => {
  if (!Array.isArray(preconditions)) throw new Error("Project transaction preconditions must be an array");
  const paths = new Set();
  return preconditions.map((precondition, index) => {
    if (!precondition || typeof precondition !== "object") throw new Error(`Project transaction precondition ${index} is invalid`);
    const relativePath = safeRelativePath(precondition.path, `Project transaction precondition ${index} path`);
    if (paths.has(relativePath)) throw new Error(`Duplicate project transaction precondition: ${relativePath}`);
    if (precondition.expected !== null && typeof precondition.expected !== "string") {
      throw new Error(`Project transaction precondition ${relativePath} expected content must be a string or null`);
    }
    paths.add(relativePath);
    return { path: relativePath, expected: precondition.expected };
  }).sort((left, right) => left.path.localeCompare(right.path));
};

const currentText = (file) => fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;

const parseContextIndexContent = (content, label) => {
  let index;
  try { index = JSON.parse(content); }
  catch (error) { throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  return index;
};

const assertContextMarkdownSafe = (contextRoot) => {
  if (!fs.existsSync(contextRoot)) return;
  for (const entry of listTreeFiles(contextRoot).filter((item) => item.relative.toLowerCase().endsWith(".md"))) {
    assertSafeMarkdownContent(fs.readFileSync(entry.absolute, "utf8"), `Context Markdown ${entry.relative}`);
  }
};

const writeRecoveryManifest = ({ transactionRoot, manifest }) => {
  const temporary = path.join(transactionRoot, ".manifest.json.tmp");
  const destination = path.join(transactionRoot, "manifest.json");
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, destination);
  } catch (error) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor); } catch { /* preserve manifest error */ }
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* preserve manifest error */ }
    throw error;
  }
};

const applyLockedProjectTransaction = ({ root, files, indexPath = ".codex-agent/context/index.json", preconditions = [] }) => {
  const projectRoot = resolveProjectRoot(root);
  const normalizedFiles = validateProjectFiles(files);
  const normalizedPreconditions = validateProjectPreconditions(preconditions);
  const normalizedIndexPath = safeRelativePath(indexPath, "Project transaction index path");
  const indexFile = normalizedFiles.find((file) => file.path === normalizedIndexPath);
  if (!indexFile) {
    throw new Error(`Project transaction must include its index file: ${normalizedIndexPath}`);
  }

  const absoluteIndexPath = path.join(projectRoot, ...normalizedIndexPath.split("/"));
  const contextRoot = path.dirname(absoluteIndexPath);
  const contextPrefix = slash(path.relative(projectRoot, contextRoot));
  const pendingContextFiles = normalizedFiles.filter((file) => file.path.startsWith(`${contextPrefix}/`) && file.path !== normalizedIndexPath);
  const pendingMarkdownFiles = pendingContextFiles.filter((item) => item.path.toLowerCase().endsWith(".md"));
  for (const file of pendingMarkdownFiles) {
    assertSafeMarkdownContent(file.content, `Project transaction context Markdown ${file.path}`);
  }
  assertValidContextIndex(parseContextIndexContent(indexFile.content, "Project transaction index"), {
    root: projectRoot,
    contextRoot,
    pendingPaths: pendingMarkdownFiles.map((file) => slash(path.relative(contextRoot, path.join(projectRoot, ...file.path.split("/")))))
  });

  for (const item of [...normalizedFiles, ...normalizedPreconditions]) {
    const destination = path.join(projectRoot, ...item.path.split("/"));
    assertInside(projectRoot, destination, "Project transaction destination");
    assertNoSymlink(projectRoot, destination, "Project transaction destination");
    if (item.expected !== undefined && currentText(destination) !== item.expected) {
      throw new Error(`Project transaction precondition changed: ${item.path}`);
    }
  }

  const codexAgentRoot = ensureDirectory(projectRoot, path.join(projectRoot, ".codex-agent"), "Codex Agent state directory");
  const transactionsRoot = ensureDirectory(projectRoot, path.join(codexAgentRoot, ".transactions"), "Project transaction directory");
  const id = `project-${transactionId()}`;
  const transactionRoot = path.join(transactionsRoot, id);
  const stagedRoot = path.join(transactionRoot, "staged");
  const rollbackRoot = path.join(transactionRoot, "rollback");
  fs.mkdirSync(stagedRoot, { recursive: true });
  fs.mkdirSync(rollbackRoot, { recursive: true });

  let committed = false;
  try {
    for (const file of normalizedFiles) {
      const staged = path.join(stagedRoot, ...file.path.split("/"));
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.writeFileSync(staged, file.content, { flag: "wx" });
    }

    const existing = normalizedFiles.filter((file) => {
      const destination = path.join(projectRoot, ...file.path.split("/"));
      return fs.existsSync(destination) && currentText(destination) !== file.content;
    });
    const backedUp = [];
    if (existing.length) {
      const backupRoot = path.join(codexAgentRoot, "backups", timestamp());
      for (const file of existing) {
        const source = path.join(projectRoot, ...file.path.split("/"));
        const backup = path.join(backupRoot, ...file.path.split("/"));
        assertNoSymlink(projectRoot, source, "Project transaction backup source");
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(source, backup, fs.constants.COPYFILE_EXCL);
        backedUp.push(slash(path.relative(projectRoot, backup)));
      }
    }

    const ordered = [
      ...normalizedFiles.filter((file) => file.path !== normalizedIndexPath),
      ...normalizedFiles.filter((file) => file.path === normalizedIndexPath)
    ];
    const manifestItems = ordered.map((file) => {
      const destination = path.join(projectRoot, ...file.path.split("/"));
      const beforeHash = fileHash({ projectRoot, file: destination, label: `Project transaction destination ${file.path}` });
      return {
        path: file.path,
        existed: beforeHash !== null,
        beforeHash,
        afterHash: sha256(Buffer.from(file.content))
      };
    });
    writeRecoveryManifest({
      transactionRoot,
      manifest: {
        version: CONTEXT_TRANSACTION_VERSION,
        type: "project",
        transactionId: id,
        indexPath: normalizedIndexPath,
        items: manifestItems
      }
    });

    for (const file of ordered) {
      const staged = path.join(stagedRoot, ...file.path.split("/"));
      const destination = path.join(projectRoot, ...file.path.split("/"));
      const rollback = path.join(rollbackRoot, ...file.path.split("/"));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (fs.existsSync(destination)) {
        fs.mkdirSync(path.dirname(rollback), { recursive: true });
        fs.renameSync(destination, rollback);
      }
      fs.renameSync(staged, destination);
    }
    for (const item of manifestItems) {
      const destination = path.join(projectRoot, ...item.path.split("/"));
      if (fileHash({ projectRoot, file: destination, label: `Promoted project file ${item.path}` }) !== item.afterHash) {
        throw new Error(`Project transaction promotion verification failed: ${item.path}`);
      }
    }

    committed = true;
    return { transactionId: id, files: ordered.map((file) => file.path), indexPath: normalizedIndexPath, backedUp };
  } catch (error) {
    const manifestPath = path.join(transactionRoot, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        recoverProjectTransaction({ projectRoot, transactionRoot, manifest });
      } catch (rollbackError) {
        throw new Error(`Project transaction failed and recovery failed: ${error instanceof Error ? error.message : String(error)}; recovery: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    } else {
      removeTransactionTree({ projectRoot, transactionRoot });
    }
    throw error;
  } finally {
    if (committed && fs.existsSync(transactionRoot)) removeTransactionTree({ projectRoot, transactionRoot });
  }
};

const applyLockedTransaction = ({ root, documents, indexContent, backupPaths = [] }) => {
  const projectRoot = resolveProjectRoot(root);
  const normalizedDocuments = validateDocuments(documents);
  if (typeof indexContent !== "string") throw new Error("Context transaction indexContent must be a string");
  const contextRoot = path.join(projectRoot, ".codex-agent", "context");
  assertNoSymlink(projectRoot, contextRoot, "Canonical context root");
  assertContextMarkdownSafe(contextRoot);
  assertValidContextIndex(parseContextIndexContent(indexContent, "Context transaction index"), {
    root: projectRoot,
    contextRoot,
    pendingPaths: normalizedDocuments.map((document) => document.path)
  });

  const normalizedBackups = [...new Set(backupPaths.map((item, index) => safeRelativePath(item, `Context backup path ${index}`)))].sort();
  const codexAgentRoot = ensureDirectory(projectRoot, path.join(projectRoot, ".codex-agent"), "Codex Agent state directory");
  const contextExisted = fs.existsSync(contextRoot);
  const transactionsRoot = ensureDirectory(projectRoot, path.join(codexAgentRoot, ".transactions"), "Context transaction directory");
  const id = `context-${transactionId()}`;
  const transactionRoot = path.join(transactionsRoot, id);
  fs.mkdirSync(transactionRoot, { recursive: false });
  const stagedRoot = path.join(transactionRoot, "staged");
  const rollbackRoot = path.join(transactionRoot, "rollback");
  fs.mkdirSync(stagedRoot);
  fs.mkdirSync(rollbackRoot);

  let committed = false;
  try {
    const stagedDocuments = normalizedDocuments.map((document) => {
      const staged = path.join(stagedRoot, ...document.path.split("/"));
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.writeFileSync(staged, document.content, { flag: "wx" });
      return { ...document, staged };
    });
    const stagedIndex = path.join(stagedRoot, "index.json");
    fs.writeFileSync(stagedIndex, indexContent, { flag: "wx" });

    const backedUp = [];
    const existingBackups = normalizedBackups.filter((relative) => fs.existsSync(path.join(contextRoot, ...relative.split("/"))));
    if (existingBackups.length) {
      const backupRoot = path.join(codexAgentRoot, "backups", timestamp(), ".codex-agent", "context");
      assertNoSymlink(projectRoot, backupRoot, "Context backup directory");
      for (const relative of existingBackups) {
        const source = path.join(contextRoot, ...relative.split("/"));
        assertInside(contextRoot, source, "Context backup source");
        assertNoSymlink(projectRoot, source, "Context backup source");
        const destination = path.join(backupRoot, ...relative.split("/"));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
        backedUp.push(slash(path.relative(projectRoot, destination)));
      }
    }

    const manifestItems = [
      ...stagedDocuments.map((document) => {
        const destination = path.join(contextRoot, ...document.path.split("/"));
        const beforeHash = fileHash({ projectRoot, file: destination, label: `Context transaction destination ${document.path}` });
        return {
          path: document.path,
          existed: beforeHash !== null,
          beforeHash,
          afterHash: sha256(Buffer.from(document.content))
        };
      }),
      (() => {
        const destination = path.join(contextRoot, "index.json");
        const beforeHash = fileHash({ projectRoot, file: destination, label: "Context transaction destination index.json" });
        return { path: "index.json", existed: beforeHash !== null, beforeHash, afterHash: sha256(Buffer.from(indexContent)) };
      })()
    ];
    const manifest = {
      version: CONTEXT_TRANSACTION_VERSION,
      type: "context",
      transactionId: id,
      contextRoot: ".codex-agent/context",
      contextExisted,
      items: manifestItems
    };
    writeRecoveryManifest({ transactionRoot, manifest });

    const promote = (relative) => {
      const staged = path.join(stagedRoot, ...relative.split("/"));
      const destination = path.join(contextRoot, ...relative.split("/"));
      assertInside(contextRoot, destination, "Context transaction destination");
      assertNoSymlink(projectRoot, destination, "Context transaction destination");
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const rollback = path.join(rollbackRoot, ...relative.split("/"));
      const existed = fs.existsSync(destination);
      if (existed) {
        fs.mkdirSync(path.dirname(rollback), { recursive: true });
        fs.renameSync(destination, rollback);
      }
      fs.renameSync(staged, destination);
    };

    for (const document of stagedDocuments) promote(document.path);
    promote("index.json");
    for (const item of manifestItems) {
      const destination = path.join(contextRoot, ...item.path.split("/"));
      if (fileHash({ projectRoot, file: destination, label: `Promoted context file ${item.path}` }) !== item.afterHash) {
        throw new Error(`Context transaction promotion verification failed: ${item.path}`);
      }
    }

    committed = true;
    return {
      transactionId: id,
      documents: normalizedDocuments.map((document) => document.path),
      indexPath: ".codex-agent/context/index.json",
      backedUp
    };
  } catch (error) {
    const manifestPath = path.join(transactionRoot, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        recoverContextTransaction({ projectRoot, transactionRoot, manifest });
      } catch (rollbackError) {
        throw new Error(`Context transaction failed and recovery failed: ${error instanceof Error ? error.message : String(error)}; recovery: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    } else {
      removeTransactionTree({ projectRoot, transactionRoot });
    }
    throw error;
  } finally {
    if (committed && fs.existsSync(transactionRoot)) removeTransactionTree({ projectRoot, transactionRoot });
  }
};

export const applyContextTransaction = ({ root, documents, indexContent, backupPaths = [], lock = true }) => {
  const operation = () => applyLockedTransaction({ root, documents, indexContent, backupPaths });
  return lock ? withContextLock({ root }, operation) : operation();
};

export const applyProjectTransaction = ({ root, files, indexPath, preconditions = [], lock = true }) => {
  const operation = () => applyLockedProjectTransaction({ root, files, indexPath, preconditions });
  return lock ? withContextLock({ root }, operation) : operation();
};
