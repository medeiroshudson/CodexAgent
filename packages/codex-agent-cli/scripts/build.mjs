import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(packageRoot, "dist");
const outputFile = path.join(outputDirectory, "codex-agent.mjs");

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

await build({
  entryPoints: [path.join(packageRoot, "bin", "codex-agent.mjs")],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  legalComments: "none"
});

fs.chmodSync(outputFile, 0o755);
