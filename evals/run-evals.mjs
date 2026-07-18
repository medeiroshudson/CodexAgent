#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRouting } from "../packages/codex-agent-cli/src/core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = evaluateRouting({ root });

if (!result.ok) {
  for (const failure of result.failures) process.stderr.write(`error: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Validated ${result.scenarios} routing scenarios across ${result.skills} skills.\n`);
  process.stdout.write("Use the official plugin-eval benchmark flow for model-based activation and token measurements.\n");
}
