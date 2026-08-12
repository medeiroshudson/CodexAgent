#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { getReadableContextCatalog } from "../../../scripts/lib/context-catalog.mjs";

const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
const fieldWeights = { aliases: 16, tags: 14, id: 12, path: 12, scope: 10, kind: 10, summary: 6 };

const normalize = (value) => String(value ?? "")
  .normalize("NFKD")
  .replace(/\p{M}+/gu, "")
  .toLocaleLowerCase("en-US");

const tokens = (value) => normalize(value).match(/[\p{L}\p{N}_]+/gu)?.filter((term) => term.length > 1) ?? [];

const projectedEntry = ({ entry, absolutePath, score, matches, reasons, reviewDue, indexVersion }) => ({
  id: entry.id,
  path: entry.path,
  summary: entry.summary,
  tags: entry.tags,
  priority: entry.priority,
  ...(entry.kind ? { kind: entry.kind } : {}),
  ...(entry.scope ? { scope: entry.scope } : {}),
  ...(entry.confidence ? { confidence: entry.confidence } : {}),
  status: entry.status ?? "active",
  health: indexVersion === 1 ? "unknown" : reviewDue ? "review-due" : "healthy",
  valid: true,
  score,
  matches,
  reasons,
  absolutePath
});

export const selectContext = ({ root, query = "", limit = 5, now = new Date() }) => {
  const catalog = getReadableContextCatalog({ root });
  const normalizedQuery = normalize(query).trim();
  const normalizedLimit = Math.min(20, Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5);
  if (!catalog.index) {
    return {
      root: catalog.root,
      query: normalizedQuery,
      state: catalog.state,
      source: null,
      warnings: [...catalog.warnings, "context index not found"],
      entries: []
    };
  }

  const queryTerms = new Set(tokens(normalizedQuery));
  const warnings = [...catalog.warnings];
  const candidates = [];
  for (const entry of catalog.index.entries) {
    if (entry.status === "superseded") continue;
    if (entry.status === "conflicted") {
      warnings.push(`context entry skipped because it is conflicted: ${entry.id}`);
      continue;
    }
    const fields = {
      aliases: entry.aliases ?? [],
      tags: entry.tags ?? [],
      id: [entry.id],
      path: [entry.path],
      scope: [entry.scope],
      kind: [entry.kind],
      summary: [entry.summary]
    };
    const matchedTerms = new Set();
    const reasons = [];
    let score = 0;
    for (const [field, values] of Object.entries(fields)) {
      const fieldTerms = new Set(values.flatMap(tokens));
      const matched = [...queryTerms].filter((term) => fieldTerms.has(term)).sort();
      if (!matched.length) continue;
      matched.forEach((term) => matchedTerms.add(term));
      const contribution = matched.length * fieldWeights[field];
      score += contribution;
      reasons.push({ field, terms: matched, score: contribution });
    }
    if (!matchedTerms.size) continue;
    const reviewDue = Boolean(entry.reviewAfter && entry.reviewAfter <= now.toISOString().slice(0, 10));
    if (reviewDue) {
      score -= 15;
      reasons.push({ field: "health", terms: ["review-due"], score: -15 });
    }
    candidates.push(projectedEntry({
      entry,
      absolutePath: path.join(catalog.contextRoot, ...entry.path.split("/")),
      score,
      matches: [...matchedTerms].sort(),
      reasons,
      reviewDue,
      indexVersion: catalog.index.version
    }));
  }

  const selected = candidates
    .sort((left, right) => right.score - left.score
      || (priorityWeight[right.priority] ?? 0) - (priorityWeight[left.priority] ?? 0)
      || left.path.localeCompare(right.path))
    .slice(0, normalizedLimit);

  return {
    root: catalog.root,
    query: normalizedQuery,
    state: catalog.state,
    source: catalog.source,
    contextRoot: catalog.contextRoot,
    warnings,
    entries: selected
  };
};

const readArg = (args, name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

export const main = (args = process.argv.slice(2)) => {
  const result = selectContext({
    root: path.resolve(readArg(args, "--root", process.cwd())),
    query: readArg(args, "--query", ""),
    limit: Number.parseInt(readArg(args, "--limit", "5"), 10)
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
