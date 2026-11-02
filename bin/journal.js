#!/usr/bin/env node

"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  InstallerError,
  checkUpdates,
  bindWork,
  configure,
  doctor,
  install,
  listWork,
  pull,
  share,
  sync,
  status,
  uninstall,
  upgrade,
} = require("../lib/installer/index.js");
const { buildRecallIndex, searchRecall, lookupFiles } = require("../lib/recall/index.js");

const sourceRoot = path.resolve(__dirname, "..");

function usage() {
  return `Usage:
  djournal                         Open the interactive journal
  journal                          Alias for djournal
  journal setup [--target DIR]
  journal install [--target DIR] [--harness LIST | --all | --instructions-only]
  journal upgrade [--target DIR]
  journal uninstall [--target DIR] [--harness LIST | --all]
  journal status [--target DIR] [--json]
  journal doctor [--target DIR] [--json]
  journal config [--target DIR] [KEY [VALUE]] [--dry-run] [--json]
  journal share [--target DIR] [--work SLUG | --all] [--dry-run] [--json]
  journal pull [--target DIR] [--work SLUG] [--dry-run] [--json]
  journal sync [--target DIR] [--work SLUG] [--dry-run] [--json]
  journal work list [--target DIR] [--active] [--json]
  journal work bind SLUG [--target DIR] [--session ID] [--dry-run] [--json]
  journal recall files PATH... [--target DIR] [--repository LABEL] [--work SLUG] [--limit N] [--no-cache] [--json]
  journal recall index [--target DIR] [--rebuild] [--no-cache] [--json]
  journal recall search QUERY [--target DIR] [--work SLUG] [--type LIST] [--kind LIST] [--status LIST] [--visibility LIST] [--limit N] [--no-cache] [--json]
  journal update check [--target DIR] [--json]

Options:
  --dry-run             Show the planned operation without writing
  --yes                 Disable interactive harness selection
  --json                Emit JSON
  --repository LABEL    Scope code-path evidence to a repository label (files only)
  --work SLUG           Select a journal work item instead of active state
  --session ID          Bind a journal work item to a specific session
  --active              Show only lifecycle-active work items for work list
  --type LIST           Filter recall entries by comma-separated entry types
  --kind LIST           Filter recall results by comma-separated work,entry kinds
  --status LIST         Filter recall results by work-item status
  --visibility LIST     Filter recall results by visibility
  --limit N             Limit recall results per kind (1-100)
  --rebuild             Rebuild the persistent recall cache from scratch
  --no-cache            Search with an ephemeral in-memory index
  --harness LIST        Comma-separated codex, claude-code (claude), pi, grok-bot (grok, grokbot)
  --all                 Select all work items for share, or every harness
  --instructions-only   Install core instructions without harness hooks
`;
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.length ? args.shift() : "setup";
  if (["--help", "-h"].includes(command)) throw new InstallerError(usage(), "HELP");
  if (!["setup", "install", "upgrade", "uninstall", "status", "doctor", "config", "share", "pull", "sync", "update", "work", "recall"].includes(command)) {
    throw new InstallerError(usage(), "USAGE");
  }
  const options = { command, harnesses: [] };
  if (command === "update") {
    options.subcommand = args.shift();
    if (options.subcommand !== "check") throw new InstallerError("update requires the check subcommand", "USAGE");
  } else if (command === "work") {
    options.subcommand = args.shift();
    if (!["list", "bind"].includes(options.subcommand)) throw new InstallerError("work requires the list or bind subcommand", "USAGE");
    if (options.subcommand === "bind") {
      if (!args.length || args[0].startsWith("-")) throw new InstallerError("work bind requires a work slug", "USAGE");
      options.work = args.shift();
    }
  } else if (command === "recall") {
    options.subcommand = args.shift();
    if (!["index", "search", "files"].includes(options.subcommand)) throw new InstallerError("recall requires the index, search, or files subcommand", "USAGE");
    if (options.subcommand === "search") {
      if (!args.length || args[0].startsWith("-")) throw new InstallerError("recall search requires a query", "USAGE");
      options.query = args.shift();
    }
  }
  while (args.length) {
    const arg = args.shift();
    if (command === "setup" && !["--target", "--help", "-h"].includes(arg) && !arg.startsWith("--target=")) {
      throw new InstallerError("setup supports only --target and --help; use direct commands for automation", "USAGE");
    }
    if (command === "recall" && options.subcommand === "files" && arg === "--") {
      (options.paths ||= []).push(...args.splice(0));
    } else if (arg === "--repository") {
      if (!args.length || args[0].startsWith("--")) throw new InstallerError("--repository requires a label", "USAGE");
      options.repository = args.shift();
    } else if (arg.startsWith("--repository=")) options.repository = arg.slice(13);
    else if (arg === "--target") {
      if (!args.length) throw new InstallerError("--target requires a value", "USAGE");
      options.target = args.shift();
    } else if (arg.startsWith("--target=")) options.target = arg.slice(9);
    else if (arg === "--work") {
      if (!args.length) throw new InstallerError("--work requires a value", "USAGE");
      options.work = args.shift();
    } else if (arg.startsWith("--work=")) options.work = arg.slice(7);
    else if (arg === "--session") {
      if (!args.length) throw new InstallerError("--session requires a value", "USAGE");
      options.session = args.shift();
    } else if (arg.startsWith("--session=")) options.session = arg.slice(10);
    else if (arg === "--type") {
      if (!args.length) throw new InstallerError("--type requires a value", "USAGE");
      options.type = args.shift();
    } else if (arg.startsWith("--type=")) options.type = arg.slice(7);
    else if (arg === "--kind") {
      if (!args.length) throw new InstallerError("--kind requires a value", "USAGE");
      options.kind = args.shift();
    } else if (arg.startsWith("--kind=")) options.kind = arg.slice(7);
    else if (arg === "--status") {
      if (!args.length) throw new InstallerError("--status requires a value", "USAGE");
      options.status = args.shift();
    } else if (arg.startsWith("--status=")) options.status = arg.slice(9);
    else if (arg === "--visibility") {
      if (!args.length) throw new InstallerError("--visibility requires a value", "USAGE");
      options.visibility = args.shift();
    } else if (arg.startsWith("--visibility=")) options.visibility = arg.slice(13);
    else if (arg === "--limit") {
      if (!args.length) throw new InstallerError("--limit requires a value", "USAGE");
      options.limit = Number(args.shift());
    } else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8));
    else if (arg === "--harness") {
      if (!args.length) throw new InstallerError("--harness requires a value", "USAGE");
      options.harnesses.push(...args.shift().split(",").filter(Boolean));
    } else if (arg.startsWith("--harness=")) options.harnesses.push(...arg.slice(10).split(",").filter(Boolean));
    else if (arg === "--all") options.all = true;
    else if (arg === "--active") options.active = true;
    else if (arg === "--instructions-only") options.instructionsOnly = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--auto") options.auto = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--rebuild" && command === "recall") options.rebuild = true;
    else if (arg === "--no-cache" && command === "recall") options.noCache = true;
    else if (arg === "--passive" && command === "update") options.passive = true;
    else if (arg === "--refresh-cache" && command === "update") options.refreshCache = true;
    else if (arg === "--help" || arg === "-h") throw new InstallerError(usage(), "HELP");
    else if (command === "recall" && options.subcommand === "files" && !arg.startsWith("-")) (options.paths ||= []).push(arg);
    else if (command === "config" && !options.key) options.key = arg;
    else if (command === "config" && typeof options.value === "undefined") options.value = arg;
    else throw new InstallerError(`unknown option: ${arg}`, "USAGE");
  }
  if (options.all && options.harnesses.length) throw new InstallerError("use either --all or --harness", "USAGE");
  if (options.all && options.work) throw new InstallerError("use either --all or --work", "USAGE");
  if (options.all && !["install", "uninstall", "share"].includes(command)) {
    throw new InstallerError(`--all is not supported for ${command}`, "USAGE");
  }
  if (options.instructionsOnly && (options.all || options.harnesses.length)) {
    throw new InstallerError("--instructions-only cannot be combined with harness selection", "USAGE");
  }
  if (options.active && !(command === "work" && options.subcommand === "list")) {
    throw new InstallerError("--active is only supported for work list", "USAGE");
  }
  if (options.repository !== undefined && !(command === "recall" && options.subcommand === "files")) throw new InstallerError("--repository is only supported for recall files", "USAGE");
  if (command === "recall" && options.subcommand === "files") {
    const { normalizeInputs } = require("../lib/recall/files.js");
    normalizeInputs(options.paths, { ...options, target: options.target || process.cwd() });
    if (["type", "kind", "status", "visibility"].some(key => options[key] !== undefined)) throw new InstallerError("recall files supports --work and --repository filters", "USAGE");
  }
  if (command === "recall") {
    if (typeof options.limit !== "undefined" && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)) {
      throw new InstallerError("--limit must be an integer from 1 to 100", "USAGE");
    }
    if (options.rebuild && options.subcommand !== "index") throw new InstallerError("--rebuild is only supported for recall index", "USAGE");
    if (options.subcommand === "index" && ["work", "type", "kind", "status", "visibility", "limit"].some((key) => typeof options[key] !== "undefined")) {
      throw new InstallerError("recall filters are only supported for recall search", "USAGE");
    }
  } else if (["type", "kind", "status", "visibility", "limit", "rebuild", "noCache"].some((key) => typeof options[key] !== "undefined")) {
    throw new InstallerError("recall filters are only supported for recall commands", "USAGE");
  }
  options.target = path.resolve(options.target || process.cwd());
  options.sourceRoot = sourceRoot;
  options.interactive = !options.yes && process.stdin.isTTY && process.stdout.isTTY;
  return options;
}

function print(value, json, output = process.stdout) {
  if (json) {
    output.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (value.action === "update-check") {
    output.write(`cli version: ${value.cliVersion || "unknown"}\n`);
    if (value.projectVersion) output.write(`project assets: ${value.projectVersion}\n`);
    output.write(`latest version: ${value.latestVersion || "unknown"}\n`);
    if (value.updateAvailable) output.write(`update available: ${value.cliVersion} -> ${value.latestVersion}\n`);
    else if (value.latestVersion) output.write("djournal CLI is up to date\n");
    if (value.projectUpdateAvailable) output.write(`project upgrade available: ${value.projectVersion} -> ${value.cliVersion}\n`);
    if (value.checkedAt) output.write(`checked: ${value.checkedAt}\n`);
    return;
  }
  if (value.action === "work-list") {
    if (value.selected) output.write(`selected: ${value.selected}\n`);
    for (const item of value.workItems || []) {
      const marker = item.selected ? "*" : " ";
      output.write(`${marker} ${item.slug} [${item.status}] ${item.title}\n`);
    }
    return;
  }
  if (value.action === "work-bind") {
    output.write(`bound ${value.work} to session ${value.sessionHash}\n`);
    return;
  }
  if (value.action === "recall-files") {
    output.write(`recall files: ${value.cache.status} (${value.cache.mode}), ${value.entries.length}/${value.totalEntries} entries\n`);
    for (const entry of value.entries) {
      output.write(`${entry.path}  ${entry.title}\n`);
      for (const match of entry.matches) {
        const detail = match.kind === "linked_context" ? `via ${match.viaPath}` : `${match.recordedPath} (${match.scope}, ${match.evidence.provenance})`;
        output.write(`  ${match.inputPath}: ${match.kind} — ${detail}\n`);
      }
      for (const replacement of entry.supersededBy) output.write(`  superseded by: ${replacement.path}\n`);
      if (entry.matchesTruncated || entry.codeReferencesTruncated || entry.supersededByTruncated) output.write("  additional entry evidence truncated\n");
    }
    if (value.unmatchedPaths.length) output.write(`no indexed evidence: ${value.unmatchedPaths.join(", ")}\n`);
    if (value.truncated || value.relatedTruncated) output.write("results or linked context truncated; narrow paths or raise --limit\n");
    for (const item of value.warnings) output.write(`warning: ${item.code}\n`);
    output.write("Evidence candidates only; read canonical entries before assessing the change.\n");
    return;
  }
  if (value.action === "recall-index") {
    output.write(`recall index: ${value.cache.status} (${value.cache.mode})\n`);
    output.write(`documents: ${value.cache.documentCount}\n`);
    output.write(`elapsed: ${value.cache.totalMs.toFixed(1)} ms\n`);
    for (const item of value.warnings || []) output.write(`warning: ${item.code}${item.path ? ` ${item.path}` : ""}${item.detail ? ` - ${item.detail}` : ""}\n`);
    return;
  }
  if (value.action === "recall-search") {
    output.write(`recall search: ${value.cache.status} (${value.cache.mode}), ${value.cache.totalMs.toFixed(1)} ms\n`);
    for (const item of [...(value.workItems || []), ...(value.entries || [])]) {
      output.write(`${item.score.toFixed(2).padStart(8)}  ${item.path}  ${item.title}\n`);
    }
    for (const item of value.warnings || []) output.write(`warning: ${item.code}${item.path ? ` ${item.path}` : ""}${item.detail ? ` - ${item.detail}` : ""}\n`);
    return;
  }
  if (value.action) output.write(`${value.action}: ${value.target}\n`);
  else if (typeof value.installed === "boolean") output.write(value.installed ? `installed: ${value.target}\n` : `not installed: ${value.target}\n`);
  else output.write(`${value.ok ? "ok" : "failed"}: ${value.target}\n`);
  if (value.harnesses) output.write(`harnesses: ${value.harnesses.join(", ") || "instructions-only"}\n`);
  if (value.key) output.write(`${value.key}: ${JSON.stringify(value.value)}\n`);
  else if (value.config) output.write(`${JSON.stringify(value.config, null, 2)}\n`);
  if (value.cliVersion) output.write(`cli version: ${value.cliVersion}\n`);
  if (value.projectVersion) output.write(`project assets: ${value.projectVersion}\n`);
  if (value.latestVersion) output.write(`latest version: ${value.latestVersion}\n`);
  if (value.updateAvailable) output.write("update available: yes\n");
  if (value.projectUpdateAvailable) output.write("project upgrade available: yes\n");
  if (value.recallCache) {
    const cache = value.recallCache;
    output.write(`recall cache: ${cache.valid ? `${cache.documentCount} documents, ${cache.indexVersion}` : (cache.exists ? "invalid; rebuilds on next recall" : "not built")}\n`);
  }
  if (value.workItems) {
    for (const item of value.workItems) {
      if (typeof item === "string") {
        output.write(`${item}\n`);
        continue;
      }
      output.write(`${item.changed ? "shared" : "unchanged"} ${item.work}\n`);
      if (item.warning) output.write(`warning: ${item.warning}\n`);
    }
  }
  if (value.work) output.write(`work: ${value.work}\n`);
  if (value.shared) output.write("marked for sharing\n");
  if (value.skipped) output.write(`skipped: ${value.reason || "no changes required"}\n`);
  if (value.warning) output.write(`warning: ${value.warning}\n`);
  if (value.conflicts?.length) output.write(`conflicts: ${value.conflicts.join(", ")}\n`);
  if (value.files) {
    for (const file of value.files) {
      if (typeof file === "string") output.write(`${file}\n`);
      else output.write(`${file.status.padEnd(8)} ${file.path}\n`);
    }
  }
  if (value.checks) {
    for (const check of value.checks) output.write(`${check.ok ? "ok" : "fail"} ${check.name}: ${check.detail}\n`);
  }
}

function exitCodeFor(code) {
  if (["USAGE", "HELP"].includes(code)) return code === "HELP" ? 0 : 1;
  if (["ASSET_CONFLICT", "HARNESS_SELECTION_REQUIRED"].includes(code)) return 2;
  if (["DOCTOR_FAILED", "INVALID_JSON", "INVALID_TARGET", "UNSAFE_PATH", "UNSUPPORTED_MANIFEST"].includes(code)) return 3;
  if (code === "NOT_INSTALLED") return 4;
  return 1;
}

function launchUpdateRefresh(options, runner = spawn) {
  try {
    const child = runner(process.execPath, [
      __filename,
      "update",
      "check",
      "--refresh-cache",
      "--json",
      "--target",
      options.target,
    ], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, DJOURNAL_UPDATE_WORKER: "1" },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.command === "setup") {
      const { setup } = require("../lib/setup.js");
      const result = await setup(options, { print });
      if (result.cancelled) process.exitCode = 130;
      else if (result.failed) process.exitCode = 2;
      return;
    }
    let result;
    if (options.command === "install") result = await install(options);
    else if (options.command === "upgrade") result = await upgrade(options);
    else if (options.command === "uninstall") result = uninstall(options);
    else if (options.command === "status") result = status(options);
    else if (options.command === "config") result = configure(options);
    else if (options.command === "share") result = share(options);
    else if (options.command === "pull") result = pull(options);
    else if (options.command === "sync") result = sync(options);
    else if (options.command === "work" && options.subcommand === "list") result = listWork(options);
    else if (options.command === "work" && options.subcommand === "bind") result = bindWork(options);
    else if (options.command === "recall" && options.subcommand === "files") result = lookupFiles(options.paths, options);
    else if (options.command === "recall" && options.subcommand === "index") result = buildRecallIndex(options);
    else if (options.command === "recall" && options.subcommand === "search") result = searchRecall(options.query, options);
    else if (options.command === "update") {
      result = await checkUpdates(options);
      if (result.refreshNeeded) result.backgroundRefreshStarted = launchUpdateRefresh(options);
    }
    else result = doctor(options);
    print(result, options.json);
    if (result.ok === false || result.installed === false || result.clean === false || result.conflicts?.length) process.exitCode = 2;
  } catch (error) {
    const code = error instanceof InstallerError ? error.code : (error?.code || "UNEXPECTED");
    if (process.argv.includes("--json")) {
      process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message }, null, 2)}\n`);
    } else process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = exitCodeFor(code);
  }
}

if (require.main === module) main();

module.exports = { launchUpdateRefresh, parseArgs, print };
