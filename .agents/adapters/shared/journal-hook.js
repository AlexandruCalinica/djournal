#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MARKER = /<!--\s*journal-status:\s*(closed|not-needed|off)(?:\s+([^>]*?))?\s*-->\s*$/i;

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

function activeWork(root) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(root, ".journal", "state.json"), "utf8"));
    if (typeof state.active_work_name !== "string" || !state.active_work_name) return null;
    const work = path.join(root, ".journal", "work", state.active_work_name, "work.md");
    return fs.existsSync(work) ? state.active_work_name : null;
  } catch {
    return null;
  }
}

function context(event, message) {
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: message,
    },
  };
}

function validateClosedPath(root, value) {
  if (!value) return false;
  const relative = value.trim().replaceAll("\\", "/");
  if (!relative.endsWith(".md") || path.isAbsolute(relative)) return false;
  const resolved = path.resolve(root, relative);
  const journalRoot = path.resolve(root, ".journal", "work") + path.sep;
  if (!resolved.startsWith(journalRoot)) return false;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false;
  return resolved.split(path.sep).join("/").includes("/journal/");
}

function handle(payload) {
  const event = payload.hook_event_name;
  const root = findRoot(payload.cwd);
  if (!root) return {};

  if (event === "SessionStart") {
    const work = activeWork(root);
    const suffix = work ? ` Active work: ${work}.` : " No valid active work is selected.";
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

  if (match[1].toLowerCase() === "closed" && !validateClosedPath(root, match[2])) {
    return {
      decision: "block",
      reason: "The journal-status closed marker must reference an existing repository-relative Markdown spine entry under .journal/work/<work>/journal/.",
    };
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

module.exports = { handle };
