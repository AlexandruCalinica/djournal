"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const YAML = require("yaml");
const { lookupFiles } = require("../lib/recall");
const { cachePaths } = require("../lib/recall/snapshot");
const { extractReferences, normalizeInputs } = require("../lib/recall/files");
const { parseArgs } = require("../bin/journal");

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "djournal-files-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const target = path.join(base, "checkout");
  const root = path.join(base, "store");
  const journalRoot = path.join(root, ".journal");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, ".djournal.json"), JSON.stringify({ schemaVersion: 1, projectKey: "files-fixture", journalStore: root }));
  const work = path.join(journalRoot, "work", "fixture");
  fs.mkdirSync(path.join(work, "journal"), { recursive: true });
  fs.writeFileSync(path.join(work, "work.md"), "---\nid: wi_fixture\ntitle: Fixture\nstatus: completed\nvisibility: local_only\n---\n");
  const context = { target, root, journalRoot, projectKey: "files-fixture" };
  function entry(id, refs = [], body = "", extra = {}) {
    const file = path.join(work, "journal", `${id}.md`);
    fs.writeFileSync(file, `---\n${YAML.stringify({ id, title: id, entryType: "implementation", createdAt: "2026-10-01T00:00:00.000Z", metadata: { codeReferences: refs }, ...extra })}---\n${body}`);
    return file;
  }
  const query = (paths, options = {}) => lookupFiles(paths, { context, ...options });
  return { base, target, root, work, context, entry, query };
}

function refs(...paths) { return paths.map(p => ({ path: p })); }
function ids(result) { return result.entries.map(e => e.id); }

test("labeled legacy extraction recognizes supported literals and rejects commands, examples, URLs and journal links", () => {
  const body = [
    "# Changed files",
    "`lib/one.js:42` and `README.md` and `docs/My Guide.md`",
    "[code](lib/two.js#L8-L12)",
    "| lib/three.js | Updated |",
    "`lib/component/`",
    "[spaces](<docs/Other Guide.md>)",
    "`node bin/journal.js` and `npm test` and `git diff -- src/a.js`",
    "`https://example.com/lib/web.js` and `.journal/work/x/work.md`",
    "[journal](../journal/2026-01-01-01-entry.md)",
    "```js",
    "`examples/ignore.js`",
    "```",
    "    `examples/indented.js`",
    "`lib/*.js` and `lib/<name>.js`",
  ].join("\n");
  const warnings = [];
  const actual = extractReferences({}, body, warnings, "entry.md").references;
  const expected = ["lib/one.js", "README.md", "docs/My Guide.md", "lib/two.js", "lib/three.js", "lib/component", "docs/Other Guide.md"];
  assert.deepEqual(actual.map(r => r.path), expected);
  assert.equal(actual.find(r => r.path === "lib/component").kind, "directory");
  assert.equal(actual[0].bodyLine, 2);
  assert.equal(actual[0].repository, "");
  assert.deepEqual(warnings, []);
});

test("exact and ancestor matching preserve case, missing paths, evidence and repository scope", t => {
  const f = fixture(t);
  f.entry("exact", [{ path: "lib/a.js", repository: "repo-a", relation: "constrains" }], "", { entryType: "decision" });
  f.entry("foreign", [{ path: "lib/a.js", repository: "repo-b" }]);
  f.entry("legacy", [], "`lib/a.js` and `lib/a.js:3`");
  f.entry("directory", [{ path: "lib/", kind: "directory" }]);
  f.entry("sibling", refs("lib/b.js"));
  f.entry("other", refs("lib-old/a.js", "lib/A.js"));
  const result = f.query(["./lib/a.js:10", "lib/a.js", "missing.js"], { repository: "repo-a" });
  assert.deepEqual(new Set(ids(result)), new Set(["exact", "legacy", "directory"]));
  assert.equal(result.entries[0].id, "exact");
  assert.equal(result.entries[0].matches[0].relation, "constrains");
  assert.equal(result.entries.find(e => e.id === "legacy").matches.length, 1);
  assert.equal(result.entries.find(e => e.id === "legacy").matches[0].scope, "unscoped");
  assert.deepEqual(result.unmatchedPaths, ["missing.js"]);
  assert.equal(result.paths[0].directMatches, 3);
  assert.equal(result.entries[0].status, "completed");
  assert.ok(ids(f.query(["lib/a.js"])).includes("foreign"));
  assert.deepEqual(ids(f.query(["lib/a.js"], { work: "absent" })), []);
  assert.deepEqual(ids(f.query([path.join(f.target, "lib/a.js")], { repository: "repo-a" })), ids(f.query(["lib/a.js"], { repository: "repo-a" })));
});

test("warm refresh updates and deletes postings, version incompatibility and invalid postings rebuild", t => {
  const f = fixture(t);
  const file = f.entry("entry", refs("src/old.js"));
  const cold = f.query(["src/old.js"]);
  assert.equal(cold.cache.status, "rebuilt");
  const warm = f.query(["src/old.js"]);
  assert.equal(warm.cache.status, "hit");
  assert.deepEqual(warm.entries, cold.entries);
  f.entry("entry", refs("src/longer-new.js"));
  const updated = f.query(["src/old.js", "src/longer-new.js"]);
  assert.equal(updated.cache.status, "refreshed");
  assert.deepEqual(updated.unmatchedPaths, ["src/old.js"]);
  f.entry("added", refs("src/added.js"));
  const added = f.query(["src/added.js"]);
  assert.equal(added.cache.status, "refreshed");
  assert.deepEqual(ids(added), ["added"]);
  const snapshotFile = cachePaths(f.context).snapshot;
  for (const corrupt of [s => { s.extractorVersion = -1; }, s => { s.pathIndex.files = {}; }, s => { s.schemaVersion = 1; }, s => { s.documents["entry:entry"].codeReferences[0].path = null; }]) {
    const snapshot = JSON.parse(fs.readFileSync(snapshotFile));
    corrupt(snapshot);
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot));
    assert.equal(f.query(["src/longer-new.js"]).cache.status, "rebuilt");
  }
  fs.unlinkSync(file);
  assert.deepEqual(ids(f.query(["src/longer-new.js"])), []);
});

test("linked decisions and incoming replacements are bounded, explicit, and do not expand cycles", t => {
  const f = fixture(t);
  f.entry("implementation", refs("src/a.js"), "", { links: [{ toEntryId: "decision", relation: "references" }] });
  f.entry("decision", refs("src/a.js"), "", { entryType: "decision", links: [{ toEntryId: "implementation", relation: "references" }] });
  f.entry("replacement", [], "", { entryType: "decision", links: [{ toEntryId: "decision", relation: "supersedes" }] });
  f.entry("second-hop", [], "", { entryType: "decision", links: [{ toEntryId: "replacement", relation: "references" }] });
  const result = f.query(["src/a.js"]);
  assert.deepEqual(new Set(ids(result)), new Set(["implementation", "decision", "replacement"]));
  const old = result.entries.find(e => e.id === "decision");
  assert.equal(old.supersededBy[0].id, "replacement");
  assert.equal(result.entries.find(e => e.id === "replacement").matches[0].kind, "linked_context");
  assert.equal(result.entries.find(e => e.id === "replacement").matches[0].direction, "incoming");
  assert.equal(result.relatedTruncated, false);
  const limited = f.query(["src/a.js"], { limit: 1 });
  assert.equal(limited.truncated, true);
  assert.equal(limited.totalEntries, 3);
  assert.equal(limited.paths[0].directMatches, 2);
  assert.equal(limited.paths[0].returnedDirectMatches, 1);
});

test("duplicate IDs preserve separate path matches and do not resolve ambiguous linked decisions", t => {
  const f = fixture(t);
  f.entry("first", refs("src/a.js"), "", { id: "duplicate", entryType: "decision" });
  f.entry("second", refs("src/a.js"), "", { id: "duplicate", entryType: "decision" });
  f.entry("source", refs("src/a.js"), "", { links: [{ toEntryId: "duplicate", relation: "references" }] });
  const result = f.query(["src/a.js"]);
  assert.equal(new Set(result.entries.map(e => e.documentId)).size, 3);
  assert.ok(result.warnings.some(w => w.code === "AMBIGUOUS_PATH_EVIDENCE_LINK"));
  assert.ok(result.entries.every(e => e.matches.every(m => m.kind !== "linked_context")));
});

test("memory fallback, refresh locks, and no-cache preserve evidence", t => {
  const f = fixture(t);
  f.entry("entry", refs("src/a.js"));
  const memory = f.query(["src/a.js"], { noCache: true });
  assert.equal(memory.cache.mode, "memory");
  assert.equal(fs.existsSync(cachePaths(f.context).snapshot), false);
  const persistent = f.query(["src/a.js"]);
  assert.deepEqual(memory.entries, persistent.entries);
  const blocker = path.join(f.base, "blocker");
  fs.writeFileSync(blocker, "file");
  const fallback = f.query(["src/a.js"], { cacheDir: path.join(blocker, "cache"), rebuild: true });
  assert.equal(fallback.cache.mode, "memory");
  assert.deepEqual(fallback.entries, memory.entries);
  fs.writeFileSync(cachePaths(f.context).lock, "locked");
  const locked = f.query(["src/a.js"], { rebuild: true });
  assert.ok(locked.warnings.some(w => w.code === "RECALL_CACHE_LOCKED"));
  assert.deepEqual(locked.entries, memory.entries);
});

test("reference and graph limits report partial coverage", t => {
  const f = fixture(t);
  const references = Array.from({ length: 1001 }, (_, i) => ({ path: `src/${i}.js` }));
  f.entry("large", references);
  const links = Array.from({ length: 205 }, (_, i) => ({ toEntryId: `decision-${i}`, relation: "references" }));
  f.entry("source", refs("src/a.js"), "", { links });
  for (let i = 0; i < 205; i++) f.entry(`decision-${i}`, [], "", { entryType: "decision" });
  const result = f.query(["src/a.js", "src/1000.js"], { limit: 100 });
  assert.equal(result.relatedTruncated, true);
  assert.equal(result.truncated, true);
  assert.ok(result.warnings.some(w => w.code === "CODE_REFERENCES_TRUNCATED"));
  assert.deepEqual(result.unmatchedPaths, ["src/1000.js"]);
  assert.ok(f.query(["src/a.js"]).warnings.some(w => w.code === "CODE_REFERENCES_TRUNCATED"));
});

test("CLI validates path arguments, filters and limits and returns JSON from canonical store", t => {
  const f = fixture(t);
  f.entry("entry", refs("docs/My Guide.md"));
  assert.deepEqual(parseArgs(["recall", "files", "src/a.js", "--repository", "repo-a", "src/b.js", "--limit", "5"]).paths, ["src/a.js", "src/b.js"]);
  for (const args of [["recall", "files"], ["recall", "files", "../escape.js"], ["recall", "files", "a.js", "--limit", "0"], ["recall", "files", "a.js", "--type", "decision"], ["recall", "index", "--repository", "a"], ["recall", "files", "a.js", "--repository="]]) assert.throws(() => parseArgs(args), e => e.code === "USAGE");
  assert.throws(() => normalizeInputs(Array(101).fill("a.js")), e => e.code === "USAGE");
  assert.throws(() => f.query([path.join(f.base, "outside.js")]), e => e.code === "USAGE");
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../bin/journal.js"), "recall", "files", "docs/My Guide.md", "--target", f.target, "--json", "--no-cache"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.action, "recall-files");
  assert.deepEqual(ids(parsed), ["entry"]);
  assert.equal(parsed.cache.mode, "memory");
});


test("invalid reference metadata is diagnosed and unusual explicit names remain exact", t => {
  const f = fixture(t);
  f.entry("special", refs("README.md", ".gitignore", "docs/My File.md", "constructor", "__proto__"));
  const special = f.query(["README.md#L1-L2", ".gitignore", "docs/./My File.md:2:3", "constructor", "__proto__"]);
  assert.equal(special.unmatchedPaths.length, 0);
  assert.equal(special.entries[0].matches.length, 5);
  f.entry("invalid", [{ path: "../escape.js" }, { path: "https://example.com/a.js" }, { path: "src/a.js", kind: "glob" }]);
  const result = f.query(["src/a.js"]);
  assert.deepEqual(ids(result), []);
  assert.ok(result.warnings.some(w => w.code === "INVALID_CODE_REFERENCES"));
  assert.throws(() => f.query(["src/*.js"]), e => e.code === "USAGE");
  assert.throws(() => f.query([".journal/work/a.md"]), e => e.code === "USAGE");
  if (process.platform === "win32") assert.deepEqual(normalizeInputs(["src\\a.js"]), ["src/a.js"]);
  else assert.deepEqual(normalizeInputs(["src\\a.js"]), ["src\\a.js"]);
});

test("linked evidence honors repository labels and refuses contradictory target paths", t => {
  const f = fixture(t);
  f.entry("source", [{ path: "src/a.js", repository: "local" }], "", { links: [
    { toEntryId: "foreign", relation: "references" },
    { toEntryId: "bad-link", relation: "references", targetPath: "wrong.md" },
    { toEntryId: "good-link", relation: "references", targetPath: "good-link.md" },
  ] });
  f.entry("foreign", [{ path: "src/a.js", repository: "other" }], "", { entryType: "decision" });
  f.entry("bad-link", [], "", { entryType: "decision" });
  f.entry("good-link", [], "", { entryType: "decision" });
  const result = f.query(["src/a.js"], { repository: "local" });
  assert.deepEqual(new Set(ids(result)), new Set(["source", "good-link"]));
  assert.ok(result.warnings.some(w => w.code === "INCONSISTENT_PATH_EVIDENCE_LINK"));
});
