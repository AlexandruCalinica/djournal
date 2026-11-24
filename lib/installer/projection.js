"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROJECTION_MARKER_NAME = ".djournal-projection.json";
const SCHEMA_VERSION = 1;

function projectionMarkerPath(projectionRoot) {
  return path.join(projectionRoot, ".journal", PROJECTION_MARKER_NAME);
}

function parsePorcelain(text) {
  return String(text || "").split(/\n/).filter(Boolean).map((line) => {
    const status = line.slice(0, 2);
    let file = line.slice(3);
    const rename = file.includes(" -> ");
    if (!rename && file.startsWith('"') && file.endsWith('"')) {
      try { file = JSON.parse(file); } catch { file = file.slice(1, -1); }
    }
    return { status, file, rename };
  });
}

function classifyProjectionDrift(context, projectionRoot, gitRoot, dirty) {
  const journalRoot = path.join(projectionRoot, ".journal");
  return parsePorcelain(dirty).map((item) => {
    const checkoutFile = path.resolve(gitRoot, item.file);
    const relative = path.relative(journalRoot, checkoutFile);
    const insideWork = relative === "work" || relative.startsWith(`work${path.sep}`);
    const storeFile = insideWork ? path.join(context.journalRoot, relative) : null;
    const checkoutBytes = readFile(checkoutFile);
    const storeBytes = storeFile ? readFile(storeFile) : null;
    const untracked = item.status === "??";
    let action = "conflict";
    let storeState = "outside-journal";
    if (!insideWork || item.rename) {
      storeState = item.rename ? "rename" : "outside-journal";
    } else if (storeBytes === null) {
      storeState = "missing";
      if (untracked && checkoutBytes !== null) action = "adopt-into-store";
    } else if (checkoutBytes && storeBytes.equals(checkoutBytes)) {
      storeState = "identical";
      if (untracked) action = "drop-duplicate";
    } else {
      storeState = "differs";
    }
    return {
      status: item.status,
      file: item.file,
      checkoutFile,
      storeFile,
      storeState,
      action,
    };
  });
}

function readFile(file) {
  try { return fs.readFileSync(file); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function formatProjectionDrift(projectionRoot, journalRoot, entries) {
  const lines = [
    `journal checkout has uncommitted changes. Those paths are in the checkout at ${projectionRoot}, not in the canonical store at ${journalRoot}.`,
  ];
  for (const entry of entries) {
    lines.push(`${entry.status} ${entry.file}`);
    lines.push(`  checkout: ${entry.checkoutFile}`);
    lines.push(`  store: ${entry.storeFile || "(not a journal work file)"} (${entry.storeState})`);
  }
  const adoptable = entries.some((entry) => entry.action === "adopt-into-store");
  const identical = entries.some((entry) => entry.action === "drop-duplicate");
  if (adoptable || identical) {
    lines.push("Re-run with --adopt to copy checkout-only journal files into the store when the store has no copy, and to remove untracked checkout duplicates that already match the store byte for byte. Files that differ from the store are left untouched.");
  } else {
    lines.push("Files that differ from the store were not changed. Move the intended copy into the store, or restore the checkout, then re-run.");
  }
  return lines.join("\n");
}

function applyProjectionDrift(entries) {
  const applied = [];
  for (const entry of entries) {
    if (entry.action === "adopt-into-store") {
      fs.mkdirSync(path.dirname(entry.storeFile), { recursive: true });
      fs.copyFileSync(entry.checkoutFile, entry.storeFile);
      fs.unlinkSync(entry.checkoutFile);
      applied.push(entry);
    } else if (entry.action === "drop-duplicate") {
      fs.unlinkSync(entry.checkoutFile);
      applied.push(entry);
    }
  }
  return applied;
}

function blockingDrift(entries, adopt) {
  return entries.filter((entry) => entry.action === "conflict" || (entry.action === "adopt-into-store" && !adopt));
}

function markerDocument(context) {
  return {
    schemaVersion: SCHEMA_VERSION,
    role: "projection",
    projectKey: context.projectKey,
    projectRoot: path.resolve(context.target),
    journalStore: path.resolve(context.root),
  };
}

function ignoreMarker(gitRoot, markerFile) {
  const gitDir = path.join(gitRoot, ".git");
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) return;
  const info = path.join(gitDir, "info");
  fs.mkdirSync(info, { recursive: true });
  const exclude = path.join(info, "exclude");
  const relative = path.relative(gitRoot, markerFile).split(path.sep).join("/");
  const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf8") : "";
  if (current.split(/\n/).includes(relative)) return;
  const next = current.length === 0 || current.endsWith("\n") ? `${current}${relative}\n` : `${current}\n${relative}\n`;
  fs.writeFileSync(exclude, next);
}

module.exports = {
  PROJECTION_MARKER_NAME,
  applyProjectionDrift,
  blockingDrift,
  classifyProjectionDrift,
  formatProjectionDrift,
  ignoreMarker,
  markerDocument,
  projectionMarkerPath,
};
