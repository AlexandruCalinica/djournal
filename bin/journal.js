#!/usr/bin/env node

"use strict";

const path = require("node:path");
const {
  InstallerError,
  doctor,
  install,
  status,
  uninstall,
  upgrade,
} = require("../lib/installer/index.js");

const sourceRoot = path.resolve(__dirname, "..");

function usage() {
  return `Usage:
  journal install [--target DIR] [--harness LIST | --all | --instructions-only]
  journal upgrade [--target DIR]
  journal uninstall [--target DIR] [--harness LIST | --all]
  journal status [--target DIR] [--json]
  journal doctor [--target DIR] [--json]

Options:
  --dry-run             Show the planned operation without writing
  --yes                 Disable interactive harness selection
  --json                Emit JSON
  --harness LIST        Comma-separated codex,claude-code selection
  --all                 Select or remove every supported harness
  --instructions-only   Install core instructions without harness hooks
`;
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  if (!command || !["install", "upgrade", "uninstall", "status", "doctor"].includes(command)) {
    throw new InstallerError(usage(), "USAGE");
  }
  const options = { command, harnesses: [] };
  while (args.length) {
    const arg = args.shift();
    if (arg === "--target") {
      if (!args.length) throw new InstallerError("--target requires a value", "USAGE");
      options.target = args.shift();
    } else if (arg.startsWith("--target=")) options.target = arg.slice(9);
    else if (arg === "--harness") {
      if (!args.length) throw new InstallerError("--harness requires a value", "USAGE");
      options.harnesses.push(...args.shift().split(",").filter(Boolean));
    } else if (arg.startsWith("--harness=")) options.harnesses.push(...arg.slice(10).split(",").filter(Boolean));
    else if (arg === "--all") options.all = true;
    else if (arg === "--instructions-only") options.instructionsOnly = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") throw new InstallerError(usage(), "HELP");
    else throw new InstallerError(`unknown option: ${arg}`, "USAGE");
  }
  if (options.all && options.harnesses.length) throw new InstallerError("use either --all or --harness", "USAGE");
  if (options.instructionsOnly && (options.all || options.harnesses.length)) {
    throw new InstallerError("--instructions-only cannot be combined with harness selection", "USAGE");
  }
  options.target = path.resolve(options.target || process.cwd());
  options.sourceRoot = sourceRoot;
  options.interactive = !options.yes && process.stdin.isTTY && process.stdout.isTTY;
  return options;
}

function print(value, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (value.action) process.stdout.write(`${value.action}: ${value.target}\n`);
  else if (typeof value.installed === "boolean") process.stdout.write(value.installed ? `installed: ${value.target}\n` : `not installed: ${value.target}\n`);
  else process.stdout.write(`${value.ok ? "ok" : "failed"}: ${value.target}\n`);
  if (value.harnesses) process.stdout.write(`harnesses: ${value.harnesses.join(", ") || "instructions-only"}\n`);
  if (value.conflicts?.length) process.stdout.write(`conflicts: ${value.conflicts.join(", ")}\n`);
  if (value.files) {
    for (const file of value.files) process.stdout.write(`${file.status.padEnd(8)} ${file.path}\n`);
  }
  if (value.checks) {
    for (const check of value.checks) process.stdout.write(`${check.ok ? "ok" : "fail"} ${check.name}: ${check.detail}\n`);
  }
}

function exitCodeFor(code) {
  if (["USAGE", "HELP"].includes(code)) return code === "HELP" ? 0 : 1;
  if (["ASSET_CONFLICT", "HARNESS_SELECTION_REQUIRED"].includes(code)) return 2;
  if (["DOCTOR_FAILED", "INVALID_JSON", "INVALID_TARGET", "UNSAFE_PATH", "UNSUPPORTED_MANIFEST"].includes(code)) return 3;
  if (code === "NOT_INSTALLED") return 4;
  return 1;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    let result;
    if (options.command === "install") result = await install(options);
    else if (options.command === "upgrade") result = await upgrade(options);
    else if (options.command === "uninstall") result = uninstall(options);
    else if (options.command === "status") result = status(options);
    else result = doctor(options);
    print(result, options.json);
    if (result.ok === false || result.installed === false || result.clean === false || result.conflicts?.length) process.exitCode = 2;
  } catch (error) {
    const code = error instanceof InstallerError ? error.code : "UNEXPECTED";
    if (process.argv.includes("--json")) {
      process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message }, null, 2)}\n`);
    } else process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = exitCodeFor(code);
  }
}

if (require.main === module) main();

module.exports = { parseArgs };
