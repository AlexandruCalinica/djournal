#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MARKER = /<!--\s*journal-status:\s*(closed|not-needed|off)(?:\s+([^>]*?))?\s*-->\s*$/i;
const PROJECT_MARKER_PATH = ".djournal.json";

function readStdin() {
  return new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input));
  });
}

function findRoot(start) {
  let current = path.resolve(start || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(current, "AGENTS.md")) &&
        fs.existsSync(path.join(current, ".agents", "rules", "AUTOMATION.md"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
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

function projectContext(root) {
  try {
    const markerFile = path.join(root, PROJECT_MARKER_PATH);
    if (!fs.existsSync(markerFile)) return { root, journalRoot: path.join(root, ".journal"), configFile: path.join(root, ".journal", "config.json"), global: false };
    const marker = JSON.parse(fs.readFileSync(markerFile, "utf8"));
    if (!marker.journalStore) return { root, journalRoot: path.join(root, ".journal"), configFile: path.join(root, ".journal", "config.json"), global: false };
    const store = path.resolve(marker.journalStore);
    return { root, journalRoot: path.join(store, ".journal"), configFile: path.join(store, "config.json"), global: true };
  } catch {
    return { root, journalRoot: path.join(root, ".journal"), configFile: path.join(root, ".journal", "config.json"), global: false };
  }
}

function activeWork(root) {
  try {
    const context = projectContext(root);
    const state = JSON.parse(fs.readFileSync(path.join(context.journalRoot, "state.json"), "utf8"));
    if (typeof state.active_work_name !== "string" || !state.active_work_name) return null;
    return workBySlug(root, state.active_work_name);
  } catch {
    return null;
  }
}

function workBySlug(root, slug) {
  try {
    if (typeof slug !== "string" || !slug || slug.includes("/") || slug.includes("\\") || slug === "." || slug === "..") return null;
    const context = projectContext(root);
    const work = path.join(context.journalRoot, "work", slug, "work.md");
    if (!fs.existsSync(work)) return null;
    const metadata = parseFrontmatter(fs.readFileSync(work, "utf8"));
    const config = readConfig(context);
    const shared = config.sharing?.sharedWorkItems && Object.prototype.hasOwnProperty.call(config.sharing.sharedWorkItems, slug);
    return { slug, visibility: metadata.visibility || "local_only", shared: !!shared, path: work };
  } catch {
    return null;
  }
}

function readConfig(context) {
  try {
    if (!fs.existsSync(context.configFile)) return {};
    return JSON.parse(fs.readFileSync(context.configFile, "utf8"));
  } catch {
    return {};
  }
}

function shouldAutoSync(root) {
  const config = readConfig(projectContext(root)).sync || {};
  return config.enabled === true && config.auto === true && config.mode === "standalone";
}

function context(event, message) {
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: message,
    },
  };
}

function resolveClosedEntry(root, value) {
  if (!value) return null;
  const relative = value.trim().replaceAll("\\", "/");
  if (!relative.endsWith(".md") || path.isAbsolute(relative)) return null;

  const validSpineEntry = (resolved, journalRoot) => {
    const resolvedJournalRoot = path.resolve(journalRoot);
    const workRoot = path.join(resolvedJournalRoot, "work");
    const workRelative = path.relative(workRoot, resolved);
    if (!workRelative || workRelative.startsWith("..") || path.isAbsolute(workRelative)) return null;
    const parts = workRelative.split(path.sep);
    if (parts.length < 3 || !parts[0] || parts[1] !== "journal") return null;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
    return { relative, resolved, journalRoot: resolvedJournalRoot, workSlug: parts[0] };
  };

  const context = projectContext(root);
  const candidates = [];
  if (context.global && relative.startsWith(".journal/")) {
    candidates.push({
      resolved: path.resolve(context.journalRoot, relative.slice(".journal/".length)),
      journalRoot: context.journalRoot,
    });
  }
  candidates.push({
    resolved: path.resolve(root, relative),
    journalRoot: path.join(root, ".journal"),
  });
  if (!context.global && relative.startsWith(".journal/")) {
    candidates.push({
      resolved: path.resolve(context.journalRoot, relative.slice(".journal/".length)),
      journalRoot: context.journalRoot,
    });
  }

  for (const candidate of candidates) {
    const entry = validSpineEntry(candidate.resolved, candidate.journalRoot);
    if (entry) return entry;
  }
  return null;
}

function validateClosedPath(root, value) {
  return !!resolveClosedEntry(root, value);
}

function syncSharedWork(root, work, runner) {
  const run = runner || ((command, args, options) => spawnSync(command, args, options));
  const result = run("journal", ["sync", "--auto", "--work", work.slug], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.error) return { ok: false, message: result.error.message };
  if (result.status !== 0) {
    const output = `${result.stderr || ""}${result.stdout || ""}`.trim();
    return { ok: false, message: output || `journal sync exited ${result.status}` };
  }
  return { ok: true, message: (result.stdout || "").trim() };
}

function handle(payload, options = {}) {
  const event = payload.hook_event_name;
  const root = findRoot(payload.cwd);
  if (!root) return {};

  if (event === "SessionStart") {
    const work = activeWork(root);
    const suffix = work ? ` Active work: ${work.slug}.` : " No valid active work is selected.";
    return context(event, `Follow AGENTS.md and .agents/rules/AUTOMATION.md.${suffix}`);
  }

  if (event === "UserPromptSubmit") {
    const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
    if (/\bjournal\s*:\s*off\b/i.test(prompt)) {
      return context(event, "Journal opt-out applies to this request. End with the journal-status: off marker.");
    }
    return context(event, "Classify this request using the ambient journal workflow. Close meaningful changed state before the final response, without adding ceremony to read-only or trivial work.");
  }

  if (event !== "Stop") return {};
  if (payload.stop_hook_active === true) return {};

  const message = typeof payload.last_assistant_message === "string"
    ? payload.last_assistant_message
    : "";
  const match = message.match(MARKER);
  if (!match) {
    return {
      decision: "block",
      reason: "Perform the journal closure checkpoint from AGENTS.md. Journal meaningful changed state if needed, then end with one valid hidden journal-status marker.",
    };
  }

  const status = match[1].toLowerCase();
  const closedEntry = status === "closed" ? resolveClosedEntry(root, match[2]) : null;
  if (status === "closed" && !closedEntry) {
    return {
      decision: "block",
      reason: "The journal-status closed marker must reference an existing Markdown spine entry under the resolved journal root. In global-store projects, .journal/... paths resolve through .djournal.json.",
    };
  }
  if (status === "closed") {
    const work = workBySlug(root, closedEntry.workSlug);
    if ((work?.shared || work?.visibility === "team_shared") && shouldAutoSync(root)) {
      const result = syncSharedWork(root, work, options.syncRunner);
      if (!result.ok) {
        return context(event, `Journal entry is closed and shared work automatic journal sync failed: ${result.message}`);
      }
      return context(event, "Journal entry is closed and shared work was synchronized.");
    }
  }
  return {};
}

async function main() {
  try {
    const raw = await readStdin();
    const payload = raw.trim() ? JSON.parse(raw) : {};
    process.stdout.write(`${JSON.stringify(handle(payload))}\n`);
  } catch (error) {
    process.stderr.write(`journal hook skipped: ${error.message}\n`);
    process.stdout.write("{}\n");
  }
}

if (require.main === module) {
  main();
}

module.exports = { handle, parseFrontmatter, resolveClosedEntry, shouldAutoSync };
