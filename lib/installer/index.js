"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const {
  equal,
  hasManagedBlock,
  mergeConfigFragment,
  removeConfigFragment,
  removeManagedBlock,
  upsertManagedBlock,
} = require("./merge.js");

const SCHEMA_VERSION = 1;
const SUPPORTED_HARNESSES = ["codex", "claude-code"];
const FUTURE_HARNESSES = ["opencode", "pi", "zed"];
const MANIFEST_PATH = ".journal/.install/manifest.json";
const TRANSACTION_PATH = ".journal/.install/transaction.json";
const PROJECT_MARKER_PATH = ".djournal.json";

class InstallerError extends Error {
  constructor(message, code = "INSTALL_ERROR") {
    super(message);
    this.name = "InstallerError";
    this.code = code;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readOptional(file) {
  try { return fs.readFileSync(file); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function parseJson(buffer, label) {
  try { return buffer ? JSON.parse(buffer.toString("utf8")) : {}; }
  catch (error) { throw new InstallerError(`${label} is not valid JSON: ${error.message}`, "INVALID_JSON"); }
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};
  const result = {};
  for (const line of text.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return result;
}

function stringifyFrontmatterValue(value) {
  return /[:#{}\[\],"]|\s/.test(value) ? JSON.stringify(value) : value;
}

function replaceFrontmatterField(text, field, value) {
  if (!text.startsWith("---\n")) throw new InstallerError("work.md is missing frontmatter", "INVALID_JOURNAL");
  const end = text.indexOf("\n---", 4);
  if (end === -1) throw new InstallerError("work.md has unterminated frontmatter", "INVALID_JOURNAL");
  const before = text.slice(0, end);
  const after = text.slice(end);
  const line = `${field}: ${stringifyFrontmatterValue(value)}`;
  const pattern = new RegExp(`^${field}:.*$`, "m");
  const next = pattern.test(before) ? before.replace(pattern, line) : `${before}\n${line}`;
  return `${next}${after}`;
}

function jsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function readJsonFile(file, label) {
  return parseJson(readOptional(file), label);
}

function writeJsonFile(file, value) {
  atomicWrite(file, jsonBuffer(value));
}

function mergePlainObject(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = mergePlainObject(result[key], value);
    } else result[key] = value;
  }
  return result;
}

function djournalHome(options = {}) {
  return path.resolve(options.djournalHome || process.env.DJOURNAL_HOME || path.join(os.homedir(), ".djournal"));
}

function projectKeyFor(target) {
  const base = path.basename(path.resolve(target)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  return `${base}-${sha256(path.resolve(target)).slice(0, 8)}`;
}

function projectStoreFor(target, options = {}) {
  const projectKey = options.projectKey || projectKeyFor(target);
  const root = path.join(djournalHome(options), "projects", projectKey);
  return { projectKey, root, journalRoot: path.join(root, ".journal"), configFile: path.join(root, "config.json") };
}

function resolveProjectStore(target, options = {}) {
  return readProjectMarker(target) || projectStoreFor(target, options);
}

function readProjectMarker(target) {
  const marker = readOptional(resolveWithin(target, PROJECT_MARKER_PATH));
  if (!marker) return null;
  const value = parseJson(marker, PROJECT_MARKER_PATH);
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new InstallerError(`unsupported project marker schema: ${value.schemaVersion}`, "UNSUPPORTED_MARKER");
  }
  if (!value.projectKey || !value.journalStore) {
    throw new InstallerError("project marker is missing projectKey or journalStore", "INVALID_JSON");
  }
  const root = path.resolve(value.journalStore);
  return { projectKey: value.projectKey, root, journalRoot: path.join(root, ".journal"), configFile: path.join(root, "config.json") };
}

function projectContext(target, options = {}) {
  const marker = readProjectMarker(target);
  if (marker) return { ...marker, target, global: true };
  const store = projectStoreFor(target, options);
  if (fs.existsSync(store.configFile) || fs.existsSync(store.journalRoot)) return { ...store, target, global: true };
  return {
    target,
    global: false,
    projectKey: null,
    root: target,
    journalRoot: resolveWithin(target, ".journal"),
    configFile: resolveWithin(target, ".journal/config.json"),
  };
}

function defaultProjectConfig(target, store) {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      id: store.projectKey,
      name: path.basename(target),
      sourcePath: path.resolve(target),
    },
    sync: {
      enabled: false,
      mode: "colocated",
      path: path.resolve(target),
      auto: false,
    },
    sharing: {
      default: "local_only",
      sharedWorkItems: {},
    },
  };
}

function readProjectConfig(context) {
  const config = readJsonFile(context.configFile, context.global ? "config.json" : ".journal/config.json");
  if (!context.global) return config;
  return mergePlainObject(defaultProjectConfig(context.target, context), config);
}

function writeProjectConfig(context, config) {
  if (!context.global) writeJsonFile(context.configFile, config);
  else writeJsonFile(context.configFile, config);
}

function copyDirectoryContents(source, destination, options = {}) {
  if (!fs.existsSync(source)) return [];
  if (fs.lstatSync(source).isSymbolicLink()) throw new InstallerError(`source is a symlink: ${source}`, "UNSAFE_PATH");
  const copied = [];
  for (const relative of listFiles(source)) {
    if (options.exclude?.(relative)) continue;
    const sourceFile = path.join(source, relative);
    const destinationFile = path.join(destination, relative);
    const destinationRoot = path.resolve(destination);
    const resolved = path.resolve(destinationFile);
    if (resolved !== destinationRoot && !resolved.startsWith(`${destinationRoot}${path.sep}`)) {
      throw new InstallerError(`projection escapes target: ${relative}`, "UNSAFE_PATH");
    }
    if (fs.lstatSync(sourceFile).isSymbolicLink()) throw new InstallerError(`source file is a symlink: ${relative}`, "UNSAFE_PATH");
    if (fs.existsSync(destinationFile) && fs.lstatSync(destinationFile).isSymbolicLink()) {
      throw new InstallerError(`projection destination is a symlink: ${relative}`, "UNSAFE_PATH");
    }
    if (!options.dryRun) {
      fs.mkdirSync(path.dirname(destinationFile), { recursive: true });
      fs.copyFileSync(sourceFile, destinationFile);
    }
    copied.push(relative.split(path.sep).join("/"));
  }
  return copied;
}

function resolveWithin(target, relative) {
  if (!relative || path.isAbsolute(relative)) {
    throw new InstallerError(`unsafe destination path: ${relative}`, "UNSAFE_PATH");
  }
  const root = path.resolve(target);
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new InstallerError(`destination escapes target: ${relative}`, "UNSAFE_PATH");
  }
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    throw new InstallerError(`destination is a symlink: ${relative}`, "UNSAFE_PATH");
  }
  let cursor = root;
  for (const part of path.relative(root, path.dirname(resolved)).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
      throw new InstallerError(`destination traverses symlink: ${relative}`, "UNSAFE_PATH");
    }
  }
  return resolved;
}

function listFiles(directory, prefix = "") {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(absolute, relative));
    else if (entry.isFile()) result.push(relative.split(path.sep).join("/"));
  }
  return result;
}

function sourceInventory(sourceRoot) {
  const files = [];
  for (const directory of [".agents/rules", ".agents/skills", ".agents/adapters"]) {
    for (const relative of listFiles(path.join(sourceRoot, directory))) {
      files.push(`${directory}/${relative}`);
    }
  }
  return files.sort();
}

function packageVersion(sourceRoot) {
  return parseJson(fs.readFileSync(path.join(sourceRoot, "package.json")), "package.json").version;
}

function commandExists(command, env = process.env) {
  const pathValue = env.PATH || "";
  const extensions = process.platform === "win32"
    ? (env.PATHEXT || ".EXE;.CMD;.BAT").split(";")
    : [""];
  return pathValue.split(path.delimiter).some((directory) => extensions.some((extension) => {
    const file = path.join(directory, `${command}${extension}`);
    try { fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
  }));
}

function detectHarnesses(target, options = {}) {
  const exists = options.commandExists || commandExists;
  const evidence = {
    codex: exists("codex") || fs.existsSync(path.join(target, ".codex")),
    "claude-code": exists("claude") || fs.existsSync(path.join(target, ".claude")) || fs.existsSync(path.join(target, "CLAUDE.md")),
    opencode: exists("opencode") || fs.existsSync(path.join(target, ".opencode")) || fs.existsSync(path.join(target, "opencode.json")),
    pi: exists("pi") || fs.existsSync(path.join(target, ".pi")),
    zed: exists("zed") || fs.existsSync(path.join(target, ".zed")),
  };
  return {
    supported: SUPPORTED_HARNESSES.filter((name) => evidence[name]),
    future: FUTURE_HARNESSES.filter((name) => evidence[name]),
    evidence,
  };
}

function normalizeHarness(name) {
  if (name === "claude") return "claude-code";
  return name;
}

async function selectHarnesses(options, detected) {
  if (options.instructionsOnly) return [];
  if (options.all) return [...SUPPORTED_HARNESSES];
  if (options.harnesses?.length) {
    const selected = [...new Set(options.harnesses.map(normalizeHarness))];
    const invalid = selected.filter((name) => !SUPPORTED_HARNESSES.includes(name));
    if (invalid.length) throw new InstallerError(`unsupported harness: ${invalid.join(", ")}`, "UNSUPPORTED_HARNESS");
    return selected;
  }
  if (detected.supported.length <= 1) return [...detected.supported];
  if (!options.interactive) {
    throw new InstallerError("multiple harnesses detected; pass --harness, --all, or --instructions-only", "HARNESS_SELECTION_REQUIRED");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Select harnesses (${detected.supported.join(", ")}): `);
  rl.close();
  const selected = answer.split(",").map((value) => normalizeHarness(value.trim())).filter(Boolean);
  const invalid = selected.filter((name) => !detected.supported.includes(name));
  if (!selected.length || invalid.length) throw new InstallerError("invalid harness selection", "HARNESS_SELECTION_REQUIRED");
  return [...new Set(selected)];
}

function loadManifest(target) {
  const buffer = readOptional(resolveWithin(target, MANIFEST_PATH));
  if (!buffer) return null;
  const manifest = parseJson(buffer, MANIFEST_PATH);
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new InstallerError(`unsupported manifest schema: ${manifest.schemaVersion}`, "UNSUPPORTED_MANIFEST");
  }
  return manifest;
}

function recordMap(manifest) {
  return new Map((manifest?.files || []).map((record) => [record.path, record]));
}

function operation(target, relative, next) {
  return { path: relative, absolute: resolveWithin(target, relative), next: next === null ? null : Buffer.from(next) };
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

function cleanupEmpty(directory, stop) {
  let current = directory;
  const boundary = path.resolve(stop);
  while (current.startsWith(boundary) && current !== boundary) {
    try { fs.rmdirSync(current); } catch { break; }
    current = path.dirname(current);
  }
}

function recoverTransaction(target) {
  const file = resolveWithin(target, TRANSACTION_PATH);
  const buffer = readOptional(file);
  if (!buffer) return false;
  const transaction = parseJson(buffer, TRANSACTION_PATH);
  for (const snapshot of [...transaction.snapshots].reverse()) {
    const absolute = resolveWithin(target, snapshot.path);
    if (snapshot.existed) atomicWrite(absolute, Buffer.from(snapshot.original, "base64"));
    else {
      try { fs.unlinkSync(absolute); } catch (error) { if (error.code !== "ENOENT") throw error; }
      cleanupEmpty(path.dirname(absolute), target);
    }
  }
  fs.unlinkSync(file);
  cleanupEmpty(path.dirname(file), target);
  return true;
}

function applyTransaction(target, operations, options = {}) {
  if (options.dryRun) return;
  recoverTransaction(target);
  const transactionFile = resolveWithin(target, TRANSACTION_PATH);
  const snapshots = operations.map((item) => {
    const original = readOptional(item.absolute);
    return { path: item.path, existed: original !== null, original: original?.toString("base64") || "" };
  });
  atomicWrite(transactionFile, jsonBuffer({ schemaVersion: 1, snapshots }));
  let applied = 0;
  try {
    for (const item of operations) {
      if (item.next === null) {
        try { fs.unlinkSync(item.absolute); } catch (error) { if (error.code !== "ENOENT") throw error; }
      } else atomicWrite(item.absolute, item.next);
      applied++;
      if (options.failAfter && applied >= options.failAfter) throw new Error("injected transaction failure");
    }
    fs.unlinkSync(transactionFile);
    cleanupEmpty(path.dirname(transactionFile), target);
  } catch (error) {
    recoverTransaction(target);
    throw error;
  }
}

function markdownRecord(target, relative, body, oldRecord, harness) {
  const absolute = resolveWithin(target, relative);
  const original = readOptional(absolute);
  const current = original?.toString("utf8") || "";
  if (oldRecord) {
    let present;
    try { present = hasManagedBlock(current); }
    catch (error) {
      throw new InstallerError(`managed block is invalid: ${relative}: ${error.message}`, "ASSET_CONFLICT");
    }
    if (!present) throw new InstallerError(`managed block is missing: ${relative}`, "ASSET_CONFLICT");
  }
  const next = Buffer.from(upsertManagedBlock(current, body));
  return {
    op: operation(target, relative, next),
    record: {
      path: relative,
      mode: "markdown_block",
      harness,
      created: oldRecord?.created ?? original === null,
      installedHash: sha256(next),
    },
  };
}

function journalAccessFragment(harness, store) {
  if (harness !== "claude-code") return {};
  const commands = ["status", "doctor", "config", "share", "sync"];
  return {
    permissions: {
      additionalDirectories: [store.root],
      allow: commands.flatMap((command) => [
        `Bash(journal ${command}:*)`,
        `Bash(djournal ${command}:*)`,
      ]),
    },
  };
}

function jsonRecord(target, relative, fragment, oldRecord, harness) {
  const absolute = resolveWithin(target, relative);
  const original = readOptional(absolute);
  const current = parseJson(original, relative);
  let base = current;
  if (oldRecord?.injected || oldRecord?.injectedPermissions) {
    const removed = removeConfigFragment(base, oldRecord.injected, oldRecord.injectedPermissions);
    if (removed.conflicts.length) {
      throw new InstallerError(`managed JSON fragment was modified: ${relative}`, "ASSET_CONFLICT");
    }
    base = removed.value;
  }
  const merged = mergeConfigFragment(base, fragment);
  const injectedCount = Object.values(merged.injected).reduce((total, groups) => total + groups.length, 0);
  const injectedPermissionCount = Object.values(merged.injectedPermissions).reduce((total, values) => total + values.length, 0);
  const next = injectedCount === 0 && injectedPermissionCount === 0 && original !== null ? original : jsonBuffer(merged.value);
  return {
    op: operation(target, relative, next),
    record: {
      path: relative,
      mode: "json_merge",
      harness,
      created: oldRecord?.created ?? original === null,
      installedHash: sha256(next),
      injected: merged.injected,
      injectedPermissions: merged.injectedPermissions,
    },
  };
}

function copyRecord(sourceRoot, target, relative, oldRecord) {
  const source = fs.readFileSync(path.join(sourceRoot, relative));
  const absolute = resolveWithin(target, relative);
  const current = readOptional(absolute);
  if (oldRecord) {
    if (current === null || sha256(current) !== oldRecord.installedHash) {
      throw new InstallerError(`modified installed asset: ${relative}`, "ASSET_CONFLICT");
    }
  } else if (current !== null && !current.equals(source)) {
    throw new InstallerError(`destination already exists with different content: ${relative}`, "ASSET_CONFLICT");
  }
  return {
    op: operation(target, relative, source),
    record: {
      path: relative,
      mode: "copy",
      created: oldRecord?.created ?? current === null,
      installedHash: sha256(source),
    },
  };
}

function harnessFragment(sourceRoot, harness) {
  const relative = harness === "codex" ? ".codex/hooks.json" : ".claude/settings.json";
  return parseJson(fs.readFileSync(path.join(sourceRoot, relative)), relative);
}

function planInstall(sourceRoot, target, harnesses, oldManifest, store) {
  const old = recordMap(oldManifest);
  const records = [];
  const operations = [];
  for (const relative of sourceInventory(sourceRoot)) {
    const result = copyRecord(sourceRoot, target, relative, old.get(relative));
    records.push(result.record); operations.push(result.op);
  }
  const agentBody = fs.readFileSync(path.join(sourceRoot, "AGENTS.md"), "utf8");
  const agent = markdownRecord(target, "AGENTS.md", agentBody, old.get("AGENTS.md"));
  records.push(agent.record); operations.push(agent.op);

  if (harnesses.includes("codex")) {
    const result = jsonRecord(target, ".codex/hooks.json", harnessFragment(sourceRoot, "codex"), old.get(".codex/hooks.json"), "codex");
    records.push(result.record); operations.push(result.op);
  }
  if (harnesses.includes("claude-code")) {
    const bridge = markdownRecord(target, "CLAUDE.md", "@AGENTS.md", old.get("CLAUDE.md"), "claude-code");
    records.push(bridge.record); operations.push(bridge.op);
    const hooks = jsonRecord(
      target,
      ".claude/settings.json",
      mergePlainObject(harnessFragment(sourceRoot, "claude-code"), journalAccessFragment("claude-code", store)),
      old.get(".claude/settings.json"),
      "claude-code",
    );
    records.push(hooks.record); operations.push(hooks.op);
  }

  const desired = new Set(records.map((record) => record.path));
  for (const record of oldManifest?.files || []) {
    if (desired.has(record.path)) continue;
    if (record.mode === "copy") {
      const current = readOptional(resolveWithin(target, record.path));
      if (current !== null && sha256(current) !== record.installedHash) {
        throw new InstallerError(`modified obsolete asset: ${record.path}`, "ASSET_CONFLICT");
      }
      if (record.created) operations.push(operation(target, record.path, null));
    }
  }
  return { records, operations };
}

function checkTarget(target) {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new InstallerError(`target is not a directory: ${resolved}`, "INVALID_TARGET");
  }
  if (fs.lstatSync(resolved).isSymbolicLink()) {
    throw new InstallerError(`target must not be a symlink: ${resolved}`, "UNSAFE_PATH");
  }
  fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK);
  return resolved;
}

function readActiveWork(context, requested) {
  const journalRoot = context.journalRoot;
  let slug = requested;
  if (!slug) {
    const state = parseJson(readOptional(path.join(journalRoot, "state.json")), ".journal/state.json");
    slug = state.active_work_name;
  }
  if (typeof slug !== "string" || !slug) {
    throw new InstallerError("No active work found. Run init-work or switch first.", "NO_ACTIVE_WORK");
  }
  if (slug.includes("/") || slug.includes("\\") || slug === "." || slug === "..") {
    throw new InstallerError(`invalid work slug: ${slug}`, "INVALID_WORK");
  }
  const relative = `.journal/work/${slug}/work.md`;
  const file = path.join(journalRoot, "work", slug, "work.md");
  const buffer = readOptional(file);
  if (!buffer) throw new InstallerError(`work item not found: ${slug}`, "INVALID_WORK");
  const text = buffer.toString("utf8");
  const metadata = parseFrontmatter(text);
  return { slug, relative, file, text, metadata, visibility: metadata.visibility || "local_only" };
}

function readAllWork(context) {
  const workRoot = path.join(context.journalRoot, "work");
  const entries = fs.existsSync(workRoot) ? fs.readdirSync(workRoot, { withFileTypes: true }) : [];
  const workItems = entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(workRoot, slug, "work.md")))
    .sort()
    .map((slug) => readActiveWork(context, slug));
  if (!workItems.length) throw new InstallerError("no journal work items found", "NO_ACTIVE_WORK");
  return workItems;
}

function readJournalConfig(target) {
  const context = projectContext(target);
  return readProjectConfig(context);
}

function syncConfig(target) {
  const config = readJournalConfig(target);
  return config.sync && typeof config.sync === "object" ? config.sync : {};
}

function sharingConfig(config) {
  return config.sharing && typeof config.sharing === "object" ? config.sharing : {};
}

function sharedWorkItems(config) {
  const sharing = sharingConfig(config);
  return sharing.sharedWorkItems && typeof sharing.sharedWorkItems === "object" ? sharing.sharedWorkItems : {};
}

function isWorkShared(config, slug) {
  return Object.prototype.hasOwnProperty.call(sharedWorkItems(config), slug);
}

function parseConfigValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function setNested(value, keyPath, next) {
  const parts = keyPath.split(".").filter(Boolean);
  if (!parts.length) throw new InstallerError("config key is required", "USAGE");
  const result = { ...value };
  let cursor = result;
  for (const part of parts.slice(0, -1)) {
    const current = cursor[part];
    cursor[part] = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = next;
  return result;
}

function getNested(value, keyPath) {
  if (!keyPath) return value;
  let cursor = value;
  for (const part of keyPath.split(".").filter(Boolean)) {
    if (!cursor || typeof cursor !== "object" || !(part in cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function configure(options) {
  const target = checkTarget(options.target || process.cwd());
  const context = projectContext(target, options);
  if (!context.global) throw new InstallerError("djournal project store is not initialized; run journal install first", "NOT_INSTALLED");
  const current = readProjectConfig(context);
  if (!options.key) return { action: "config", target, projectKey: context.projectKey, config: current };
  if (typeof options.value === "undefined") {
    return { action: "config", target, projectKey: context.projectKey, key: options.key, value: getNested(current, options.key) };
  }
  const next = setNested(current, options.key, parseConfigValue(options.value));
  if (!options.dryRun) writeProjectConfig(context, next);
  return { action: "config", target, projectKey: context.projectKey, key: options.key, value: getNested(next, options.key), changed: true, dryRun: !!options.dryRun };
}

function gitIgnored(target, relative, options = {}) {
  const result = (options.runner || spawnSync)("git", ["-C", target, "check-ignore", "-q", relative], {
    encoding: "utf8",
    timeout: options.timeout || 30000,
  });
  if (result.error) return false;
  return result.status === 0;
}

function share(options) {
  const target = checkTarget(options.target || process.cwd());
  const context = projectContext(target, options);
  const config = readProjectConfig(context);
  const projectionRoot = projectionRootFor(target, config);
  const shared = sharedWorkItems(config);
  const workItems = options.all ? readAllWork(context) : [readActiveWork(context, options.work)];
  const sharedAt = new Date().toISOString();
  const sharedBy = process.env.JOURNAL_USER_ID || runGitConfigEmail(options) || `${os.userInfo().username}@local`;
  const nextShared = { ...shared };
  const results = workItems.map((work) => {
    const ignored = config.sync?.mode === "colocated" ? gitIgnored(projectionRoot, `.journal/work/${work.slug}`, options) : false;
    const warning = ignored
      ? `.journal/work/${work.slug} appears to be ignored by Git; update .gitignore or force-add it before expecting colocated Git commits to share this work.`
      : undefined;
    const changed = !Object.prototype.hasOwnProperty.call(shared, work.slug);
    if (changed) nextShared[work.slug] = { sharedAt, sharedBy };
    return { work: work.slug, changed, shared: true, gitIgnored: ignored, warning };
  });
  const changed = results.some((result) => result.changed);
  if (!options.all) {
    const result = results[0];
    if (!changed) return { action: "share", target, projectKey: context.projectKey, ...result };
  }
  const next = mergePlainObject(config, {
    sharing: {
      sharedWorkItems: nextShared,
    },
  });
  if (changed && !options.dryRun) writeProjectConfig(context, next);
  if (!options.all) return { action: "share", target, projectKey: context.projectKey, ...results[0], dryRun: !!options.dryRun };
  return {
    action: "share",
    target,
    projectKey: context.projectKey,
    all: true,
    changed,
    shared: true,
    workItems: results,
    dryRun: !!options.dryRun,
  };
}

function runGitConfigEmail(options = {}) {
  const result = (options.runner || spawnSync)("git", ["config", "user.email"], {
    encoding: "utf8",
    timeout: options.timeout || 30000,
  });
  if (result.error || result.status !== 0) return "";
  return (result.stdout || "").trim();
}

function runGit(gitRoot, args, options = {}) {
  const result = (options.runner || spawnSync)("git", ["-C", gitRoot, ...args], {
    encoding: "utf8",
    timeout: options.timeout || 30000,
  });
  if (result.error) throw new InstallerError(result.error.message, "GIT_ERROR");
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new InstallerError(detail || `git ${args.join(" ")} failed`, "GIT_ERROR");
  }
  return (result.stdout || "").trim();
}

function gitRootFor(directory, options = {}) {
  const result = (options.runner || spawnSync)("git", ["-C", directory, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    timeout: options.timeout || 30000,
  });
  if (result.error) throw new InstallerError(result.error.message, "GIT_ERROR");
  if (result.status !== 0) throw new InstallerError(".journal is not inside a Git work tree", "GIT_ERROR");
  return (result.stdout || "").trim();
}

function journalPathspec(gitRoot, journalRoot) {
  const relative = path.relative(gitRoot, journalRoot).split(path.sep).join("/");
  return relative && !relative.startsWith("..") ? relative : ".";
}

function projectionRootFor(target, config) {
  const sync = config.sync && typeof config.sync === "object" ? config.sync : {};
  if (sync.path) return path.resolve(target, sync.path);
  return path.resolve(target);
}

function projectJournalRoot(projectionRoot) {
  return path.join(projectionRoot, ".journal");
}

function projectSharedWork(context, config, work, options = {}) {
  const targetRoot = projectionRootFor(context.target, config);
  const destinationJournal = projectJournalRoot(targetRoot);
  const sourceWork = path.join(context.journalRoot, "work", work.slug);
  const destinationWork = path.join(destinationJournal, "work", work.slug);
  if (!fs.existsSync(sourceWork)) throw new InstallerError(`work item not found: ${work.slug}`, "INVALID_WORK");
  const files = copyDirectoryContents(sourceWork, destinationWork, options).map((file) => `.journal/work/${work.slug}/${file}`);
  return { projectionRoot: targetRoot, journalRoot: destinationJournal, files };
}

function bootstrapProjectStore(target, options = {}) {
  const store = options.store || resolveProjectStore(target, options);
  const existingConfig = readOptional(store.configFile);
  const config = existingConfig
    ? mergePlainObject(defaultProjectConfig(target, store), parseJson(existingConfig, "config.json"))
    : defaultProjectConfig(target, store);
  const legacyConfig = readOptional(resolveWithin(target, ".journal/config.json"));
  if (legacyConfig) {
    const parsedLegacy = parseJson(legacyConfig, ".journal/config.json");
    if (parsedLegacy.sync || parsedLegacy.sharing) {
      config.sync = { ...config.sync, ...(parsedLegacy.sync || {}) };
      config.sharing = mergePlainObject(config.sharing, parsedLegacy.sharing || {});
    }
  }
  if (!options.dryRun) {
    fs.mkdirSync(store.journalRoot, { recursive: true });
    copyDirectoryContents(resolveWithin(target, ".journal"), store.journalRoot, {
      dryRun: false,
      exclude: (relative) => relative === "config.json" || relative.startsWith(".install/"),
    });
    writeProjectConfig({ ...store, target, global: true }, config);
  }
  return { ...store, config };
}

function sync(options) {
  const target = checkTarget(options.target || process.cwd());
  const context = projectContext(target, options);
  const config = readProjectConfig(context);
  const syncOptions = config.sync && typeof config.sync === "object" ? config.sync : {};
  if (syncOptions.enabled !== true) {
    return { action: "sync", target, skipped: true, reason: "sync is not enabled" };
  }
  if (!["colocated", "standalone"].includes(syncOptions.mode)) {
    return { action: "sync", target, skipped: true, reason: "sync mode is not standalone" };
  }
  const work = readActiveWork(context, options.work);
  if (!isWorkShared(config, work.slug)) {
    return { action: "sync", target, work: work.slug, skipped: true, reason: "work is not shared" };
  }
  const projection = projectSharedWork(context, config, work, options);
  if (syncOptions.mode === "colocated") {
    return { action: "sync", target, work: work.slug, projectionRoot: projection.projectionRoot, files: projection.files, dryRun: !!options.dryRun };
  }
  const gitRoot = gitRootFor(projection.journalRoot, options);
  const pathspec = journalPathspec(gitRoot, projection.journalRoot);
  const unmerged = runGit(gitRoot, ["diff", "--name-only", "--diff-filter=U", "--", pathspec], options);
  if (unmerged) throw new InstallerError(`unresolved journal conflicts:\n${unmerged}`, "SYNC_CONFLICT");
  if (options.dryRun) return { action: "sync", target, work: work.slug, projectionRoot: projection.projectionRoot, gitRoot, pathspec, files: projection.files, dryRun: true };

  runGit(gitRoot, ["pull", "--ff-only"], options);
  const afterPullUnmerged = runGit(gitRoot, ["diff", "--name-only", "--diff-filter=U", "--", pathspec], options);
  if (afterPullUnmerged) throw new InstallerError(`unresolved journal conflicts:\n${afterPullUnmerged}`, "SYNC_CONFLICT");
  runGit(gitRoot, ["add", "--", pathspec], options);
  let committed = true;
  try {
    runGit(gitRoot, ["diff", "--cached", "--quiet", "--", pathspec], options);
    committed = false;
  } catch (error) {
    if (!(error instanceof InstallerError) || error.code !== "GIT_ERROR") throw error;
    runGit(gitRoot, ["commit", "-m", `chore(journal): sync ${work.slug}`], options);
  }
  runGit(gitRoot, ["push"], options);
  return { action: "sync", target, work: work.slug, projectionRoot: projection.projectionRoot, gitRoot, pathspec, files: projection.files, committed, pushed: true, auto: !!options.auto };
}

function doctor(options) {
  const target = checkTarget(options.target || process.cwd());
  const detected = detectHarnesses(target, options);
  const checks = [
    { name: "node", ok: Number(process.versions.node.split(".")[0]) >= 18, detail: process.versions.node },
    { name: "target", ok: true, detail: target },
  ];
  for (const relative of [".codex/hooks.json", ".claude/settings.json"]) {
    const buffer = readOptional(resolveWithin(target, relative));
    if (buffer) {
      try { parseJson(buffer, relative); checks.push({ name: relative, ok: true, detail: "valid JSON" }); }
      catch (error) { checks.push({ name: relative, ok: false, detail: error.message }); }
    }
  }
  const manifest = readOptional(resolveWithin(target, MANIFEST_PATH));
  if (manifest) {
    try { loadManifest(target); checks.push({ name: "manifest", ok: true, detail: "supported" }); }
    catch (error) { checks.push({ name: "manifest", ok: false, detail: error.message }); }
  }
  return { ok: checks.every((check) => check.ok), target, detected, checks };
}

async function install(options) {
  const sourceRoot = path.resolve(options.sourceRoot);
  const target = checkTarget(options.target || process.cwd());
  if (sourceRoot === target) throw new InstallerError("source and target must differ", "INVALID_TARGET");
  recoverTransaction(target);
  const health = doctor({ ...options, target });
  if (!health.ok) throw new InstallerError("prerequisite checks failed", "DOCTOR_FAILED");
  const oldManifest = loadManifest(target);
  const detected = health.detected;
  const selected = await selectHarnesses({ ...options, interactive: options.interactive ?? process.stdin.isTTY }, detected);
  const harnesses = [...new Set([...(oldManifest?.harnesses || []), ...selected])].sort();
  const store = bootstrapProjectStore(target, { ...options, store: resolveProjectStore(target, options) });
  const planned = planInstall(sourceRoot, target, harnesses, oldManifest, store);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    toolVersion: packageVersion(sourceRoot),
    installedAt: oldManifest?.installedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    harnesses,
    files: planned.records.sort((a, b) => a.path.localeCompare(b.path)),
  };
  planned.operations.push(operation(target, PROJECT_MARKER_PATH, jsonBuffer({
    schemaVersion: SCHEMA_VERSION,
    projectKey: store.projectKey,
    journalStore: store.root,
  })));
  planned.operations.push(operation(target, MANIFEST_PATH, jsonBuffer(manifest)));
  applyTransaction(target, planned.operations, options);
  if (!options.dryRun) {
    for (const item of planned.operations.filter((candidate) => candidate.next === null)) {
      cleanupEmpty(path.dirname(item.absolute), target);
    }
  }
  return { action: oldManifest ? "upgrade" : "install", target, harnesses, dryRun: !!options.dryRun, operations: planned.operations.map((item) => item.path) };
}

async function upgrade(options) {
  const target = checkTarget(options.target || process.cwd());
  const manifest = loadManifest(target);
  if (!manifest) throw new InstallerError("journal is not installed", "NOT_INSTALLED");
  return install({
    ...options,
    target,
    harnesses: manifest.harnesses,
    instructionsOnly: manifest.harnesses.length === 0,
    interactive: false,
  });
}

function uninstallRecord(target, record, conflicts) {
  const absolute = resolveWithin(target, record.path);
  const current = readOptional(absolute);
  if (record.mode === "copy") {
    if (current === null) return null;
    if (sha256(current) !== record.installedHash) { conflicts.push(record.path); return null; }
    return record.created ? operation(target, record.path, null) : null;
  }
  if (record.mode === "markdown_block") {
    if (current === null) return null;
    const removed = removeManagedBlock(current.toString("utf8"));
    if (!removed.removed) { conflicts.push(record.path); return null; }
    return operation(target, record.path, removed.text ? Buffer.from(removed.text) : null);
  }
  if (record.mode === "json_merge") {
    if (current === null) return null;
    const injectedCount = Object.values(record.injected || {}).reduce((total, groups) => total + groups.length, 0);
    if (injectedCount === 0 && !record.created) return null;
    const parsed = parseJson(current, record.path);
    const removed = removeConfigFragment(parsed, record.injected, record.injectedPermissions);
    if (removed.conflicts.length) { conflicts.push(record.path); return null; }
    const empty = Object.keys(removed.value).length === 0;
    return operation(target, record.path, empty && record.created ? null : jsonBuffer(removed.value));
  }
  throw new InstallerError(`unknown manifest mode: ${record.mode}`, "UNSUPPORTED_MANIFEST");
}

function uninstall(options) {
  const target = checkTarget(options.target || process.cwd());
  recoverTransaction(target);
  const manifest = loadManifest(target);
  if (!manifest) throw new InstallerError("journal is not installed", "NOT_INSTALLED");
  const selected = options.all || !options.harnesses?.length
    ? null
    : new Set(options.harnesses.map(normalizeHarness));
  if (selected) {
    const invalid = [...selected].filter((name) => !SUPPORTED_HARNESSES.includes(name));
    if (invalid.length) throw new InstallerError(`unsupported harness: ${invalid.join(", ")}`, "UNSUPPORTED_HARNESS");
  }
  const full = selected === null;
  const remove = manifest.files.filter((record) => full || (record.harness && selected.has(record.harness)));
  const keep = manifest.files.filter((record) => !remove.includes(record));
  const conflicts = [];
  const operations = remove.map((record) => uninstallRecord(target, record, conflicts)).filter(Boolean);
  const conflictSet = new Set(conflicts);
  const retained = [...keep, ...remove.filter((record) => conflictSet.has(record.path))];
  let nextManifest = null;
  if (!full || conflicts.length) {
    const remainingHarnesses = [...new Set(retained.map((record) => record.harness).filter(Boolean))].sort();
    nextManifest = {
      ...manifest,
      updatedAt: new Date().toISOString(),
      harnesses: remainingHarnesses,
      files: retained,
    };
    operations.push(operation(target, MANIFEST_PATH, jsonBuffer(nextManifest)));
  } else operations.push(operation(target, MANIFEST_PATH, null));
  applyTransaction(target, operations, options);
  if (!options.dryRun) {
    for (const item of operations.filter((candidate) => candidate.next === null)) {
      cleanupEmpty(path.dirname(item.absolute), target);
    }
    if (full) cleanupEmpty(path.join(target, ".journal", ".install"), target);
  }
  const action = full ? (conflicts.length ? "uninstall-with-conflicts" : "uninstall") : "partial-uninstall";
  return { action, target, conflicts, dryRun: !!options.dryRun, operations: operations.map((item) => item.path), harnesses: nextManifest?.harnesses || [] };
}

function recordStatus(target, record) {
  const current = readOptional(resolveWithin(target, record.path));
  if (current === null) return "missing";
  if (record.mode === "copy") return sha256(current) === record.installedHash ? "clean" : "modified";
  if (record.mode === "markdown_block") {
    const text = current.toString("utf8");
    try {
      return hasManagedBlock(text)
        ? (sha256(current) === record.installedHash ? "clean" : "modified")
        : "missing";
    } catch { return "invalid"; }
  }
  if (record.mode === "json_merge") {
    try {
      const value = parseJson(current, record.path);
      const hooksPresent = Object.entries(record.injected || {}).every(([event, groups]) =>
        groups.every((group) => value.hooks?.[event]?.some((candidate) => equal(candidate, group))));
      const permissionsPresent = Object.entries(record.injectedPermissions || {}).every(([key, values]) =>
        values.every((item) => value.permissions?.[key]?.some((candidate) => equal(candidate, item))));
      const present = hooksPresent && permissionsPresent;
      return present ? (sha256(current) === record.installedHash ? "clean" : "modified") : "missing";
    } catch { return "invalid"; }
  }
  return "invalid";
}

function status(options) {
  const target = checkTarget(options.target || process.cwd());
  const manifest = loadManifest(target);
  if (!manifest) return { installed: false, target };
  const files = manifest.files.map((record) => ({ path: record.path, mode: record.mode, status: recordStatus(target, record) }));
  return { installed: true, target, toolVersion: manifest.toolVersion, harnesses: manifest.harnesses, files, clean: files.every((file) => file.status === "clean") };
}

module.exports = {
  InstallerError,
  MANIFEST_PATH,
  PROJECT_MARKER_PATH,
  SUPPORTED_HARNESSES,
  applyTransaction,
  configure,
  detectHarnesses,
  doctor,
  djournalHome,
  install,
  loadManifest,
  projectContext,
  recoverTransaction,
  selectHarnesses,
  share,
  sourceInventory,
  sync,
  status,
  uninstall,
  upgrade,
};
