"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { searchRecall } = require("../lib/recall/index.js");
const { cachePaths } = require("../lib/recall/snapshot.js");

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "djournal-recall-"));
  const target = path.join(base, "checkout");
  const root = path.join(base, "private-store");
  const journalRoot = path.join(root, ".journal");
  const workRoot = path.join(journalRoot, "work", "2026-08-28-01-cache");
  fs.mkdirSync(path.join(workRoot, "journal"), { recursive: true });
  fs.mkdirSync(target);
  const context = { target, root, journalRoot, projectKey: "fixture-project", global: true };
  writeWork(workRoot);
  writeEntry(workRoot, "2026-08-28-01-fast-lookup.md", {
    id: "ent_fast_lookup",
    title: "Fast filename lookup",
    summary: "Persistent retrieval cache for journal paths.",
    body: "# Fast filename lookup\n\nBuild a serialized inverted index for speedy recall.",
  });
  return { base, target, root, journalRoot, workRoot, context };
}

function writeWork(workRoot, overrides = {}) {
  const values = {
    title: "Recall cache",
    description: "Make journal lookup fast.",
    status: "active",
    visibility: "local_only",
    ...overrides,
  };
  fs.writeFileSync(path.join(workRoot, "work.md"), `---
id: wi_cache
slug: 2026-08-28-01-cache
title: ${values.title}
description: ${values.description}
status: ${values.status}
visibility: ${values.visibility}
createdAt: "2026-08-28T00:00:00.000Z"
updatedAt: "2026-08-28T00:00:00.000Z"
---

# ${values.title}

${values.description}
`);
}

function writeEntry(workRoot, filename, values) {
  fs.writeFileSync(path.join(workRoot, "journal", filename), `---
id: ${values.id}
workItemId: wi_cache
entryType: ${values.entryType || "implementation"}
title: ${values.title}
summary: ${values.summary}
createdAt: "2026-08-28T00:00:00.000Z"
updatedAt: "2026-08-28T00:00:00.000Z"
---

${values.body}
`);
}

test("cold recall persists an index and warm recall reuses it", () => {
  const item = fixture();
  const cold = searchRecall("serialized inverted index", { context: item.context });
  assert.equal(cold.cache.status, "rebuilt");
  assert.equal(cold.cache.mode, "persistent");
  assert.equal(cold.entries[0].id, "ent_fast_lookup");
  assert.equal(fs.existsSync(cachePaths(item.context).snapshot), true);

  const warm = searchRecall("serialized inverted index", { context: item.context });
  assert.equal(warm.cache.status, "hit");
  assert.equal(warm.entries[0].path, ".journal/work/2026-08-28-01-cache/journal/2026-08-28-01-fast-lookup.md");
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(cachePaths(item.context).directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(cachePaths(item.context).snapshot).mode & 0o777, 0o600);
  }
});

test("incremental refresh detects additions, edits, deletes, and inherited work metadata", () => {
  const item = fixture();
  searchRecall("serialized", { context: item.context });
  const original = path.join(item.workRoot, "journal", "2026-08-28-01-fast-lookup.md");
  writeEntry(item.workRoot, "2026-08-28-02-new-term.md", {
    id: "ent_new_term",
    title: "Quasar retrieval",
    summary: "A newly added quasar candidate.",
    body: "# Quasar retrieval\n\nquasarneedle appears here.",
  });
  let result = searchRecall("quasarneedle", { context: item.context });
  assert.equal(result.cache.status, "refreshed");
  assert.equal(result.entries[0].id, "ent_new_term");

  writeEntry(item.workRoot, "2026-08-28-01-fast-lookup.md", {
    id: "ent_fast_lookup",
    title: "Edited filename lookup",
    summary: "Changed content with a different size.",
    body: "# Edited lookup\n\nheliotropeneedle now identifies this entry and makes the file longer.",
  });
  result = searchRecall("heliotropeneedle", { context: item.context });
  assert.equal(result.cache.status, "refreshed");
  assert.equal(result.entries[0].id, "ent_fast_lookup");

  fs.unlinkSync(original);
  result = searchRecall("heliotropeneedle", { context: item.context });
  assert.equal(result.cache.status, "refreshed");
  assert.equal(result.entries.length, 0);

  writeWork(item.workRoot, { status: "paused", visibility: "team_shared" });
  result = searchRecall("quasarneedle", { context: item.context, status: "paused", visibility: "team_shared" });
  assert.equal(result.cache.status, "refreshed");
  assert.equal(result.entries[0].status, "paused");
  assert.equal(result.entries[0].visibility, "team_shared");
});

test("malformed snapshots self-heal and unwritable cache paths use memory", () => {
  const item = fixture();
  searchRecall("filename", { context: item.context });
  fs.writeFileSync(cachePaths(item.context).snapshot, "{broken");
  const healed = searchRecall("filename", { context: item.context });
  assert.equal(healed.cache.status, "rebuilt");
  assert.equal(healed.entries[0].id, "ent_fast_lookup");
  assert.equal(healed.warnings.some((item) => item.code === "RECALL_CACHE_INVALID"), true);

  const incompatible = JSON.parse(fs.readFileSync(cachePaths(item.context).snapshot, "utf8"));
  incompatible.schemaVersion = 999;
  fs.writeFileSync(cachePaths(item.context).snapshot, JSON.stringify(incompatible));
  const upgraded = searchRecall("filename", { context: item.context });
  assert.equal(upgraded.cache.status, "rebuilt");
  assert.equal(upgraded.warnings.some((item) => item.code === "RECALL_CACHE_INCOMPATIBLE"), true);

  const blocker = path.join(item.base, "not-a-directory");
  fs.writeFileSync(blocker, "blocked");
  const memory = searchRecall("filename", { context: item.context, cacheDir: path.join(blocker, "recall"), rebuild: true });
  assert.equal(memory.cache.mode, "memory");
  assert.equal(memory.entries[0].id, "ent_fast_lookup");
  assert.equal(memory.warnings.some((entry) => entry.code === "RECALL_CACHE_UNWRITABLE"), true);
});

test("no-cache mode remains read-only and title matches outrank body-only matches", () => {
  const item = fixture();
  writeEntry(item.workRoot, "2026-08-28-03-title-match.md", {
    id: "ent_title",
    title: "Cinnabar",
    summary: "Exact title match.",
    body: "# Cinnabar\n\nA short note.",
  });
  writeEntry(item.workRoot, "2026-08-28-04-body-match.md", {
    id: "ent_body",
    title: "Unrelated note",
    summary: "Body-only match.",
    body: "# Unrelated note\n\nThe term cinnabar is buried in this body.",
  });
  const before = fs.readdirSync(item.target);
  const result = searchRecall("cinnabar", { context: item.context, noCache: true });
  assert.equal(result.cache.mode, "memory");
  assert.equal(result.entries[0].id, "ent_title");
  assert.deepEqual(fs.readdirSync(item.target), before);
  assert.equal(fs.existsSync(cachePaths(item.context).snapshot), false);
});
