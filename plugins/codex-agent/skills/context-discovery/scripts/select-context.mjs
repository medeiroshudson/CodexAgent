#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const root = path.resolve(readArg("--root", process.cwd()));
const query = readArg("--query", "").toLowerCase();
const limit = Number.parseInt(readArg("--limit", "5"), 10);
const contextRoot = path.join(root, ".agents", "context");
const indexPath = path.join(contextRoot, "index.json");

if (!fs.existsSync(indexPath)) {
  process.stdout.write(JSON.stringify({ root, entries: [], warning: "context index not found" }, null, 2));
  process.exit(0);
}

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const terms = new Set(query.split(/[^a-z0-9_-]+/).filter((term) => term.length > 2));
const priorityWeight = { critical: 30, high: 20, medium: 10, low: 0 };

const entries = (index.entries ?? []).map((entry) => {
  const candidate = path.resolve(contextRoot, entry.path ?? "");
  const insideContext = candidate === contextRoot || candidate.startsWith(`${contextRoot}${path.sep}`);
  if (!insideContext) return { ...entry, valid: false, score: -1, reason: "path escapes context root" };

  const haystack = [entry.id, entry.summary, ...(entry.tags ?? [])].join(" ").toLowerCase();
  const matches = [...terms].filter((term) => haystack.includes(term));
  const score = (priorityWeight[entry.priority] ?? 0) + matches.length * 10;
  return {
    ...entry,
    valid: fs.existsSync(candidate),
    score,
    matches,
    absolutePath: candidate
  };
});

const selected = entries
  .filter((entry) => entry.valid && (entry.priority === "critical" || entry.matches.length > 0))
  .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
  .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 5);

process.stdout.write(JSON.stringify({ root, query, entries: selected }, null, 2));

