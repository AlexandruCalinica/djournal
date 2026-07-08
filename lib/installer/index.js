"use strict";

const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const {
  equal,
  hasManagedBlock,
  mergeHookConfig,
  removeHookConfig,
  removeManagedBlock,
  upsertManagedBlock,
} = require("./merge.js");

const SCHEMA_VERSION = 1;
const SUPPORTED_HARNESSES = ["codex", "claude-code"];
const FUTURE_HARNESSES = ["opencode", "pi", "zed"];
const MANIFEST_PATH = ".journal/.install/manifest.json";
const TRANSACTION_PATH = ".journal/.install/transaction.json";

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
  const files = ["spec.md"];
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

function jsonRecord(target, relative, fragment, oldRecord, harness) {
  const absolute = resolveWithin(target, relative);
  const original = readOptional(absolute);
  const current = parseJson(original, relative);
  let base = current;
  if (oldRecord?.injected) {
    const removed = removeHookConfig(base, oldRecord.injected);
    if (removed.conflicts.length) {
      throw new InstallerError(`managed hook group was modified: ${relative}`, "ASSET_CONFLICT");
    }
    base = removed.value;
  }
  const merged = mergeHookConfig(base, fragment);
  const injectedCount = Object.values(merged.injected).reduce((total, groups) => total + groups.length, 0);
  const next = injectedCount === 0 && original !== null ? original : jsonBuffer(merged.value);
  return {
    op: operation(target, relative, next),
    record: {
      path: relative,
      mode: "json_merge",
      harness,
      created: oldRecord?.created ?? original === null,
      installedHash: sha256(next),
      injected: merged.injected,
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

function planInstall(sourceRoot, target, harnesses, oldManifest) {
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
    const hooks = jsonRecord(target, ".claude/settings.json", harnessFragment(sourceRoot, "claude-code"), old.get(".claude/settings.json"), "claude-code");
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

function readActiveWork(target, requested) {
  const journalRoot = resolveWithin(target, ".journal");
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
  const file = resolveWithin(target, relative);
  const buffer = readOptional(file);
  if (!buffer) throw new InstallerError(`work item not found: ${slug}`, "INVALID_WORK");
  const text = buffer.toString("utf8");
  const metadata = parseFrontmatter(text);
  return { slug, relative, file, text, metadata, visibility: metadata.visibility || "local_only" };
}

function share(options) {
  const target = checkTarget(options.target || process.cwd());
  const work = readActiveWork(target, options.work);
  if (work.visibility === "team_shared") {
    return { action: "share", target, work: work.slug, visibility: "team_shared", changed: false };
  }
  if (work.visibility && !["local_only", "private_synced"].includes(work.visibility)) {
    throw new InstallerError(`unsupported visibility: ${work.visibility}`, "INVALID_JOURNAL");
  }
  const next = replaceFrontmatterField(
    replaceFrontmatterField(work.text, "visibility", "team_shared"),
    "updatedAt",
    new Date().toISOString(),
  );
  if (!options.dryRun) atomicWrite(work.file, Buffer.from(next));
  return { action: "share", target, work: work.slug, previousVisibility: work.visibility, visibility: "team_shared", changed: true, dryRun: !!options.dryRun };
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

function sync(options) {
  const target = checkTarget(options.target || process.cwd());
  const work = readActiveWork(target, options.work);
  if (work.visibility !== "team_shared") {
    return { action: "sync", target, work: work.slug, skipped: true, reason: `visibility is ${work.visibility}` };
  }
  const journalRoot = resolveWithin(target, ".journal");
  const gitRoot = gitRootFor(journalRoot, options);
  const pathspec = journalPathspec(gitRoot, journalRoot);
  const unmerged = runGit(gitRoot, ["diff", "--name-only", "--diff-filter=U", "--", pathspec], options);
  if (unmerged) throw new InstallerError(`unresolved journal conflicts:\n${unmerged}`, "SYNC_CONFLICT");
  if (options.dryRun) return { action: "sync", target, work: work.slug, gitRoot, pathspec, dryRun: true };

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
  return { action: "sync", target, work: work.slug, gitRoot, pathspec, committed, pushed: true, auto: !!options.auto };
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
  const planned = planInstall(sourceRoot, target, harnesses, oldManifest);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    toolVersion: packageVersion(sourceRoot),
    installedAt: oldManifest?.installedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    harnesses,
    files: planned.records.sort((a, b) => a.path.localeCompare(b.path)),
  };
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
    const removed = removeHookConfig(parsed, record.injected);
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
      const present = Object.entries(record.injected || {}).every(([event, groups]) =>
        groups.every((group) => value.hooks?.[event]?.some((candidate) => equal(candidate, group))));
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
  SUPPORTED_HARNESSES,
  applyTransaction,
  detectHarnesses,
  doctor,
  install,
  loadManifest,
  recoverTransaction,
  selectHarnesses,
  share,
  sourceInventory,
  sync,
  status,
  uninstall,
  upgrade,
};
