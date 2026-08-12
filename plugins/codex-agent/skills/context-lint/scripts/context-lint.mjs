#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getReadableContextCatalog, resolveContextCatalog } from "../../../scripts/lib/context-catalog.mjs";
import { assertNoSymlink, listTreeFiles, sha256, slash } from "../../../scripts/lib/safe-files.mjs";

const healthOrder = ["conflict", "orphan", "duplicate", "insufficient-evidence", "review-due", "healthy"];
const normalize = (value) => String(value ?? "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
const findingSort = (left, right) => (left.path ?? "").localeCompare(right.path ?? "")
  || (left.id ?? "").localeCompare(right.id ?? "") || left.code.localeCompare(right.code);

const healthFor = (reasons) => healthOrder.find((health) => reasons.includes(health)) ?? "healthy";

export const lintContext = ({ root, strict = false, now = new Date() }) => {
  const checkedAt = now.toISOString();
  const resolution = resolveContextCatalog({ root });
  const findings = [];
  if (["invalid", "both-divergent"].includes(resolution.state)) {
    for (const message of resolution.errors.length ? resolution.errors : resolution.warnings) {
      findings.push({ severity: "error", code: "catalog-invalid", message });
    }
    return {
      ok: false, healthy: false, checkedAt, state: resolution.state,
      summary: { entries: 0, healthy: 0, findings: findings.length, errors: findings.length, warnings: 0 },
      entries: [], findings: findings.sort(findingSort)
    };
  }

  const catalog = getReadableContextCatalog({ root });
  if (!catalog.index) {
    findings.push({ severity: "warning", code: "catalog-missing", message: "context index not found" });
    return {
      ok: !strict, healthy: false, checkedAt, state: catalog.state,
      summary: { entries: 0, healthy: 0, findings: 1, errors: 0, warnings: 1 },
      entries: [], findings
    };
  }

  const reasonsById = new Map(catalog.index.entries.map((entry) => [entry.id, new Set()]));
  const add = (severity, code, entry, message, health = null) => {
    findings.push({ severity, code, ...(entry?.id ? { id: entry.id } : {}), ...(entry?.path ? { path: entry.path } : {}), message });
    if (health && entry?.id) reasonsById.get(entry.id)?.add(health);
  };

  const today = checkedAt.slice(0, 10);
  for (const entry of catalog.index.entries) {
    if (catalog.index.version === 1 || !entry.evidence?.length) {
      add("warning", "evidence-missing", entry, "entry has no machine-verifiable provenance", "insufficient-evidence");
    }
    if (entry.status === "conflicted") add("error", "lifecycle-conflicted", entry, "entry is marked conflicted", "conflict");
    if (entry.reviewAfter && entry.reviewAfter <= today) add("warning", "review-due", entry, `entry review was due on ${entry.reviewAfter}`, "review-due");
    const localEvidence = (entry.evidence ?? []).filter((evidence) => ["repository", "decision"].includes(evidence.type));
    if (entry.evidence?.length && !localEvidence.length) {
      add("warning", "evidence-derived-only", entry, "external evidence alone cannot establish repository-specific context", "insufficient-evidence");
    }
    for (const evidence of localEvidence) {
      const target = path.resolve(catalog.root, evidence.locator);
      const relative = slash(path.relative(catalog.root, target));
      if (relative.startsWith("../") || path.isAbsolute(relative)) {
        add("error", "evidence-escape", entry, `evidence escapes repository: ${evidence.locator}`, "insufficient-evidence");
        continue;
      }
      if (relative === ".codex-agent/context" || relative.startsWith(".codex-agent/context/")
        || relative === ".agents/context" || relative.startsWith(".agents/context/")) {
        add("warning", "evidence-derived", entry, `evidence points to derived context: ${evidence.locator}`, "insufficient-evidence");
        continue;
      }
      let stat;
      try { assertNoSymlink(catalog.root, target, `context evidence ${evidence.locator}`); }
      catch {
        add("error", "evidence-invalid-file", entry, `evidence traverses a symbolic link: ${evidence.locator}`, "insufficient-evidence");
        continue;
      }
      try { stat = fs.lstatSync(target); } catch { stat = null; }
      if (!stat) add("error", "evidence-missing-file", entry, `evidence file is missing: ${evidence.locator}`, "insufficient-evidence");
      else if (stat.isSymbolicLink() || !stat.isFile()) add("error", "evidence-invalid-file", entry, `evidence is not a regular file: ${evidence.locator}`, "insufficient-evidence");
      else if (sha256(fs.readFileSync(target)) !== evidence.sha256) add("error", "evidence-digest-mismatch", entry, `evidence changed: ${evidence.locator}`, "conflict");
    }
    for (const relatedId of entry.related ?? []) {
      const related = catalog.index.entries.find((item) => item.id === relatedId);
      if (related && !(related.related ?? []).includes(entry.id)) add("warning", "relation-asymmetric", entry, `related link is not reciprocal: ${relatedId}`, "conflict");
    }
  }

  const summaryOwners = new Map();
  const contentOwners = new Map();
  for (const entry of catalog.index.entries.filter((item) => item.status !== "superseded")) {
    const summaryKey = normalize(entry.summary);
    const contentKey = sha256(fs.readFileSync(path.join(catalog.contextRoot, ...entry.path.split("/"))));
    for (const [key, owners, label] of [[summaryKey, summaryOwners, "summary"], [contentKey, contentOwners, "content"]]) {
      const owner = owners.get(key);
      if (owner && !(entry.supersedes ?? []).includes(owner.id) && !(owner.supersedes ?? []).includes(entry.id)) {
        add("warning", `duplicate-${label}`, entry, `${label} duplicates ${owner.id}`, "duplicate");
        reasonsById.get(owner.id)?.add("duplicate");
      } else if (!owner) owners.set(key, entry);
    }
  }

  const indexed = new Set(catalog.index.entries.map((entry) => entry.path));
  for (const file of listTreeFiles(catalog.contextRoot).filter((item) => item.relative.toLowerCase().endsWith(".md"))) {
    if (!indexed.has(file.relative)) add("warning", "orphan-document", { path: file.relative }, "Markdown document is not indexed");
  }

  const entries = catalog.index.entries.map((entry) => {
    const reasons = [...reasonsById.get(entry.id)].sort((left, right) => healthOrder.indexOf(left) - healthOrder.indexOf(right));
    return { id: entry.id, path: entry.path, lifecycle: entry.status ?? "active", health: healthFor(reasons), reasons };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const sortedFindings = findings.sort(findingSort);
  const errors = sortedFindings.filter((finding) => finding.severity === "error").length;
  const warnings = sortedFindings.filter((finding) => finding.severity === "warning").length;
  const healthy = entries.length > 0 && entries.every((entry) => entry.health === "healthy") && warnings === 0 && errors === 0;
  return {
    ok: errors === 0 && (!strict || warnings === 0), healthy, checkedAt, state: catalog.state,
    summary: { entries: entries.length, healthy: entries.filter((entry) => entry.health === "healthy").length, findings: sortedFindings.length, errors, warnings },
    entries, findings: sortedFindings
  };
};

const option = (args, name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

export const main = (args = process.argv.slice(2)) => {
  const result = lintContext({ root: path.resolve(option(args, "--root", process.cwd())), strict: args.includes("--strict") });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
};

if (process.argv[1] && path.basename(process.argv[1]) === "context-lint.mjs" && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
