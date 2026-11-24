"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { makeTempDir } = require("./helpers/temp");

const sourceRoot = path.resolve(__dirname, "..");
const djournalHome = makeTempDir("djournal-agent-home-");
process.env.DJOURNAL_HOME = djournalHome;

const {
  InstallerError,
  bindWork,
  configure,
  createJournalEntry,
  createWork,
  install,
  listWork,
  pull,
  status,
  sync,
  upgrade,
  validateEntries,
} = require("../lib/installer/index.js");
const { parseArgs } = require("../bin/journal.js");
const { isUuidV7 } = require("../lib/journal-entries.js");

function target(name = "agent-journal-") {
  return makeTempDir(name);
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function writeWork(store, slug, contents = {}) {
  const directory = path.join(store, ".journal/work", slug, "journal");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(store, ".journal/work", slug, "work.md"), [
    "---",
    `id: ${contents.id || "wi_01932a00-0000-7000-8000-000000000001"}`,
    `slug: ${slug}`,
    "title: Demo",
    "status: active",
    "visibility: local_only",
    "createdBy: test@local",
    "createdAt: \"2026-11-24T00:00:00.000Z\"",
    "updatedAt: \"2026-11-24T00:00:00.000Z\"",
    "---",
    "",
    "# Demo",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(store, ".journal/state.json"), JSON.stringify({ active_work_name: slug }));
}

function project(slug = "2026-11-24-01-demo") {
  const root = target();
  const store = path.join(djournalHome, "projects", path.basename(root));
  fs.mkdirSync(store, { recursive: true });
  fs.writeFileSync(path.join(root, ".djournal.json"), JSON.stringify({
    schemaVersion: 1,
    projectKey: path.basename(root),
    journalStore: store,
  }));
  writeWork(store, slug);
  fs.writeFileSync(path.join(store, "config.json"), JSON.stringify({
    sync: { enabled: false, mode: "colocated", path: root },
    updates: { intervalHours: 24 },
  }));
  return { root, store, slug };
}

test("work bind reads a session environment variable and refuses a shared fallback", () => {
  const { root, slug } = project();
  assert.throws(() => bindWork({ target: root, work: slug, env: {} }), (error) => error.code === "SESSION_REQUIRED" && /DJOURNAL_SESSION_ID/.test(error.message) && /CURSOR_CONVERSATION_ID/.test(error.message));

  const bound = bindWork({ target: root, work: slug, env: { DJOURNAL_SESSION_ID: "agent-a" } });
  assert.equal(bound.sessionSource, "DJOURNAL_SESSION_ID");
  assert.equal(bound.work, slug);

  const cursor = bindWork({ target: root, work: slug, env: { CURSOR_CONVERSATION_ID: "conv-1" } });
  assert.equal(cursor.sessionSource, "CURSOR_CONVERSATION_ID");
  assert.notEqual(cursor.sessionHash, bound.sessionHash);

  const explicit = bindWork({ target: root, work: slug, env: { DJOURNAL_SESSION_ID: "agent-a" }, session: "override" });
  assert.equal(explicit.sessionSource, "session");
});

test("session binding selects work without changing the shared fallback", () => {
  const root = target();
  const store = path.join(djournalHome, "projects", `select-${path.basename(root)}`);
  const first = "2026-11-24-01-first";
  const second = "2026-11-24-02-second";
  fs.writeFileSync(path.join(root, ".djournal.json"), JSON.stringify({ schemaVersion: 1, projectKey: path.basename(store), journalStore: store }));
  writeWork(store, first);
  writeWork(store, second);
  fs.writeFileSync(path.join(store, ".journal/state.json"), JSON.stringify({ active_work_name: first }));
  bindWork({ target: root, work: second, env: { AGENT_SESSION_ID: "agent-b" } });

  const listed = listWork({ target: root, env: { AGENT_SESSION_ID: "agent-b" } });
  assert.equal(listed.selected, second);
  assert.equal(listed.selectionSource, "session");
  assert.equal(JSON.parse(fs.readFileSync(path.join(store, ".journal/state.json"), "utf8")).active_work_name, first);

  const fallback = listWork({ target: root, env: {} });
  assert.equal(fallback.selected, first);
  assert.equal(fallback.selectionSource, "state");
});

test("entry new writes a v7 id in the store and avoids filename collisions", () => {
  const { root, store, slug } = project();
  const env = { JOURNAL_USER_ID: "tester@local" };
  const first = createJournalEntry({
    target: root,
    work: slug,
    entryType: "implementation",
    title: "Ship the fix",
    summary: "Recorded the store path.",
    name: "ship-the-fix",
    env,
    now: new Date("2026-11-24T03:00:00.000Z"),
  });
  const second = createJournalEntry({
    target: root,
    work: slug,
    entryType: "implementation",
    title: "Ship the fix",
    summary: "Recorded the store path again.",
    name: "ship-the-fix",
    env,
    now: new Date("2026-11-24T04:00:00.000Z"),
  });
  assert.equal(path.dirname(path.dirname(first.path)), path.join(store, ".journal/work", slug));
  assert.match(path.basename(first.path), /^2026-11-24-01-ship-the-fix\.md$/);
  assert.match(path.basename(second.path), /^2026-11-24-02-ship-the-fix\.md$/);
  assert.equal(isUuidV7(first.id, "ent"), true);
  assert.notEqual(first.id, second.id);
  const text = fs.readFileSync(first.path, "utf8");
  assert.match(text, new RegExp(`id: "${first.id}"`));
  assert.match(text, /source: "manual"/);
  assert.match(text, /workItemId: "wi_01932a00-0000-7000-8000-000000000001"/);

  const outside = createJournalEntry({ target: root, env, dryRun: true, entryType: "decision", title: "Choose", summary: "Chose the store.", name: "decision-store" });
  assert.equal(fs.existsSync(outside.path), false);
  assert.match(outside.path, /\/decisions\/\d{4}-\d{2}-\d{2}-\d{2}-decision-store\.md$/);
});

test("entry validate reports v4 ids and duplicate date sequences", () => {
  const { root, store, slug } = project();
  const journal = path.join(store, ".journal/work", slug, "journal");
  fs.writeFileSync(path.join(journal, "2026-11-24-01-one.md"), [
    "---",
    "id: ent_60e9dd12-1111-4111-8111-111111111111",
    "workItemId: wi_01932a00-0000-7000-8000-000000000001",
    "entryType: implementation",
    "title: One",
    "summary: First.",
    "createdBy: test@local",
    "createdAt: \"2026-11-24T00:00:00.000Z\"",
    "updatedAt: \"2026-11-24T00:00:00.000Z\"",
    "source: manual",
    "---",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(journal, "2026-11-24-01-two.md"), fs.readFileSync(path.join(journal, "2026-11-24-01-one.md"), "utf8").replace("ent_60e9dd12-1111-4111-8111-111111111111", "ent_01932a00-0000-7000-8000-000000000002"));
  const result = validateEntries({ target: root, work: slug });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "ID_NOT_V7" && issue.path.endsWith("2026-11-24-01-one.md")));
  assert.ok(result.issues.some((issue) => issue.code === "DUPLICATE_SEQUENCE"));
});

test("work new allocates the next slug and binds a session instead of the shared fallback", () => {
  const { root, store, slug } = project();
  const created = createWork({
    target: root,
    title: "Next stream",
    name: "next-stream",
    env: { DJOURNAL_SESSION_ID: "agent-c", JOURNAL_USER_ID: "tester@local" },
    now: new Date("2026-11-24T05:00:00.000Z"),
  });
  assert.match(created.slug, /^2026-11-24-02-next-stream$/);
  assert.equal(isUuidV7(created.id, "wi"), true);
  assert.equal(created.selectionSource, "session");
  assert.equal(JSON.parse(fs.readFileSync(path.join(store, ".journal/state.json"), "utf8")).active_work_name, slug);
  assert.equal(fs.existsSync(path.join(store, ".journal/work", created.slug, "journal")), true);

  const again = createWork({
    target: root,
    title: "Next stream",
    name: "next-stream",
    env: { DJOURNAL_SESSION_ID: "agent-c", JOURNAL_USER_ID: "tester@local" },
    now: new Date("2026-11-24T06:00:00.000Z"),
  });
  assert.match(again.slug, /^2026-11-24-03-next-stream$/);
});

test("commands in a sync checkout use the canonical store", () => {
  const { root, store, slug } = project();
  const checkout = target("journal-checkout-");
  git(checkout, ["init"]);
  git(checkout, ["config", "user.email", "test@local"]);
  git(checkout, ["config", "user.name", "Test"]);
  fs.mkdirSync(path.join(checkout, ".journal/work", slug, "journal"), { recursive: true });
  fs.writeFileSync(path.join(checkout, "README.md"), "checkout\n");
  git(checkout, ["add", "README.md"]);
  git(checkout, ["commit", "-m", "init"]);
  configure({ target: root, key: "sync.enabled", value: "true", env: {} });
  configure({ target: root, key: "sync.mode", value: "standalone", env: {} });
  configure({ target: root, key: "sync.path", value: checkout, env: {} });
  const planted = status({ target: root, env: {}, allowTest: true, now: new Date() });
  assert.equal(planted.canonical, true);
  const marker = path.join(checkout, ".journal/.djournal-projection.json");
  assert.equal(fs.existsSync(marker), true);
  assert.equal(JSON.parse(fs.readFileSync(marker, "utf8")).journalStore, store);
  assert.match(fs.readFileSync(path.join(checkout, ".git/info/exclude"), "utf8"), /\.journal\/\.djournal-projection\.json/);

  const nested = path.join(checkout, ".journal/work", slug);
  const reported = status({ target: nested, env: {}, allowTest: true, now: new Date() });
  assert.equal(reported.target, root);
  assert.equal(reported.canonical, true);
  assert.equal(reported.journalRoot, path.join(store, ".journal"));
  assert.equal(reported.projectionRedirect.from, nested);

  const entry = createJournalEntry({
    target: checkout,
    entryType: "status",
    title: "From the checkout",
    summary: "Landed in the store.",
    env: { JOURNAL_USER_ID: "tester@local" },
    now: new Date("2026-11-24T07:00:00.000Z"),
  });
  assert.equal(entry.path.startsWith(path.join(store, ".journal")), true);
  assert.equal(fs.existsSync(path.join(checkout, ".journal/work", slug, "journal", path.basename(entry.path))), false);
});

test("sync conflict names the checkout and adopts identical or missing journal files safely", () => {
  const { root, store, slug } = project();
  const checkout = target("journal-conflict-");
  git(checkout, ["init"]);
  git(checkout, ["config", "user.email", "test@local"]);
  git(checkout, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(checkout, "README.md"), "checkout\n");
  git(checkout, ["add", "README.md"]);
  git(checkout, ["commit", "-m", "init"]);
  const remote = target("journal-remote-");
  git(remote, ["init", "--bare"]);
  git(checkout, ["remote", "add", "origin", remote]);
  git(checkout, ["push", "-u", "origin", "HEAD"]);
  fs.writeFileSync(path.join(store, "config.json"), JSON.stringify({
    sync: { enabled: true, mode: "standalone", path: checkout },
  }));
  const relative = `.journal/work/${slug}/journal/2026-11-24-01-same.md`;
  const body = "same bytes\n";
  fs.mkdirSync(path.dirname(path.join(store, relative)), { recursive: true });
  fs.writeFileSync(path.join(store, relative), body);
  fs.mkdirSync(path.dirname(path.join(checkout, relative)), { recursive: true });
  fs.writeFileSync(path.join(checkout, relative), body);

  const cleaned = pull({ target: root, env: {} });
  assert.equal(fs.existsSync(path.join(checkout, relative)), false);
  assert.equal(fs.readFileSync(path.join(store, relative), "utf8"), body);
  assert.ok(cleaned.normalizedDrift.some((item) => item.action === "drop-duplicate"));

  const stray = `.journal/work/${slug}/journal/2026-11-24-02-stray.md`;
  fs.mkdirSync(path.dirname(path.join(checkout, stray)), { recursive: true });
  fs.writeFileSync(path.join(checkout, stray), "only in checkout\n");
  assert.throws(() => pull({ target: root, env: {} }), (error) => {
    assert.equal(error.code, "SYNC_CONFLICT");
    assert.match(error.message, /checkout/);
    assert.match(error.message, new RegExp(store.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(error.message, /not in the canonical store/);
    assert.match(error.message, /--adopt/);
    return true;
  });
  assert.equal(fs.existsSync(path.join(store, stray)), false);

  const adopted = pull({ target: root, adopt: true, env: {} });
  assert.equal(fs.readFileSync(path.join(store, stray), "utf8"), "only in checkout\n");
  assert.equal(fs.existsSync(path.join(checkout, stray)), false);
  assert.ok(adopted.normalizedDrift.some((item) => item.action === "adopt-into-store"));

  fs.writeFileSync(path.join(store, stray), "store copy\n");
  fs.writeFileSync(path.join(checkout, stray), "checkout copy\n");
  assert.throws(() => pull({ target: root, adopt: true, env: {} }), (error) => error.code === "SYNC_CONFLICT" && /differs/.test(error.message));
  assert.equal(fs.readFileSync(path.join(store, stray), "utf8"), "store copy\n");
  assert.equal(fs.readFileSync(path.join(checkout, stray), "utf8"), "checkout copy\n");
});

test("pull dry-run fetches and does not merge", () => {
  const { root, store } = project();
  const checkout = target("journal-fetch-");
  fs.mkdirSync(path.join(checkout, ".journal"), { recursive: true });
  fs.mkdirSync(path.join(checkout, ".git"));
  fs.writeFileSync(path.join(store, "config.json"), JSON.stringify({
    sync: { enabled: true, mode: "standalone", path: checkout },
  }));
  const calls = [];
  const runner = (_command, args) => {
    calls.push(args);
    if (args.includes("rev-parse")) return { status: 0, stdout: `${checkout}\n`, stderr: "" };
    if (args.includes("fetch")) return { status: 0, stdout: "", stderr: "" };
    if (args.includes("rev-list")) return { status: 0, stdout: "3\n", stderr: "" };
    if (args.includes("HEAD...@{upstream}")) return { status: 0, stdout: ".journal/work/demo/work.md\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const result = pull({ target: root, dryRun: true, runner, env: {} });
  assert.equal(result.fetched, true);
  assert.equal(result.remoteAhead, 3);
  assert.deepEqual(result.remoteJournalFiles, [".journal/work/demo/work.md"]);
  assert.equal(calls.some((args) => args.includes("fetch")), true);
  assert.equal(calls.some((args) => args.includes("pull")), false);
});

test("config dry-run reports an unchanged value and upgrade dry-run lists only changes", async () => {
  const root = target();
  await install({ sourceRoot, target: root, instructionsOnly: true, interactive: false });
  const same = configure({ target: root, key: "updates.intervalHours", value: "24", dryRun: true, env: {} });
  assert.equal(same.changed, false);
  assert.equal(same.dryRun, true);
  const next = configure({ target: root, key: "updates.intervalHours", value: "12", dryRun: true, env: {} });
  assert.equal(next.changed, true);
  const saved = configure({ target: root, key: "updates.intervalHours", env: {} });
  assert.equal(saved.value, 24);

  const preview = await upgrade({ sourceRoot, target: root, dryRun: true });
  assert.equal(preview.operations.includes(".agents/skills/journal-entry/SKILL.md"), false);
  assert.equal(preview.operations.length, 0);
});

test("version is a flag and entry creation refuses a directory that is not a store", () => {
  assert.equal(parseArgs(["--version"]).command, "version");
  assert.equal(parseArgs(["-v", "--json"]).json, true);
  const bare = target("not-a-store-");
  fs.mkdirSync(path.join(bare, ".journal/work/example"), { recursive: true });
  assert.throws(() => createJournalEntry({
    target: bare,
    entryType: "manual",
    title: "Nope",
    summary: "Should not land here.",
    env: {},
  }), (error) => error.code === "JOURNAL_PROJECTION");
  assert.equal(fs.readdirSync(path.join(bare, ".journal/work/example")).length, 0);
});

test("sync uses the session binding when --work is omitted", () => {
  const root = target();
  const store = path.join(djournalHome, "projects", `sync-bind-${path.basename(root)}`);
  const first = "2026-11-24-01-first";
  const second = "2026-11-24-02-second";
  fs.writeFileSync(path.join(root, ".djournal.json"), JSON.stringify({ schemaVersion: 1, projectKey: path.basename(store), journalStore: store }));
  for (const slug of [first, second]) {
    writeWork(store, slug);
    fs.writeFileSync(path.join(store, ".journal/work", slug, "journal/note.md"), `${slug}\n`);
  }
  fs.writeFileSync(path.join(store, ".journal/state.json"), JSON.stringify({ active_work_name: first }));
  fs.writeFileSync(path.join(store, "config.json"), JSON.stringify({
    sync: { enabled: true, mode: "colocated", path: root },
    sharing: { sharedWorkItems: { [second]: { sharedAt: "2026-11-24T00:00:00.000Z", sharedBy: "test@local" } } },
  }));
  bindWork({ target: root, work: second, env: { DJOURNAL_SESSION_ID: "agent-d" } });
  const result = sync({ target: root, env: { DJOURNAL_SESSION_ID: "agent-d" } });
  assert.equal(result.work, second);
  assert.equal(fs.existsSync(path.join(root, ".journal/work", second, "journal/note.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".journal/work", first, "journal/note.md")), false);
});
