import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertWritableContextCatalog,
  getReadableContextCatalog,
  migrateContextCatalog,
  resolveContextCatalog
} from "../plugins/codex-agent/scripts/lib/context-catalog.mjs";
import {
  applyContextTransaction,
  applyProjectTransaction,
  withContextLock
} from "../plugins/codex-agent/scripts/lib/context-transaction.mjs";
import { copyTreeSafely } from "../plugins/codex-agent/scripts/lib/safe-files.mjs";
import {
  buildContextIndex,
  saveContextProposal,
  validateContextProposal
} from "../plugins/codex-agent/skills/context-curation/scripts/context-save.mjs";
import { migrateNavigationContext } from "../plugins/codex-agent/skills/context-curation/scripts/navigation-migrate.mjs";
import { selectContext } from "../plugins/codex-agent/skills/context-discovery/scripts/select-context.mjs";

const temporaryRoot = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-context-storage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

const captureError = (callback) => {
  try { callback(); }
  catch (error) { return error; }
  assert.fail("Expected callback to throw");
};

const catalogIndex = (document = "rules.md") => ({
  version: 1,
  entries: [{
    id: "rules",
    path: document,
    summary: "Stable repository rules used by focused tasks.",
    tags: ["rules"],
    priority: "high"
  }]
});

const writeCatalog = (root, relativeRoot, { content = "# Rules\n\nKeep public contracts stable.\n", index = catalogIndex() } = {}) => {
  const contextRoot = path.join(root, ...relativeRoot.split("/"));
  fs.mkdirSync(contextRoot, { recursive: true });
  if (content !== null) fs.writeFileSync(path.join(contextRoot, "rules.md"), content);
  if (index !== null) fs.writeFileSync(path.join(contextRoot, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return contextRoot;
};

const proposal = () => ({
  version: 1,
  title: "Keep transaction boundaries explicit",
  kind: "constraint",
  summary: "Repository writes keep transaction boundaries explicit and reviewable.",
  scope: "storage layer",
  contentMarkdown: "Promote documents before the catalog index and roll back partial writes when a promotion fails.",
  evidence: [{ path: "package.json", note: "The repository manifest is stable project evidence." }],
  tags: ["storage", "transactions"],
  priority: "high",
  confidence: "high"
});

test("resolver reports every catalog state and canonical-first readable behavior", (t) => {
  const none = temporaryRoot(t);
  assert.equal(resolveContextCatalog({ root: none }).state, "none");

  const legacy = temporaryRoot(t);
  writeCatalog(legacy, ".agents/context");
  assert.equal(resolveContextCatalog({ root: legacy }).state, "legacy-only");
  assert.equal(getReadableContextCatalog({ root: legacy }).source, "legacy");
  assert.throws(() => assertWritableContextCatalog({ root: legacy }), /legacy-only/);

  const canonical = temporaryRoot(t);
  writeCatalog(canonical, ".codex-agent/context");
  assert.equal(resolveContextCatalog({ root: canonical }).state, "canonical-only");
  assert.equal(getReadableContextCatalog({ root: canonical }).source, "canonical");

  const identical = temporaryRoot(t);
  writeCatalog(identical, ".agents/context");
  writeCatalog(identical, ".codex-agent/context");
  const canonicalIndexPath = path.join(identical, ".codex-agent", "context", "index.json");
  const canonicalIndex = JSON.parse(fs.readFileSync(canonicalIndexPath, "utf8"));
  fs.writeFileSync(canonicalIndexPath, JSON.stringify({ entries: canonicalIndex.entries, version: canonicalIndex.version }));
  assert.equal(resolveContextCatalog({ root: identical }).state, "both-identical");
  assert.equal(getReadableContextCatalog({ root: identical }).source, "canonical");
  assert.throws(() => assertWritableContextCatalog({ root: identical }), /both-identical/);

  const divergent = temporaryRoot(t);
  writeCatalog(divergent, ".agents/context");
  writeCatalog(divergent, ".codex-agent/context", { content: "# Rules\n\nA divergent rule.\n" });
  assert.equal(resolveContextCatalog({ root: divergent }).state, "both-divergent");
  assert.throws(() => getReadableContextCatalog({ root: divergent }), /both-divergent/);

  const invalid = temporaryRoot(t);
  writeCatalog(invalid, ".codex-agent/context", { content: null });
  assert.equal(resolveContextCatalog({ root: invalid }).state, "invalid");

  const unsupported = temporaryRoot(t);
  writeCatalog(unsupported, ".codex-agent/context");
  fs.writeFileSync(path.join(unsupported, ".codex-agent", "context", ".DS_Store"), "metadata");
  assert.equal(resolveContextCatalog({ root: unsupported }).state, "invalid");
});

test("resolver rejects symlinks and escaping or missing index entries", (t) => {
  const symlinkRoot = temporaryRoot(t);
  const outside = temporaryRoot(t);
  writeCatalog(outside, "context");
  fs.mkdirSync(path.join(symlinkRoot, ".agents"));
  fs.symlinkSync(path.join(outside, "context"), path.join(symlinkRoot, ".agents", "context"), "dir");
  const symlinkResolution = resolveContextCatalog({ root: symlinkRoot });
  assert.equal(symlinkResolution.state, "invalid");
  assert.match(symlinkResolution.errors.join("\n"), /symbolic link/);

  const escaping = temporaryRoot(t);
  writeCatalog(escaping, ".codex-agent/context", { index: catalogIndex("../outside.md") });
  const escapingResolution = resolveContextCatalog({ root: escaping });
  assert.equal(escapingResolution.state, "invalid");
  assert.match(escapingResolution.errors.join("\n"), /normalized POSIX-relative/);
});

test("resolver rejects catalogs outside the complete context index schema", (t) => {
  const cases = [
    { ...catalogIndex(), version: 2 },
    { ...catalogIndex(), owner: "team" },
    { version: 1, entries: [{ ...catalogIndex().entries[0], id: "BAD ID" }] },
    { version: 1, entries: [{ ...catalogIndex().entries[0], tags: [] }] }
  ];
  for (const index of cases) {
    const root = temporaryRoot(t);
    writeCatalog(root, ".codex-agent/context", { index });
    assert.equal(resolveContextCatalog({ root }).state, "invalid");
  }
});

test("context selection exposes resolver state and legacy fallback warnings", (t) => {
  const root = temporaryRoot(t);
  writeCatalog(root, ".agents/context");
  const selected = selectContext({ root, query: "stable rules" });
  assert.equal(selected.state, "legacy-only");
  assert.equal(selected.source, "legacy");
  assert.equal(selected.entries[0].id, "rules");
  assert.equal(selected.warnings.some((warning) => warning.includes("read-only legacy")), true);
});

test("legacy migration previews, backs up, promotes atomically, and preserves .agents siblings", (t) => {
  const root = temporaryRoot(t);
  writeCatalog(root, ".agents/context");
  fs.mkdirSync(path.join(root, ".agents", "plugins"), { recursive: true });
  fs.mkdirSync(path.join(root, ".agents", "skills", "sample"), { recursive: true });
  fs.writeFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "{}\n");
  fs.writeFileSync(path.join(root, ".agents", "skills", "sample", "SKILL.md"), "# Sample\n");

  const preview = migrateContextCatalog({ root });
  assert.equal(preview.mode, "preview");
  assert.equal(preview.state, "legacy-only");
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", "context")), false);

  const applied = migrateContextCatalog({ root, apply: true });
  assert.equal(applied.applied, true);
  assert.equal(resolveContextCatalog({ root }).state, "canonical-only");
  assert.equal(fs.existsSync(path.join(root, ".agents", "context")), false);
  assert.equal(fs.existsSync(path.join(root, ".agents", "plugins", "marketplace.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".agents", "skills", "sample", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(root, applied.backedUp[0], "rules.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
  assert.deepEqual(fs.readdirSync(path.join(root, ".codex-agent", ".transactions")), []);
});

test("legacy migration restores the atomically moved legacy catalog before undoing canonical promotion", (t) => {
  const root = temporaryRoot(t);
  const legacyRoot = writeCatalog(root, ".agents/context");
  const canonicalRoot = path.join(root, ".codex-agent", "context");
  const moduleUrl = new URL("../plugins/codex-agent/scripts/lib/context-catalog.mjs", import.meta.url).href;
  const childSource = `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    import path from "node:path";
    const root = ${JSON.stringify(root)};
    const originalRename = fs.renameSync;
    const originalRead = fs.readFileSync;
    let legacyMoved = false;
    fs.renameSync = (source, destination) => {
      const result = originalRename(source, destination);
      if (String(source).endsWith(path.join(".agents", "context"))
        && String(destination).includes(path.sep + "backups" + path.sep)) legacyMoved = true;
      return result;
    };
    fs.readFileSync = (file, ...args) => {
      if (legacyMoved && String(file).endsWith(path.join(".codex-agent", "context", "index.json"))) {
        legacyMoved = false;
        throw new Error("injected post-move verification failure");
      }
      return originalRead(file, ...args);
    };
    syncBuiltinESMExports();
    const { migrateContextCatalog } = await import(${JSON.stringify(moduleUrl)});
    try { migrateContextCatalog({ root, apply: true }); }
    catch (error) {
      process.stderr.write(error instanceof Error ? error.message : String(error));
      process.exit(77);
    }
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", childSource], { encoding: "utf8" });
  assert.equal(child.status, 77, child.stderr);
  assert.match(child.stderr, /did not reach canonical-only state: invalid/);

  assert.equal(resolveContextCatalog({ root }).state, "legacy-only");
  assert.equal(fs.readFileSync(path.join(legacyRoot, "rules.md"), "utf8"), "# Rules\n\nKeep public contracts stable.\n");
  assert.equal(fs.existsSync(canonicalRoot), false);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
  assert.deepEqual(fs.readdirSync(path.join(root, ".codex-agent", ".transactions")), []);
});

test("both-identical migration removes only legacy and divergent migration blocks", (t) => {
  const identical = temporaryRoot(t);
  writeCatalog(identical, ".agents/context");
  writeCatalog(identical, ".codex-agent/context");
  const applied = migrateContextCatalog({ root: identical, apply: true });
  assert.equal(applied.applied, true);
  assert.equal(resolveContextCatalog({ root: identical }).state, "canonical-only");

  const divergent = temporaryRoot(t);
  writeCatalog(divergent, ".agents/context");
  writeCatalog(divergent, ".codex-agent/context", { content: "# Rules\n\nDifferent content.\n" });
  assert.throws(() => migrateContextCatalog({ root: divergent }), /both-divergent/);
  assert.equal(fs.existsSync(path.join(divergent, ".agents", "context")), true);
  assert.equal(fs.existsSync(path.join(divergent, ".codex-agent", "context")), true);
});

test("global lock is exclusive and cleaned after success and failure", (t) => {
  const root = temporaryRoot(t);
  withContextLock({ root }, () => {
    assert.throws(() => withContextLock({ root }, () => {}), /locked/);
  });
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
  assert.throws(() => withContextLock({ root }, () => { throw new Error("injected failure"); }), /injected failure/);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
});

test("global lock blocks non-owner writers while lifecycle recovery is pending", (t) => {
  const root = temporaryRoot(t);
  const pending = path.join(root, ".codex-agent", ".transactions", "lifecycle-pending");
  fs.mkdirSync(pending, { recursive: true });

  assert.throws(() => withContextLock({ root }, () => {}), /lifecycle recovery is pending: lifecycle-pending/);
  assert.equal(fs.existsSync(pending), true);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
});

test("global lock discards unpublished lifecycle preparation directories", (t) => {
  const root = temporaryRoot(t);
  const preparation = path.join(root, ".codex-agent", ".transactions", ".lifecycle-tmp-test");
  fs.mkdirSync(preparation, { recursive: true });
  fs.writeFileSync(path.join(preparation, "partial-manifest.json"), "partial\n");

  let recovered;
  withContextLock({ root }, ({ recoveredTransactions }) => { recovered = recoveredTransactions; });
  assert.deepEqual(recovered, [{ transactionId: ".lifecycle-tmp-test", outcome: "discarded-before-promotion" }]);
  assert.equal(fs.existsSync(preparation), false);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
});

test("lock recovery refuses owners that cannot be proven local and dead", (t) => {
  const root = temporaryRoot(t);
  const lockDirectory = path.join(root, ".codex-agent", ".locks");
  const lockPath = path.join(lockDirectory, "context.lock");
  fs.mkdirSync(lockDirectory, { recursive: true });
  const token = `${JSON.stringify({
    version: 1,
    pid: 999999,
    hostname: `${os.hostname()}-remote`,
    createdAt: new Date(0).toISOString(),
    nonce: "remote-owner"
  })}\n`;
  fs.writeFileSync(lockPath, token);

  assert.throws(() => withContextLock({ root }, () => {}), /locked/);
  assert.equal(fs.readFileSync(lockPath, "utf8"), token);
});

test("a dead local owner recovers an interrupted document-first transaction before the next writer", (t) => {
  const root = temporaryRoot(t);
  const contextRoot = writeCatalog(root, ".codex-agent/context");
  const documentPath = path.join(contextRoot, "rules.md");
  const indexPath = path.join(contextRoot, "index.json");
  const priorDocument = fs.readFileSync(documentPath, "utf8");
  const priorIndex = fs.readFileSync(indexPath, "utf8");
  const nextIndex = catalogIndex();
  nextIndex.entries[0].summary = "Changed metadata must not outlive an interrupted document promotion.";
  const moduleUrl = new URL("../plugins/codex-agent/scripts/lib/context-transaction.mjs", import.meta.url).href;
  const childSource = `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    import path from "node:path";
    const root = ${JSON.stringify(root)};
    const rename = fs.renameSync;
    fs.renameSync = (source, target) => {
      rename(source, target);
      if (String(source).includes(path.sep + "staged" + path.sep)
        && String(target).endsWith(path.join(".codex-agent", "context", "rules.md"))) process.exit(97);
    };
    syncBuiltinESMExports();
    const { applyContextTransaction } = await import(${JSON.stringify(moduleUrl)});
    applyContextTransaction({
      root,
      documents: [{ path: "rules.md", content: "# Rules\\n\\nPromoted but not indexed.\\n" }],
      indexContent: ${JSON.stringify(`${JSON.stringify(nextIndex, null, 2)}\n`)}
    });
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", childSource], { encoding: "utf8" });
  assert.equal(child.status, 97, child.stderr);
  assert.match(fs.readFileSync(documentPath, "utf8"), /Promoted but not indexed/);
  assert.equal(fs.readFileSync(indexPath, "utf8"), priorIndex);
  const transactionDirectory = path.join(root, ".codex-agent", ".transactions");
  const transactions = fs.readdirSync(transactionDirectory);
  assert.equal(transactions.length, 1);
  const manifest = JSON.parse(fs.readFileSync(path.join(transactionDirectory, transactions[0], "manifest.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.items[0]).sort(), ["afterHash", "beforeHash", "existed", "path"]);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), true);

  let recovery;
  withContextLock({ root }, ({ recoveredTransactions }) => { recovery = recoveredTransactions; });

  assert.equal(recovery[0].outcome, "rolled-back");
  assert.equal(fs.readFileSync(documentPath, "utf8"), priorDocument);
  assert.equal(fs.readFileSync(indexPath, "utf8"), priorIndex);
  assert.deepEqual(fs.readdirSync(transactionDirectory), []);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
});

test("recovery completes a transaction when its index was already promoted", (t) => {
  const root = temporaryRoot(t);
  const contextRoot = writeCatalog(root, ".codex-agent/context");
  const nextIndex = catalogIndex();
  nextIndex.entries[0].summary = "The promoted index makes the new document state authoritative.";
  const nextIndexContent = `${JSON.stringify(nextIndex, null, 2)}\n`;
  const moduleUrl = new URL("../plugins/codex-agent/scripts/lib/context-transaction.mjs", import.meta.url).href;
  const childSource = `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    import path from "node:path";
    const root = ${JSON.stringify(root)};
    const rename = fs.renameSync;
    fs.renameSync = (source, target) => {
      rename(source, target);
      if (String(source).includes(path.sep + "staged" + path.sep)
        && String(target).endsWith(path.join(".codex-agent", "context", "index.json"))) process.exit(98);
    };
    syncBuiltinESMExports();
    const { applyContextTransaction } = await import(${JSON.stringify(moduleUrl)});
    applyContextTransaction({
      root,
      documents: [{ path: "rules.md", content: "# Rules\\n\\nCommitted before cleanup.\\n" }],
      indexContent: ${JSON.stringify(nextIndexContent)}
    });
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", childSource], { encoding: "utf8" });
  assert.equal(child.status, 98, child.stderr);

  let recovery;
  withContextLock({ root }, ({ recoveredTransactions }) => { recovery = recoveredTransactions; });

  assert.equal(recovery[0].outcome, "completed");
  assert.match(fs.readFileSync(path.join(contextRoot, "rules.md"), "utf8"), /Committed before cleanup/);
  assert.equal(fs.readFileSync(path.join(contextRoot, "index.json"), "utf8"), nextIndexContent);
  assert.deepEqual(fs.readdirSync(path.join(root, ".codex-agent", ".transactions")), []);
});

test("transaction rolls back promoted documents and cleans transaction and lock state", (t) => {
  const root = temporaryRoot(t);
  const contextRoot = writeCatalog(root, ".codex-agent/context");
  fs.writeFileSync(path.join(contextRoot, "first.md"), "before\n");
  fs.writeFileSync(path.join(contextRoot, "zblocked"), "not a directory\n");
  const priorIndex = fs.readFileSync(path.join(contextRoot, "index.json"), "utf8");

  assert.throws(() => applyContextTransaction({
    root,
    documents: [
      { path: "first.md", content: "after\n" },
      { path: "zblocked/child.md", content: "cannot promote\n" }
    ],
    indexContent: priorIndex
  }));

  assert.equal(fs.readFileSync(path.join(contextRoot, "first.md"), "utf8"), "before\n");
  assert.equal(fs.readFileSync(path.join(contextRoot, "index.json"), "utf8"), priorIndex);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
  assert.deepEqual(fs.readdirSync(path.join(root, ".codex-agent", ".transactions")), []);
});

test("transaction rejects an index with unresolved paths before writing", (t) => {
  const root = temporaryRoot(t);
  const contextRoot = writeCatalog(root, ".codex-agent/context");
  const before = fs.readFileSync(path.join(contextRoot, "index.json"), "utf8");
  assert.throws(() => applyContextTransaction({
    root,
    documents: [{ path: "new.md", content: "# New\n\nSafe content.\n" }],
    indexContent: JSON.stringify({
      version: 1,
      entries: [{ id: "missing", path: "missing.md", summary: "Missing context document.", tags: ["missing"], priority: "high" }]
    })
  }), /is missing/);
  assert.equal(fs.existsSync(path.join(contextRoot, "new.md")), false);
  assert.equal(fs.readFileSync(path.join(contextRoot, "index.json"), "utf8"), before);
});

test("context transactions reject schema-invalid prospective indexes before staging", (t) => {
  const root = temporaryRoot(t);
  const contextRoot = writeCatalog(root, ".codex-agent/context");
  const before = fs.readFileSync(path.join(contextRoot, "index.json"), "utf8");

  assert.throws(() => applyContextTransaction({
    root,
    documents: [{ path: "new.md", content: "# New\n\nSafe context document.\n" }],
    indexContent: JSON.stringify({
      version: 2,
      entries: [{ id: "new", path: "new.md", summary: "A valid summary with an invalid root version.", tags: ["new"], priority: "high" }]
    })
  }), /version must be 1/);
  assert.equal(fs.existsSync(path.join(contextRoot, "new.md")), false);
  assert.equal(fs.readFileSync(path.join(contextRoot, "index.json"), "utf8"), before);
});

test("sensitive Markdown is rejected before reindexing, copying, migration, or transaction staging", (t) => {
  const secret = "sk-abcdefghijklmnopqrstuvwxyz1234567890";
  const canonical = temporaryRoot(t);
  const canonicalRoot = writeCatalog(canonical, ".codex-agent/context");
  fs.writeFileSync(path.join(canonicalRoot, "credential.md"), `# Credential\n\n${secret}\n`);
  const reindexError = captureError(() => buildContextIndex({ root: canonical, dryRun: true }));
  assert.match(reindexError.message, /sensitive content/);
  assert.doesNotMatch(reindexError.message, new RegExp(secret));

  const copySource = temporaryRoot(t);
  const copyDestinationRoot = temporaryRoot(t);
  const copyDestination = path.join(copyDestinationRoot, "copied");
  fs.writeFileSync(path.join(copySource, "credential.md"), `# Credential\n\n${secret}\n`);
  const copyError = captureError(() => copyTreeSafely(copySource, copyDestination, { root: copyDestinationRoot }));
  assert.match(copyError.message, /sensitive content/);
  assert.doesNotMatch(copyError.message, new RegExp(secret));
  assert.equal(fs.existsSync(copyDestination), false);

  const legacy = temporaryRoot(t);
  writeCatalog(legacy, ".agents/context", { content: `# Credential\n\n${secret}\n` });
  const migrationError = captureError(() => migrateContextCatalog({ root: legacy, apply: true }));
  assert.match(migrationError.message, /sensitive content/);
  assert.doesNotMatch(migrationError.message, new RegExp(secret));
  assert.equal(fs.existsSync(path.join(legacy, ".codex-agent", "context")), false);
  assert.equal(fs.existsSync(path.join(legacy, ".agents", "context")), true);

  const transaction = temporaryRoot(t);
  const transactionRoot = writeCatalog(transaction, ".codex-agent/context");
  const priorIndex = fs.readFileSync(path.join(transactionRoot, "index.json"), "utf8");
  const transactionError = captureError(() => applyContextTransaction({
    root: transaction,
    documents: [{ path: "credential.md", content: `# Credential\n\n${secret}\n` }],
    indexContent: priorIndex
  }));
  assert.match(transactionError.message, /sensitive content/);
  assert.doesNotMatch(transactionError.message, new RegExp(secret));
  assert.equal(fs.existsSync(path.join(transactionRoot, "credential.md")), false);
});

test("project lifecycle transaction backs up files, orders the index last, and checks preconditions", (t) => {
  const root = temporaryRoot(t);
  const contextRoot = writeCatalog(root, ".codex-agent/context");
  const indexPath = path.join(contextRoot, "index.json");
  const indexContent = fs.readFileSync(indexPath, "utf8");
  fs.writeFileSync(path.join(root, "AGENTS.md"), "before\n");
  fs.writeFileSync(path.join(root, "README.md"), "guarded\n");
  const applied = applyProjectTransaction({
    root,
    files: [
      { path: "AGENTS.md", content: "after\n", expected: "before\n" },
      { path: ".codex-agent/context/index.json", content: indexContent, expected: indexContent }
    ],
    preconditions: [{ path: "README.md", expected: "guarded\n" }]
  });
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), "after\n");
  assert.equal(fs.readFileSync(indexPath, "utf8"), indexContent);
  assert.equal(applied.files.at(-1), ".codex-agent/context/index.json");
  assert.equal(applied.backedUp.length, 1);
  assert.equal(fs.readFileSync(path.join(root, applied.backedUp[0]), "utf8"), "before\n");
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
  assert.deepEqual(fs.readdirSync(path.join(root, ".codex-agent", ".transactions")), []);

  assert.throws(() => applyProjectTransaction({
    root,
    files: [
      { path: "AGENTS.md", content: "again\n", expected: "stale\n" },
      { path: ".codex-agent/context/index.json", content: indexContent, expected: indexContent }
    ]
  }), /precondition changed/);
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), "after\n");

  fs.writeFileSync(path.join(root, "README.md"), "changed concurrently\n");
  assert.throws(() => applyProjectTransaction({
    root,
    files: [{ path: ".codex-agent/context/index.json", content: indexContent, expected: indexContent }],
    preconditions: [{ path: "README.md", expected: "guarded\n" }]
  }), /precondition changed: README\.md/);
});

test("a dead local owner recovers an interrupted project lifecycle transaction before the next writer", (t) => {
  const root = temporaryRoot(t);
  const contextRoot = writeCatalog(root, ".codex-agent/context");
  const indexPath = path.join(contextRoot, "index.json");
  const indexContent = fs.readFileSync(indexPath, "utf8");
  const nextIndex = JSON.parse(indexContent);
  nextIndex.entries[0].summary = "Project transaction index promotion must remain the final commit boundary.";
  const nextIndexContent = `${JSON.stringify(nextIndex, null, 2)}\n`;
  const agentsPath = path.join(root, "AGENTS.md");
  fs.writeFileSync(agentsPath, "before\n");
  const moduleUrl = new URL("../plugins/codex-agent/scripts/lib/context-transaction.mjs", import.meta.url).href;
  const childSource = `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    import path from "node:path";
    const root = ${JSON.stringify(root)};
    const rename = fs.renameSync;
    fs.renameSync = (source, target) => {
      rename(source, target);
      if (String(source).includes(path.sep + "staged" + path.sep)
        && String(target).endsWith("AGENTS.md")) process.exit(96);
    };
    syncBuiltinESMExports();
    const { applyProjectTransaction } = await import(${JSON.stringify(moduleUrl)});
    applyProjectTransaction({
      root,
      files: [
        { path: "AGENTS.md", content: "after\\n", expected: "before\\n" },
        { path: ".codex-agent/context/index.json", content: ${JSON.stringify(nextIndexContent)}, expected: ${JSON.stringify(indexContent)} }
      ]
    });
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", childSource], { encoding: "utf8" });
  assert.equal(child.status, 96, child.stderr);
  assert.equal(fs.readFileSync(agentsPath, "utf8"), "after\n");
  assert.equal(fs.readFileSync(indexPath, "utf8"), indexContent);

  let recovery;
  withContextLock({ root }, ({ recoveredTransactions }) => { recovery = recoveredTransactions; });

  assert.equal(recovery[0].outcome, "rolled-back");
  assert.equal(fs.readFileSync(agentsPath, "utf8"), "before\n");
  assert.equal(fs.readFileSync(indexPath, "utf8"), indexContent);
  assert.deepEqual(fs.readdirSync(path.join(root, ".codex-agent", ".transactions")), []);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", ".locks", "context.lock")), false);
});

test("canonical context save promotes Markdown and index together", (t) => {
  const root = temporaryRoot(t);
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  const result = saveContextProposal({ root, proposal: proposal(), apply: true });
  const document = path.join(root, ".codex-agent", "context", ...result.path.split("/"));
  const index = JSON.parse(fs.readFileSync(path.join(root, ".codex-agent", "context", "index.json"), "utf8"));
  assert.equal(result.applied, true);
  assert.equal(fs.existsSync(document), true);
  assert.equal(index.entries.some((entry) => entry.id === result.id && entry.path === result.path), true);
  assert.equal(resolveContextCatalog({ root }).state, "canonical-only");
});

test("Unicode-only proposal titles receive a deterministic non-empty slug", (t) => {
  const root = temporaryRoot(t);
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  const unicodeProposal = { ...proposal(), title: "上下文事务边界规则" };
  const first = saveContextProposal({ root, proposal: unicodeProposal });
  const second = saveContextProposal({ root, proposal: unicodeProposal });
  assert.equal(first.path, second.path);
  assert.match(first.path, /^constraints\/u-[a-f0-9]{16}\.md$/);
  assert.match(first.id, /^constraint-u-[a-f0-9]{16}$/);

  const applied = saveContextProposal({ root, proposal: unicodeProposal, apply: true });
  assert.equal(applied.applied, true);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", "context", ...applied.path.split("/"))), true);
});

test("context proposal evidence rejects internal and external symbolic links", (t) => {
  const root = temporaryRoot(t);
  const externalRoot = temporaryRoot(t);
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(path.join(root, "evidence.md"), "# Evidence\n");
  fs.writeFileSync(path.join(externalRoot, "outside.md"), "# Outside\n");
  fs.symlinkSync("evidence.md", path.join(root, "internal-link.md"));
  fs.symlinkSync(path.join(externalRoot, "outside.md"), path.join(root, "external-link.md"));

  for (const evidencePath of ["internal-link.md", "external-link.md"]) {
    const candidate = {
      ...proposal(),
      evidence: [{ path: evidencePath, note: "A symbolic link is not durable repository evidence." }]
    };
    const validation = validateContextProposal(candidate, { root });
    assert.equal(validation.ok, false);
    assert.equal(validation.errors.some((error) => error.includes("symbolic link")), true);
  }
});

test("context proposal previews include diff lines beyond the former truncation limit", (t) => {
  const root = temporaryRoot(t);
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  const tail = Array.from({ length: 121 }, (_, index) => `stable-line-${index}`).join("\n");
  const initial = { ...proposal(), contentMarkdown: `first-line-before\n${tail}` };
  saveContextProposal({ root, proposal: initial, apply: true });
  const updated = { ...initial, contentMarkdown: `first-line-after\n${tail}` };

  const preview = saveContextProposal({ root, proposal: updated, update: true });
  assert.match(preview.diff, /stable-line-120/);
});

test("navigation migration reports candidate-to-candidate ID collisions in preview", (t) => {
  const root = temporaryRoot(t);
  const source = temporaryRoot(t);
  fs.writeFileSync(path.join(source, "navigation.md"), "# Navigation\n");
  const sharedPrefix = "a".repeat(70);
  const names = [`${sharedPrefix}-one.md`, `${sharedPrefix}-two.md`];
  fs.writeFileSync(path.join(source, names[0]), "# First rule\n\nKeep the first durable rule.\n");
  fs.writeFileSync(path.join(source, names[1]), "# Second rule\n\nKeep the second durable rule.\n");

  const preview = migrateNavigationContext({ root, source });
  assert.deepEqual(new Set(preview.conflicts), new Set(names.map((name) => `migrated/${name}`)));
  assert.equal(preview.changes.filter((change) => change.status === "conflict").length, 2);
  assert.equal(preview.changes.every((change) => change.diff.includes("same context ID")), true);
  assert.equal(fs.existsSync(path.join(root, ".codex-agent", "context")), false);
});

test("navigation migration conflict previews include diff lines beyond the former truncation limit", (t) => {
  const root = temporaryRoot(t);
  const source = temporaryRoot(t);
  fs.writeFileSync(path.join(source, "navigation.md"), "# Navigation\n");
  const guidePath = path.join(source, "guide.md");
  const tail = Array.from({ length: 81 }, (_, index) => `stable-navigation-line-${index}`).join("\n");
  fs.writeFileSync(guidePath, `# Guide\n\nfirst-line-before\n${tail}\n`);
  migrateNavigationContext({ root, source, apply: true });
  fs.writeFileSync(guidePath, `# Guide\n\nfirst-line-after\n${tail}\n`);

  const preview = migrateNavigationContext({ root, source });
  const conflict = preview.changes.find((change) => change.path === "migrated/guide.md");
  assert.equal(conflict.status, "conflict");
  assert.match(conflict.diff, /stable-navigation-line-80/);
});
