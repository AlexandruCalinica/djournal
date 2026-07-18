"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

if (packageJson.name !== "djournal") throw new Error("unexpected package name");
if (packageJson.license !== "Apache-2.0") throw new Error("package license must be Apache-2.0");
if (packageJson.publishConfig?.access !== "public") throw new Error("package must publish with public access");

const allowlist = new Set(packageJson.files || []);
for (const file of [".agents/", ".claude/", ".codex/", ".pi/", "AGENTS.md", "CLAUDE.md", "LICENSE", "bin/", "lib/"]) {
  if (!allowlist.has(file)) throw new Error(`package allowlist is missing: ${file}`);
}

for (const file of [
  "LICENSE",
  "README.md",
  "bin/journal.js",
  ".agents/adapters/pi/journal-hook.js",
  ".pi/extensions/djournal.ts",
]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`package source is missing: ${file}`);
}

const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
if (!license.includes("Apache License") || !license.includes("Version 2.0, January 2004")) {
  throw new Error("LICENSE is not the Apache License 2.0 text");
}

process.stdout.write("package manifest and license policy valid\n");
