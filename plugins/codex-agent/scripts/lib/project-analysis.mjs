import fs from "node:fs";
import path from "node:path";

const ANALYSIS_VERSION = 2;
const slash = (value) => value.split(path.sep).join("/");
const unique = (items) => [...new Set(items.filter(Boolean))];
const relative = (root, file) => slash(path.relative(root, file));
const signal = (value, evidence = [], confidence = "unknown", status = "unknown") => ({ value, evidence: unique(evidence), confidence, status });
const detected = (value, evidence, confidence = "high") => signal(value, evidence, confidence, "detected");
const inferred = (value, evidence, confidence = "medium") => signal(value, evidence, confidence, "inferred");
const unknown = (empty) => signal(empty, [], "unknown", "unknown");

const readText = (file, limit = 2 * 1024 * 1024) => {
  try {
    if (fs.statSync(file).size > limit) return "";
    return fs.readFileSync(file, "utf8");
  } catch { return ""; }
};
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g)].map((match) => [match[1].toLowerCase(), match[2]]));
const major = (version) => String(version ?? "").replace(/^[^\d]*/, "").match(/^\d+/)?.[0] ?? null;
const escapeRegex = (value) => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
const globRegex = (pattern) => {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") { source += ".*"; index += 1; }
    else if (character === "*") source += "[^/]*";
    else if (character === "?") source += "[^/]";
    else source += escapeRegex(character);
  }
  return source;
};

const parseIgnoreRules = (root) => [".gitignore", ".tfignore", ".ignore"].flatMap((name) => {
  const file = path.join(root, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return [];
  return readText(file).split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const negated = trimmed.startsWith("!");
    let body = (negated ? trimmed.slice(1) : trimmed).replace(/\\/g, "/");
    const anchored = body.startsWith("/");
    if (anchored) body = body.slice(1);
    const directory = body.endsWith("/");
    body = body.replace(/\/$/, "");
    if (!body) return [];
    const prefix = anchored || body.includes("/") ? "^" : "(?:^|/)";
    return [{ source: name, negated, regex: new RegExp(`${prefix}${globRegex(body)}${directory ? "(?:/|$)" : "$"}`, "i") }];
  });
});

const rootFiles = (root) => fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
const expandRootGlob = (root, pattern) => {
  const normalized = slash(pattern).replace(/^\.\//, "").replace(/\/$/, "");
  const segments = normalized.split("/");
  const results = [];
  const visit = (directory, index) => {
    if (index === segments.length) { results.push(relative(root, directory) || "."); return; }
    const segment = segments[index];
    if (!segment.includes("*") && !segment.includes("?")) { visit(path.join(directory, segment), index + 1); return; }
    if (!fs.existsSync(directory)) return;
    const matcher = new RegExp(`^${globRegex(segment)}$`);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory() && matcher.test(entry.name)) visit(path.join(directory, entry.name), index + 1);
  };
  visit(root, 0);
  return results.filter((item) => fs.existsSync(path.join(root, item)));
};

const rootContainerMembers = (root) => {
  const members = [];
  const evidence = [];
  const add = (member, source) => {
    const normalized = slash(member).replace(/^\.\//, "").replace(/\/$/, "");
    if (!normalized || normalized.startsWith("../") || path.isAbsolute(normalized)) return;
    for (const expanded of normalized.includes("*") || normalized.includes("?") ? expandRootGlob(root, normalized) : [normalized]) {
      if (!members.includes(expanded)) members.push(expanded);
    }
    evidence.push(source);
  };
  for (const file of rootFiles(root)) {
    const absolute = path.join(root, file);
    const lower = file.toLowerCase();
    const content = readText(absolute);
    if (lower.endsWith(".sln")) for (const match of content.matchAll(/^Project\("[^"]+"\)\s*=\s*"[^"]+",\s*"([^"]+\.(?:cs|fs|vb)proj)"/gmi)) add(path.dirname(match[1].replace(/\\/g, "/")), file);
    else if (lower === "package.json") {
      const manifest = readJson(absolute);
      const workspaces = Array.isArray(manifest?.workspaces) ? manifest.workspaces : manifest?.workspaces?.packages;
      for (const member of workspaces ?? []) add(member, "package.json#workspaces");
    } else if (lower === "cargo.toml") {
      const workspaceBlock = content.match(/^\s*\[workspace\]\s*$([\s\S]*?)(?=^\s*\[|(?![\s\S]))/m)?.[1] ?? "";
      const workspace = workspaceBlock.match(/members\s*=\s*\[([\s\S]*?)\]/m)?.[1] ?? "";
      for (const match of workspace.matchAll(/["']([^"']+)["']/g)) add(match[1], "Cargo.toml#workspace.members");
    } else if (lower === "go.work") {
      for (const match of content.matchAll(/^\s*use\s+([^\s()]+)\s*$/gm)) add(match[1], "go.work#use");
      for (const block of content.matchAll(/^\s*use\s*\(\s*$([\s\S]*?)^\s*\)\s*$/gm)) {
        for (const line of block[1].split(/\r?\n/)) {
          const member = line.replace(/\/\/.*$/, "").trim();
          if (member) add(member, "go.work#use");
        }
      }
    }
    else if (lower === "pom.xml") for (const match of content.matchAll(/<module>([^<]+)<\/module>/g)) add(match[1], "pom.xml#modules");
    else if (["settings.gradle", "settings.gradle.kts"].includes(lower)) {
      for (const statement of content.matchAll(/^\s*(include|includeBuild)\s*(?:\(([^)]*)\)|(.+))$/gm)) {
        for (const match of (statement[2] ?? statement[3] ?? "").matchAll(/["']:?([^"']+)["']/g)) add(match[1].replace(/:/g, "/"), `${file}#${statement[1]}`);
      }
    }
  }
  return { members: unique(members), evidence: unique(evidence) };
};

const INTERNAL_METADATA = new Set([".agents", ".codex", ".codex-agent", ".git", ".hg", ".opencode", ".svn"]);
const FALLBACK_TRANSIENT = new Set([".cache", ".idea", ".tmp", ".venv", ".vs", "bin", "coverage", "dist", "node_modules", "obj", "testresults"]);
const inventoryRepository = (root, declaredRoots, limit = 50000) => {
  const rules = parseIgnoreRules(root);
  const files = [];
  const excluded = [];
  let truncated = false;
  const declared = unique(declaredRoots.map((item) => slash(item).replace(/^\.\//, "").replace(/\/$/, "")));
  const requiredToReachDeclared = (candidate) => declared.some((item) => candidate === item || item.startsWith(`${candidate}/`));
  const declaredPathPrefixes = (item) => item.split("/").map((_, index, segments) => segments.slice(0, index + 1).join("/"));
  const ruleWouldHideDeclared = (rule, candidate) => declared
    .filter((item) => candidate === item || candidate.startsWith(`${item}/`) || item.startsWith(`${candidate}/`))
    .some((item) => declaredPathPrefixes(item).some((prefix) => rule.regex.test(prefix) || rule.regex.test(`${prefix}/`)));
  const ignoredByRule = (candidate, directory) => {
    let ignored = false;
    let source = null;
    for (const rule of rules) if ((rule.regex.test(candidate) || (directory && rule.regex.test(`${candidate}/`))) && !ruleWouldHideDeclared(rule, candidate)) { ignored = !rule.negated; source = rule.source; }
    return ignored ? source : null;
  };
  const visit = (directory) => {
    if (files.length >= limit) { truncated = true; return; }
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= limit) { truncated = true; break; }
      const absolute = path.join(directory, entry.name);
      const candidate = relative(root, absolute);
      if (entry.isDirectory()) {
        if (INTERNAL_METADATA.has(entry.name.toLowerCase())) continue;
        const requiredPath = requiredToReachDeclared(candidate);
        const ignoreSource = ignoredByRule(candidate, true);
        const fallback = requiredPath ? false : FALLBACK_TRANSIENT.has(entry.name.toLowerCase());
        if (ignoreSource || fallback) { excluded.push({ path: candidate, role: fallback ? "transient" : "ignored", source: ignoreSource ?? "fallback" }); continue; }
        visit(absolute);
      } else if (entry.isFile() && !ignoredByRule(candidate, false)) files.push(absolute);
    }
  };
  visit(root);
  return { files: files.sort(), excluded, truncated, limit };
};

const extensionLanguages = new Map([
  [".js", "JavaScript"], [".mjs", "JavaScript"], [".cjs", "JavaScript"], [".jsx", "JavaScript"], [".ts", "TypeScript"], [".tsx", "TypeScript"],
  [".py", "Python"], [".go", "Go"], [".rs", "Rust"], [".java", "Java"], [".kt", "Kotlin"], [".swift", "Swift"], [".rb", "Ruby"], [".php", "PHP"],
  [".cs", "C#"], [".fs", "F#"], [".vb", "Visual Basic"], [".cpp", "C++"], [".cc", "C++"], [".c", "C"], [".vue", "Vue"], [".svelte", "Svelte"],
  [".cshtml", "Razor"], [".razor", "Razor"], [".css", "CSS"], [".scss", "Sass"]
]);
const classifyNaming = (name) => {
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(name)) return "kebab-case";
  if (/^[a-z][A-Za-z0-9]*$/.test(name) && /[A-Z]/.test(name)) return "camelCase";
  if (/^[A-Z][A-Za-z0-9]*$/.test(name)) return "PascalCase";
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(name)) return "snake_case";
  return null;
};

const dependencyTechnologies = new Map([
  ["next", ["Next.js"]], ["react", ["React"]], ["vue", ["Vue"]], ["@angular/core", ["Angular"]], ["svelte", ["Svelte"]],
  ["@sveltejs/kit", ["SvelteKit"]], ["express", ["Express"]], ["fastify", ["Fastify"]], ["@nestjs/core", ["NestJS"]],
  ["django", ["Django"]], ["flask", ["Flask"]], ["fastapi", ["FastAPI"]], ["spring-boot-starter-web", ["Spring Boot"]],
  ["rails", ["Ruby on Rails"]], ["laravel/framework", ["Laravel"]], ["github.com/gin-gonic/gin", ["Gin"]], ["actix-web", ["Actix Web"]], ["axum", ["Axum"]],
  ["microsoft.aspnet.mvc", ["ASP.NET MVC", "major"]], ["microsoft.aspnet.webapi.core", ["ASP.NET Web API"]],
  ["entityframework", ["Entity Framework", "major"]], ["unity", ["Unity"]], ["topshelf", ["Topshelf"]], ["serilog", ["Serilog"]],
  ["jquery", ["jQuery"]], ["bootstrap", ["Bootstrap", "major"]], ["vitest", ["Vitest"]], ["jest", ["Jest"]], ["pytest", ["pytest"]], ["junit", ["JUnit"]], ["xunit", ["xUnit"]]
]);

const dependencyRecord = (ecosystem, name, version, evidence) => ({ ecosystem, name: String(name), version: String(version ?? ""), evidence });
const parseDependencies = (root, file) => {
  const absolute = path.join(root, file);
  const lower = path.basename(file).toLowerCase();
  const content = readText(absolute);
  const result = [];
  const add = (ecosystem, name, version) => { if (name) result.push(dependencyRecord(ecosystem, name, version, `${file}#${name}`)); };
  if (["package.json", "composer.json"].includes(lower)) {
    const manifest = readJson(absolute);
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "require", "require-dev"]) for (const [name, version] of Object.entries(manifest?.[field] ?? {})) add(lower === "composer.json" ? "composer" : "node", name, version);
  } else if (lower === "packages.config") for (const match of content.matchAll(/<package\b[^>]*>/gi)) { const item = attributes(match[0]); add("nuget", item.id, item.version); }
  else if (lower === "requirements.txt") for (const line of content.split(/\r?\n/)) { const match = line.trim().match(/^([A-Za-z0-9_.-]+)\s*(?:==|~=|>=|<=|>|<)?\s*([^;\s#]*)/); if (match) add("python", match[1], match[2]); }
  else if (lower === "cargo.toml") {
    let section = "";
    for (const line of content.split(/\r?\n/)) {
      const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
      if (header) { section = header[1].toLowerCase(); continue; }
      if (!/(^|\.)dependencies$/.test(section)) continue;
      const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:["']([^"']+)["']|\{[^}]*version\s*=\s*["']([^"']+))/);
      if (match) add("cargo", match[1], match[2] ?? match[3]);
    }
  } else if (lower === "pyproject.toml") {
    let section = "";
    for (const line of content.split(/\r?\n/)) {
      const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
      if (header) { section = header[1].toLowerCase(); continue; }
      if (section === "project") {
        const list = line.match(/^\s*dependencies\s*=\s*\[(.*)\]\s*(?:#.*)?$/);
        for (const item of list?.[1]?.matchAll(/["']([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*([^"']*)["']/g) ?? []) add("python", item[1], item[2]);
      } else if (section === "tool.poetry.dependencies" || section.startsWith("tool.poetry.group.") && section.endsWith(".dependencies")) {
        const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:["']([^"']+)["']|\{[^}]*version\s*=\s*["']([^"']+))/);
        if (match && match[1].toLowerCase() !== "python") add("python", match[1], match[2] ?? match[3]);
      }
    }
  }
  else if (lower === "go.mod") for (const match of content.matchAll(/^\s*([A-Za-z0-9_.\-/]+)\s+v([^\s]+)\s*$/gm)) add("go", match[1], match[2]);
  else if (lower === "pom.xml") for (const match of content.matchAll(/<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?(?:<version>([^<]+)<\/version>)?[\s\S]*?<\/dependency>/gi)) add("maven", match[1], match[2]);
  else if (["build.gradle", "build.gradle.kts"].includes(lower)) for (const match of content.matchAll(/["']([^:"']+):([^:"']+):([^"']+)["']/g)) add("gradle", match[2], match[3]);
  else if (lower === "gemfile" || lower.endsWith(".gemspec")) for (const match of content.matchAll(/\bgem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/g)) add("ruby", match[1], match[2]);
  return result;
};

const manifestKinds = [
  { id: "node", names: ["package.json"], toolchain: "Node package tooling" },
  { id: "dotnet", pattern: /\.(?:cs|fs|vb)proj$/i, toolchain: "MSBuild" },
  { id: "python", names: ["pyproject.toml", "requirements.txt", "setup.py"], toolchain: "Python packaging" },
  { id: "jvm", names: ["pom.xml", "build.gradle", "build.gradle.kts"], toolchain: "JVM build tooling" },
  { id: "go", names: ["go.mod"], toolchain: "Go modules" },
  { id: "rust", names: ["Cargo.toml"], toolchain: "Cargo" },
  { id: "php", names: ["composer.json"], toolchain: "Composer" },
  { id: "ruby", names: ["Gemfile"], pattern: /\.gemspec$/i, toolchain: "Bundler" }
];
const manifestKind = (file) => manifestKinds.find((kind) => kind.names?.some((name) => name.toLowerCase() === path.basename(file).toLowerCase()) || kind.pattern?.test(file));
const resolveUnit = (root, manifest, declaredMembers) => {
  const kind = manifestKind(manifest);
  if (!kind) return null;
  const unitPath = path.posix.dirname(manifest) === "." ? "." : path.posix.dirname(manifest);
  const base = path.basename(manifest).toLowerCase();
  let name = path.posix.basename(unitPath === "." ? root : unitPath);
  if (base === "package.json") name = readJson(path.join(root, manifest))?.name ?? name;
  else if (/\.(?:cs|fs|vb)proj$/i.test(manifest)) name = path.basename(manifest, path.extname(manifest));
  else if (base === "go.mod") name = readText(path.join(root, manifest)).match(/^module\s+(.+)$/m)?.[1] ?? name;
  return { name, path: unitPath, kind: kind.id, manifest, declared: declaredMembers.includes(unitPath), evidence: [manifest] };
};
const belongsToUnit = (file, unit) => unit.path === "." || file === unit.path || file.startsWith(`${unit.path}/`);
const isVendoredAsset = (file) => /(^|\/)(?:vendor|third[_-]?party|node_modules)(\/|$)|\.min\.(?:js|css)$/i.test(file)
  || /(^|\/)scripts\/(?:tinymce|bootstrap|jquery|modernizr|respond)(\/|$)/i.test(file)
  || /(^|\/)content\/(?:bootstrap|tinymce)(\/|$)/i.test(file);

const targetFramework = (value) => {
  const target = String(value ?? "").trim().replace(/^v/i, "");
  if (/^\d+(?:\.\d+)+$/.test(target)) return `.NET Framework ${target}`;
  const legacy = target.match(/^net(\d)(\d)(\d?)$/i);
  if (legacy && Number(legacy[1]) <= 4) return `.NET Framework ${legacy[1]}.${legacy[2]}${legacy[3] ? `.${legacy[3]}` : ""}`;
  const standard = target.match(/^netstandard(\d+)\.(\d+)/i);
  if (standard) return `.NET Standard ${standard[1]}.${standard[2]}`;
  const modern = target.match(/^net(\d+)(?:\.(\d+))?/i);
  return modern ? `.NET ${modern[1]}${modern[2] ? `.${modern[2]}` : ""}` : null;
};

const scriptCommand = (manager, name) => {
  if (manager === "npm" && name === "test") return "npm test";
  if (manager === "yarn") return `yarn ${name}`;
  return `${manager} run ${name}`;
};

export const detectorRegistry = Object.freeze(manifestKinds.map((detector) => Object.freeze({ ...detector })));

export const analyzeRepository = ({ root, scanLimit = 50000 }) => {
  if (!Number.isSafeInteger(scanLimit) || scanLimit < 1) throw new Error("scanLimit must be a positive integer");
  const requestedRoot = path.resolve(root);
  if (!fs.existsSync(requestedRoot)) throw new Error(`Project root not found: ${requestedRoot}`);
  const projectRoot = fs.realpathSync(requestedRoot);
  const container = rootContainerMembers(projectRoot);
  const inventory = inventoryRepository(projectRoot, container.members, scanLimit);
  const paths = inventory.files.map((file) => relative(projectRoot, file));
  const pathSet = new Set(paths);
  const manifests = paths.filter((file) => manifestKind(file));
  const units = manifests.map((file) => resolveUnit(projectRoot, file, container.members)).filter(Boolean)
    .filter((unit) => container.members.length === 0 || unit.declared || unit.path === ".")
    .filter((unit, index, all) => all.findIndex((candidate) => candidate.path === unit.path && candidate.kind === unit.kind) === index)
    .sort((left, right) => left.path.localeCompare(right.path));
  const unitFiles = paths.filter((file) => units.length === 0 || units.some((unit) => belongsToUnit(file, unit)));
  const ownedFiles = unitFiles.filter((file) => !isVendoredAsset(file));

  const languageEvidence = new Map();
  for (const file of ownedFiles) {
    const language = extensionLanguages.get(path.extname(file).toLowerCase());
    if (!language) continue;
    const evidence = languageEvidence.get(language) ?? [];
    if (evidence.length < 5) evidence.push(file);
    languageEvidence.set(language, evidence);
  }
  const languages = [...languageEvidence.keys()].sort();

  const toolchainMap = new Map();
  for (const unit of units) {
    const detector = manifestKinds.find((item) => item.id === unit.kind);
    const current = toolchainMap.get(detector.toolchain) ?? [];
    current.push(unit.manifest);
    toolchainMap.set(detector.toolchain, current);
  }
  const lockToolchains = [
    ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "Yarn"], ["bun.lock", "Bun"], ["bun.lockb", "Bun"], ["package-lock.json", "npm"],
    ["uv.lock", "uv"], ["poetry.lock", "Poetry"], ["Pipfile.lock", "Pipenv"], ["Cargo.lock", "Cargo"], ["go.sum", "Go modules"],
    ["composer.lock", "Composer"], ["Gemfile.lock", "Bundler"]
  ];
  for (const [file, name] of lockToolchains) if (pathSet.has(file)) toolchainMap.set(name, unique([...(toolchainMap.get(name) ?? []), file]));
  const packagesConfig = ownedFiles.find((file) => path.basename(file).toLowerCase() === "packages.config");
  if (packagesConfig) toolchainMap.set("NuGet", unique([...(toolchainMap.get("NuGet") ?? []), packagesConfig]));
  const rootPackage = pathSet.has("package.json") ? readJson(path.join(projectRoot, "package.json")) : null;
  if (rootPackage?.packageManager) toolchainMap.set(rootPackage.packageManager.split("@")[0], unique([...(toolchainMap.get(rootPackage.packageManager.split("@")[0]) ?? []), "package.json#packageManager"]));
  const toolchains = [...toolchainMap].map(([name, evidence]) => ({ name, evidence: unique(evidence) })).sort((left, right) => left.name.localeCompare(right.name));

  const dependencyManifests = ownedFiles.filter((file) => ["package.json", "composer.json", "packages.config", "requirements.txt", "cargo.toml", "pyproject.toml", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "gemfile"].includes(path.basename(file).toLowerCase()) || /\.gemspec$/i.test(file));
  const dependencies = dependencyManifests.flatMap((file) => parseDependencies(projectRoot, file));
  const technologyMap = new Map();
  const addTechnology = (name, evidence) => {
    const versioned = name.match(/^(.*)\s+\d+(?:\.\d+)*$/);
    if (versioned) technologyMap.delete(versioned[1]);
    else if ([...technologyMap.keys()].some((item) => item.startsWith(`${name} `) && /^\d/.test(item.slice(name.length + 1)))) return;
    technologyMap.set(name, unique([...(technologyMap.get(name) ?? []), evidence]));
  };
  for (const dependency of dependencies) {
    const mapping = dependencyTechnologies.get(dependency.name.toLowerCase());
    if (!mapping) continue;
    const label = mapping[1] === "major" && major(dependency.version) ? `${mapping[0]} ${major(dependency.version)}` : mapping[0];
    addTechnology(label, dependency.evidence);
  }
  for (const file of unitFiles) {
    if (/(^|\/)jquery-\d+(?:\.\d+)+(?:\.min)?\.js$/i.test(file)) addTechnology("jQuery", file);
    if (/(^|\/)bootstrap(?:\.min)?\.(?:css|js)$/i.test(file)) {
      const detectedMajor = readText(path.join(projectRoot, file)).match(/\bBootstrap\s+v(\d+)/i)?.[1];
      addTechnology(detectedMajor ? `Bootstrap ${detectedMajor}` : "Bootstrap", file);
    }
  }
  for (const unit of units.filter((item) => item.kind === "dotnet")) {
    const content = readText(path.join(projectRoot, unit.manifest));
    for (const match of content.matchAll(/<(TargetFrameworkVersion|TargetFramework|TargetFrameworks)>([^<]+)<\/\1>/gi)) for (const value of match[2].split(";")) {
      const label = targetFramework(value);
      if (label) addTechnology(label, `${unit.manifest}#${match[1]}`);
    }
  }
  const technologies = [...technologyMap].map(([name, evidence]) => ({ name, evidence: unique(evidence) })).sort((left, right) => left.name.localeCompare(right.name));

  const commands = [];
  const scripts = rootPackage?.scripts ?? {};
  for (const name of Object.keys(scripts).sort()) if (/^(?:build|check|dev|install|lint|setup|start|test|typecheck)(?::|$)/.test(name)) {
    const manager = rootPackage.packageManager?.split("@")[0] ?? (pathSet.has("pnpm-lock.yaml") ? "pnpm" : pathSet.has("yarn.lock") ? "yarn" : "npm");
    commands.push({ name, command: scriptCommand(manager, name), source: `package.json#scripts.${name}` });
  }

  const entrypoints = [];
  for (const [field, value] of [["main", rootPackage?.main], ["module", rootPackage?.module]]) if (typeof value === "string") entrypoints.push({ path: value, source: `package.json#${field}` });
  for (const file of ownedFiles.filter((item) => /(^|\/)(?:program\.cs|main\.(?:go|rs|py|js|ts)|global\.asax|app\/page\.(?:jsx?|tsx?))$/i.test(item)).slice(0, 30)) entrypoints.push({ path: file, source: file });

  const testUnits = units.filter((unit) => /(^|[._-])tests?([._-]|$)/i.test(unit.name) || /(^|\/)tests?([/_-]|$)/i.test(unit.path));
  const testFiles = ownedFiles.filter((file) => extensionLanguages.has(path.extname(file).toLowerCase()))
    .filter((file) => testUnits.some((unit) => belongsToUnit(file, unit)) || /(^|\/)(?:__tests__\/|tests?\/|[^/]+\.(?:test|spec)\.[^.]+$)/i.test(file))
    .filter((file) => !isVendoredAsset(file)).slice(0, 40);
  const testConfigs = paths.filter((file) => /(^|\/)(?:vitest|jest|playwright|cypress)[^/]*\.(?:js|mjs|cjs|ts|json)$/i.test(file)).slice(0, 20);

  const namingEvidence = new Map();
  for (const file of ownedFiles.filter((item) => extensionLanguages.has(path.extname(item).toLowerCase()))) {
    const style = classifyNaming(path.basename(file, path.extname(file)));
    if (!style) continue;
    const evidence = namingEvidence.get(style) ?? [];
    evidence.push(file);
    namingEvidence.set(style, evidence);
  }
  const naming = [...namingEvidence].filter(([, evidence]) => evidence.length >= 3).sort((left, right) => right[1].length - left[1].length)[0];
  const ownedRoots = unique(units.map((unit) => unit.path === "." ? "." : unit.path.split("/")[0]));
  const securityEvidence = ownedFiles.filter((file) => /(^|\/)(?:auth|security|permissions?|secrets?|\.env\.example)(\/|\.|$)/i.test(file)).slice(0, 20);
  const boundaryCandidates = { api: ["api", "routes", "controllers"], ui: ["components", "views", "pages", "app"], persistence: ["db", "database", "models", "repositories", "migrations"] };
  const boundaries = Object.fromEntries(Object.entries(boundaryCandidates).map(([kind, candidates]) => {
    const found = unique(ownedFiles.flatMap((file) => {
      const segments = file.split("/");
      const index = segments.findIndex((segment) => candidates.includes(segment.toLowerCase()));
      return index < 0 ? [] : [segments.slice(0, index + 1).join("/")];
    })).sort();
    return [kind, found.length ? detected(found, found.map((item) => `directory:${item}`), "medium") : unknown([])];
  }));
  const ciFiles = paths.filter((file) => file.startsWith(".github/workflows/") || [".gitlab-ci.yml", "Jenkinsfile", "azure-pipelines.yml"].includes(file));
  const deploymentFiles = paths.filter((file) => /(^|\/)(?:Dockerfile|docker-compose\.ya?ml|vercel\.json|netlify\.toml|fly\.toml)$/i.test(file));
  const rootSolution = rootFiles(projectRoot).find((file) => /\.sln$/i.test(file));
  const projectName = rootPackage?.name ?? (rootSolution ? path.basename(rootSolution, path.extname(rootSolution)) : path.basename(projectRoot));
  const projectEvidence = rootPackage?.name ? ["package.json#name"] : rootSolution ? [rootSolution] : ["repository directory name"];

  return {
    $schema: "project-analysis.schema.json",
    version: ANALYSIS_VERSION,
    root: projectRoot,
    project: rootPackage?.name || rootSolution ? detected({ name: projectName, private: Boolean(rootPackage?.private) }, projectEvidence) : inferred({ name: projectName }, projectEvidence, "low"),
    languages: languages.length ? detected(languages, [...languageEvidence.values()].flat(), "high") : unknown([]),
    toolchains: toolchains.length ? detected(toolchains, toolchains.flatMap((item) => item.evidence), "high") : unknown([]),
    technologies: technologies.length ? detected(technologies, technologies.flatMap((item) => item.evidence), "high") : unknown([]),
    commands: commands.length ? detected(commands, commands.map((item) => item.source), "high") : unknown([]),
    units: units.length ? detected(units, unique([...container.evidence, ...units.flatMap((item) => item.evidence)]), container.evidence.length ? "high" : "medium") : unknown([]),
    entrypoints: entrypoints.length ? detected(entrypoints, entrypoints.map((item) => item.source), "high") : unknown([]),
    conventions: {
      sourceLayout: ownedRoots.length ? detected(ownedRoots, units.flatMap((item) => item.evidence), "high") : unknown([]),
      fileNaming: naming ? inferred(naming[0], naming[1].slice(0, 8), "medium") : unknown(null),
      boundaries
    },
    security: securityEvidence.length ? detected(securityEvidence, securityEvidence, "medium") : unknown([]),
    testing: testFiles.length || testConfigs.length || testUnits.length ? detected({ units: testUnits.map((unit) => unit.path), files: testFiles, configs: testConfigs }, unique([...testUnits.flatMap((unit) => unit.evidence), ...testFiles.slice(0, 10), ...testConfigs]), "high") : unknown({ units: [], files: [], configs: [] }),
    ciCd: ciFiles.length || deploymentFiles.length ? detected({ ci: ciFiles, deployment: deploymentFiles }, [...ciFiles, ...deploymentFiles], "high") : unknown({ ci: [], deployment: [] }),
    scan: detected({ files: paths.length, truncated: inventory.truncated, limit: inventory.limit, excluded: inventory.excluded.slice(0, 100) }, unique(["repository directory name", ...parseIgnoreRules(projectRoot).map((rule) => rule.source), ...container.evidence]), inventory.truncated ? "medium" : "high"),
    existingGuidance: fs.existsSync(path.join(projectRoot, "AGENTS.md")) ? detected(true, ["AGENTS.md"], "high") : detected(false, ["AGENTS.md not found"], "high")
  };
};

export { ANALYSIS_VERSION };
