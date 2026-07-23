#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { getReadableContextCatalog } from "../../../scripts/lib/context-catalog.mjs";

const priorityWeight = { critical: 30, high: 20, medium: 10, low: 0 };

export const selectContext = ({ root, query = "", limit = 5 }) => {
  const catalog = getReadableContextCatalog({ root });
  const normalizedQuery = String(query).toLowerCase();
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
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

  const terms = new Set(normalizedQuery.split(/[^a-z0-9_-]+/).filter((term) => term.length > 2));
  const entries = catalog.index.entries.map((entry) => {
    const candidate = path.join(catalog.contextRoot, ...entry.path.split("/"));
    const haystack = [entry.id, entry.summary, ...(entry.tags ?? [])].join(" ").toLowerCase();
    const matches = [...terms].filter((term) => haystack.includes(term));
    const score = (priorityWeight[entry.priority] ?? 0) + matches.length * 10;
    return { ...entry, valid: true, score, matches, absolutePath: candidate };
  });

  const selected = entries
    .filter((entry) => entry.priority === "critical" || entry.matches.length > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, normalizedLimit);

  return {
    root: catalog.root,
    query: normalizedQuery,
    state: catalog.state,
    source: catalog.source,
    contextRoot: catalog.contextRoot,
    warnings: catalog.warnings,
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
