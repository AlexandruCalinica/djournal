"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { InstallerError, projectContext } = require("./installer/index.js");
const { ENTRY_DIRECTORIES, documentFromDescriptor } = require("./recall/corpus.js");

// Reject symlinked components both while listing and immediately before opening.
function entryPath(root, relative) {
  const parts = relative.split("/");
  if (path.isAbsolute(relative) || parts.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) {
    throw new InstallerError("Entry path must stay inside its work item", "UNSAFE_PATH");
  }
  let file = root;
  for (const part of parts) {
    file = path.join(file, part);
    if (fs.lstatSync(file).isSymbolicLink()) throw new InstallerError("Symbolic links cannot be opened as journal entries", "UNSAFE_PATH");
  }
  return file;
}

function listEntries(options) {
  const context = projectContext(path.resolve(options.target), options);
  if (!options.work || /[/\\]/.test(options.work) || [".", ".."].includes(options.work)) {
    throw new InstallerError("Invalid work item", "INVALID_WORK");
  }
  const root = path.resolve(context.journalRoot);
  const workRelative = `work/${options.work}`;
  entryPath(root, workRelative);
  const records = [];
  function walk(relative, area) {
    const directory = entryPath(root, relative);
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const child = `${relative}/${item.name}`;
      if (item.isDirectory()) walk(child, area);
      else if (item.isFile() && path.extname(item.name).toLowerCase() === ".md") {
        const absolute = entryPath(root, child);
        const { document } = documentFromDescriptor({ absolute, relative: child, area, kind: "entry", workSlug: options.work }, new Map(), []);
        const fallback = item.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";
        const date = Number.isFinite(Date.parse(document.createdAt)) ? document.createdAt : fallback;
        records.push({ root, relative: child, title: document.title, entryType: document.entryType, date });
      }
    }
  }
  for (const area of ENTRY_DIRECTORIES) {
    const relative = `${workRelative}/${area}`;
    try {
      const stat = fs.lstatSync(path.join(root, relative));
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(relative, area);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return records.sort((a, b) => b.date.localeCompare(a.date) || b.relative.localeCompare(a.relative));
}

// Parse an executable and arguments, not a shell program. Keep filename data
// out of shell evaluation, including spaces, quotes, and command substitutions.
function editorArgs(command) {
  const args = [];
  let word = "", quote = "", started = false;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (char === "\\" && quote !== "'" && i + 1 < command.length &&
        (/[\s\\'"]/.test(command[i + 1]))) {
      word += command[++i]; started = true;
    } else if (quote) {
      if (char === quote) quote = "";
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char; started = true;
    } else if (/\s/.test(char)) {
      if (started) { args.push(word); word = ""; started = false; }
    } else { word += char; started = true; }
  }
  if (quote) throw new InstallerError("Unclosed quote in VISUAL or EDITOR", "EDITOR_CONFIG");
  if (started) args.push(word);
  if (!args[0]) throw new InstallerError("Set VISUAL or EDITOR to a terminal editor command", "EDITOR_CONFIG");
  return args;
}

function openEntry(entry, options = {}) {
  const file = entryPath(entry.root, entry.relative);
  if (!fs.statSync(file).isFile()) throw new InstallerError("Journal entry is no longer a regular file", "INVALID_ENTRY");
  const env = options.env || process.env;
  const command = env.VISUAL?.trim() || env.EDITOR?.trim() || (process.platform === "win32" ? "notepad" : "vi");
  const [bin, ...args] = editorArgs(command);
  const result = (options.spawnSync || spawnSync)(bin, [...args, file], { stdio: "inherit", cwd: options.cwd, env, shell: false });
  if (result.error) throw new InstallerError(`Cannot start editor ${bin}: ${result.error.message}. Check VISUAL or EDITOR.`, "EDITOR_ERROR");
  if (result.status !== 0) throw new InstallerError(`Editor ${bin} exited with ${result.signal || result.status}.`, "EDITOR_ERROR");
}

function recallEntry(result, options) {
  if (typeof result.path !== "string" || !result.path.startsWith(".journal/work/")) {
    throw new InstallerError("Recall result is not a canonical journal path", "UNSAFE_PATH");
  }
  const relative = result.path.slice(".journal/".length);
  const parts = relative.split("/");
  if (parts[1] !== result.workSlug || path.extname(relative).toLowerCase() !== ".md" ||
      !(parts.length === 3 && parts[2] === "work.md" || parts.length >= 4 && ENTRY_DIRECTORIES.includes(parts[2]))) {
    throw new InstallerError("Recall result is not a journal entry or work file", "UNSAFE_PATH");
  }
  const root = path.resolve(projectContext(path.resolve(options.target), options).journalRoot);
  entryPath(root, relative);
  return { root, relative };
}

module.exports = { listEntries, openEntry, recallEntry };
