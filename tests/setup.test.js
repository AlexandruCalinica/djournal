"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const { spawnSync } = require("node:child_process");
const { stripVTControlCharacters } = require("node:util");
const test = require("node:test");
const { setup, terminal, Cancelled, Back } = require("../lib/setup.js");
const { listEntries, openEntry, recallEntry } = require("../lib/setup-entries.js");
const { filterFields } = require("../lib/setup-filters.js");
const { presentation } = require("../lib/setup-style.js");
const { parseArgs, print } = require("../bin/journal.js");
const installer = require("../lib/installer/index.js");
const sourceRoot = path.resolve(__dirname, "..");

// Readline disables line editing under TERM=dumb. These stream fixtures model
// an interactive terminal; presentation fallbacks are tested with explicit envs.
const originalTerm = process.env.TERM;
if (!originalTerm || originalTerm === "dumb") process.env.TERM = "xterm-256color";
test.after(() => {
  if (originalTerm === undefined) delete process.env.TERM;
  else process.env.TERM = originalTerm;
});

function scripted(answers) {
  const messages = [];
  const queue = [...answers];
  let closed = false;
  const next = () => {
    assert.ok(queue.length, "unexpected prompt");
    const value = queue.shift();
    if (value instanceof Error) throw value;
    return value;
  };
  return {
    messages,
    async choose(message, choices) {
      const value = next();
      assert.ok(choices.some(([key]) => key === value), `unavailable choice ${value}: ${message}`);
      return value;
    },
    async search(message, source, { query } = {}) {
      const answer = next();
      query = answer.query ?? query;
      const result = query.trim() ? await source(query, { signal: new AbortController().signal }) : { choices: [] };
      if (result.message) messages.push(result.message);
      const value = typeof answer.select === "number" ? result.choices[answer.select][0] : answer.select;
      return { query, value };
    },
    async filters() { return next(); },
    async multiple() { return next(); },
    async confirm() { return next(); },
    async text() { return next(); },
    write(message) { messages.push(message); },
    close() { closed = true; },
    verify() { assert.equal(queue.length, 0); assert.equal(closed, true); },
  };
}
const config = { sync: { enabled: false, mode: "colocated", path: "/old", auto: false }, updates: { enabled: true, intervalHours: 24 } };

test("setup accepts a target and help but rejects automation flags", () => {
  assert.equal(parseArgs(["setup", "--target", "/tmp"]).target, "/tmp");
  assert.throws(() => parseArgs(["setup", "--help"]), { code: "HELP" });
  for (const flag of ["--json", "--yes", "--dry-run", "--harness", "--session", "--auto"]) {
    assert.throws(() => parseArgs(["setup", flag]), { code: "USAGE" });
  }
  const result = spawnSync(process.execPath, [path.join(sourceRoot, "bin/journal.js"), "setup"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires an interactive terminal/);
});

test("argument-free aliases open the wizard while explicit commands remain noninteractive", () => {
  assert.equal(parseArgs([]).command, "setup");
  assert.equal(parseArgs(["status", "--json"]).command, "status");
  assert.equal(parseArgs(["recall", "search", "example", "--json"]).query, "example");
  assert.throws(() => parseArgs(["--help"]), { code: "HELP" });
  assert.throws(() => parseArgs(["not-a-command"]), { code: "USAGE" });
  assert.throws(() => parseArgs([""]), { code: "USAGE" });
  const bins = require("../package.json").bin;
  for (const name of ["djournal", "journal"]) {
    const bin = path.join(sourceRoot, bins[name]);
    const noArgs = spawnSync(process.execPath, [bin], { encoding: "utf8" });
    assert.equal(noArgs.status, 1);
    assert.match(noArgs.stderr, /interactive terminal/);
    assert.equal(noArgs.stdout, "");
    const help = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.match(help.stderr, /Open the interactive journal/);
    const status = spawnSync(process.execPath, [bin, "status", "--json", "--target", sourceRoot], { encoding: "utf8" });
    assert.ok([0, 2].includes(status.status));
    assert.equal(JSON.parse(status.stdout).target, sourceRoot);
    assert.doesNotMatch(status.stdout, /\x1b\[/);
  }
});

test("recall searches canonical Markdown across work items and opens the selected result", async () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "wizard-recall-"));
  const store = path.join(target, "store");
  const root = path.join(store, ".journal");
  const work = path.join(root, "work/chosen");
  fs.mkdirSync(path.join(work, "journal"), { recursive: true });
  fs.writeFileSync(path.join(target, ".djournal.json"), JSON.stringify({ schemaVersion: 1, projectKey: "wizard-test", journalStore: store }));
  fs.writeFileSync(path.join(work, "work.md"), '---\nid: wi_test\ntitle: Historical work\nstatus: completed\nvisibility: local_only\n---\n');
  const relative = "work/chosen/journal/entry.md";
  fs.writeFileSync(path.join(root, relative), '---\nid: ent_test\nworkItemId: wi_test\nentryType: decision\ntitle: Quasar lookup\nsummary: A durable lookup decision.\n---\n# Quasar lookup\n');
  const ui = scripted(["recall", "search", { query: "quasar", select: 0 }, { query: "zzzzunmatched", select: "back" }, "index", "rebuild", false, "rebuild", true, "back", "exit"]);
  let opens = 0;
  try {
    const result = await setup({ target }, { ui, api: { openEntry(entry) {
      opens += 1; assert.equal(entry.root, root); assert.equal(entry.relative, relative);
      assert.match(fs.readFileSync(path.join(entry.root, entry.relative), "utf8"), /durable lookup decision/);
    } } });
    assert.deepEqual(result, { failed: false });
    assert.equal(opens, 1);
    assert.ok(ui.messages.some((message) => message.includes("No matches")));
    assert.ok(ui.messages.some((message) => message.includes("recall-index")));
    ui.verify();
    const item = { path: `.journal/${relative}`, workSlug: "chosen" };
    assert.deepEqual(recallEntry(item, { target }), { root, relative });
    assert.equal(recallEntry({ path: ".journal/work/chosen/work.md", workSlug: "chosen" }, { target }).relative, "work/chosen/work.md");
    for (const unsafe of ["../outside.md", ".journal/work/chosen/journal/../../../../outside.md", ".journal/work/chosen/secrets.md", ".journal/work/other/work.md"]) {
      assert.throws(() => recallEntry({ ...item, path: unsafe }, { target }), { code: "UNSAFE_PATH" });
    }
    fs.unlinkSync(path.join(root, relative));
    assert.throws(() => recallEntry(item, { target }), { code: "ENOENT" });
    fs.symlinkSync(path.join(work, "work.md"), path.join(root, relative));
    assert.throws(() => recallEntry(item, { target }), { code: "UNSAFE_PATH" });
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test("recall stages filters, preserves them on Escape, and recovers from editor errors", async () => {
  const ui = scripted(["recall", "search", { query: "query", select: "filters" }, { work: "chosen", kind: "entry", type: "decision", status: "completed", visibility: "local_only", limit: 25 },
    { select: "filters" }, new Back(), { select: 0 }, { select: "back" }, "rebuild", new Back(), "back", "exit"]);
  const searches = [];
  const result = await setup({ target: "/tmp" }, { ui, api: {
    listWork: () => ({ workItems: [{ slug: "chosen", title: "Chosen" }] }),
    searchRecall(query, options) {
      searches.push({ query, options });
      return { workItems: [], entries: [{ title: "Decision", score: 1, path: ".journal/work/chosen/journal/entry.md", workSlug: "chosen" }],
        warnings: [{ code: "CACHE_MEMORY_FALLBACK" }] };
    },
    recallEntry: () => ({ root: "/tmp", relative: "entry.md" }),
    openEntry: () => { throw new installer.InstallerError("Editor unavailable", "EDITOR_ERROR"); },
    buildRecallIndex: () => assert.fail("cancelled rebuild must not run"),
  } });
  assert.equal(result.failed, true);
  assert.equal(searches[0].options.work, undefined);
  assert.ok(searches.every((search) => search.query === "query"));
  for (const search of searches.slice(1)) {
    const { work, kind, type, status, visibility, limit, target } = search.options;
    assert.deepEqual({ work, kind, type, status, visibility, limit, target }, { work: "chosen", kind: "entry", type: "decision", status: "completed", visibility: "local_only", limit: 25, target: "/tmp" });
  }
  assert.ok(ui.messages.some((message) => message.includes("CACHE_MEMORY_FALLBACK")));
  assert.ok(ui.messages.some((message) => message.includes("Editor unavailable")));
  ui.verify();
});

test("status and guided uninstall use existing services and require confirmation", async () => {
  const ui = scripted(["status", "uninstall", "all", false, "uninstall", "codex", new Back(), "uninstall", "codex", true, "uninstall", "all", true, "exit"]);
  const calls = [];
  const result = await setup({ target: "/tmp" }, { ui, api: {
    status: (options) => { calls.push(["status", options]); return { installed: true }; },
    loadManifest: () => ({ harnesses: ["codex", "pi"] }),
    uninstall: (options) => { calls.push(["uninstall", options]); return { action: "uninstall", conflicts: [] }; },
  } });
  assert.deepEqual(result, { failed: false });
  assert.deepEqual(calls.map(([name]) => name), ["status", "uninstall", "uninstall"]);
  assert.deepEqual(calls[1][1].harnesses, ["codex"]);
  assert.equal(calls[2][1].all, true);
  assert.ok(calls.every(([, options]) => options.target === "/tmp"));
  ui.verify();
});

test("simple actions preserve target, report failures, and return to the menu", async () => {
  const ui = scripted(["upgrade", true, "update", "doctor", "exit"]);
  const calls = [];
  const api = Object.fromEntries(["upgrade", "checkUpdates", "doctor"].map((name) => [name, async (options) => {
    calls.push([name, options]);
    return name === "doctor" ? { ok: false } : { updateAvailable: name === "checkUpdates" };
  }]));
  assert.deepEqual(await setup({ target: "/tmp", sourceRoot }, { ui, api }), { failed: true });
  assert.deepEqual(calls.map(([name]) => name), ["upgrade", "checkUpdates", "doctor"]);
  assert.ok(calls.every(([, options]) => options.target === "/tmp" && options.sourceRoot === sourceRoot));
  assert.ok(ui.messages.some((message) => message.includes("npm install -g djournal@latest")));
  ui.verify();
});

test("configuration stages changes and writes nothing when cancelled or declined", async () => {
  for (const end of [new Cancelled(), false]) {
    const ui = scripted(["configure", "colocated", false, end, ...(end === false ? ["exit"] : [])]);
    const writes = [];
    const result = await setup({ target: "/tmp" }, { ui, api: { configure(options) {
      if (options.key) writes.push(options);
      return { config };
    } } });
    assert.equal(writes.length, 0);
    assert.equal(!!result.cancelled, end instanceof Cancelled);
    ui.verify();
  }
});

test("install uses custom integrations and follows with real persisted configuration", async () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "setup-project-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "setup-store-"));
  const original = process.env.DJOURNAL_HOME;
  process.env.DJOURNAL_HOME = home;
  const ui = scripted(["install", "custom", ["codex", "pi"], true, "colocated", false, true, "exit"]);
  try {
    assert.deepEqual(await setup({ target, sourceRoot }, { ui }), { failed: false });
    assert.deepEqual(installer.loadManifest(target).harnesses, ["codex", "pi"]);
    const saved = installer.configure({ target }).config;
    assert.equal(saved.sync.enabled, true);
    assert.equal(saved.sync.path, target);
    assert.equal(saved.sync.mode, "colocated");
    assert.equal(saved.updates.enabled, false);
    ui.verify();
  } finally {
    if (original === undefined) delete process.env.DJOURNAL_HOME;
    else process.env.DJOURNAL_HOME = original;
    fs.rmSync(target, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("standalone configuration resolves relative path and preserves unrelated fields", async () => {
  const ui = scripted(["configure", "standalone", "../journal", true, true, "12", true, "exit"]);
  const writes = [];
  await setup({ target: "/tmp/project" }, { ui, api: { configure(options) {
    if (options.key) writes.push([options.key, options.value]);
    return { config };
  } } });
  assert.deepEqual(writes, [["sync.mode", "standalone"], ["sync.path", "/tmp/journal"], ["sync.auto", "true"], ["sync.enabled", "true"], ["updates.intervalHours", "12"]]);
  ui.verify();
});

test("list actions always use the selected slug and require confirmation", async () => {
  const ui = scripted(["list", "chosen", "share", false, "share", true, "pull", true, "sync", true, "bindWork", "session-1", true, "back", "back", "exit"]);
  const calls = [];
  const api = {
    listWork: () => ({ workItems: [{ slug: "chosen", title: "Chosen work", status: "active", visibility: "local_only" }] }),
    configure: () => ({ config: { ...config, sync: { enabled: true } } }),
  };
  for (const name of ["share", "pull", "sync", "bindWork"]) api[name] = (options) => { calls.push([name, options]); return {}; };
  await setup({ target: "/tmp" }, { ui, api });
  assert.deepEqual(calls.map(([name]) => name), ["share", "pull", "sync", "bindWork"]);
  assert.ok(calls.every(([, options]) => options.work === "chosen"));
  assert.equal(calls[3][1].session, "session-1");
  ui.verify();
});

test("list offers configuration before sharing and does not share when it stays disabled", async () => {
  const ui = scripted(["list", "chosen", "share", true, "back", "back", "back", "exit"]);
  await setup({ target: "/tmp" }, { ui, api: {
    listWork: () => ({ workItems: [{ slug: "chosen", title: "Chosen", status: "paused" }] }),
    configure: () => ({ config }),
    share: () => assert.fail("must not share while sync is disabled"),
  } });
  ui.verify();
});

test("installation supports all, individual, and instructions-only choices", async () => {
  for (const choice of ["all", ...installer.SUPPORTED_HARNESSES, "instructions"]) {
    const ui = scripted(["install", choice, true, "back", "exit"]);
    let installed;
    await setup({ target: "/tmp", sourceRoot }, { ui, api: {
      detectHarnesses: () => ({ supported: [] }),
      install: (options) => { installed = options; return {}; },
      configure: () => ({ config }),
    } });
    assert.deepEqual(installed.harnesses, choice === "all" ? installer.SUPPORTED_HARNESSES : choice === "instructions" ? [] : [choice]);
    assert.equal(installed.instructionsOnly, choice === "instructions");
    ui.verify();
  }
});

test("result output identifies synchronized work, skipped operations, and sharing warnings", () => {
  let output = "";
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { output += chunk; return true; };
  try {
    print({ action: "pull", target: "/tmp", workItems: ["chosen"], skipped: true, reason: "no projection" });
    print({ action: "share", target: "/tmp", work: "chosen", shared: true, warning: "ignored by Git" });
  } finally { process.stdout.write = original; }
  assert.match(output, /chosen/);
  assert.match(output, /skipped: no projection/);
  assert.match(output, /marked for sharing/);
  assert.match(output, /warning: ignored by Git/);
  assert.doesNotMatch(output, /undefined/);
});

test("empty work lists and missing installs offer a recovery path", async () => {
  const ui = scripted(["list", "configure", "exit"]);
  const result = await setup({ target: "/tmp" }, { ui, api: {
    listWork() { throw new installer.InstallerError("empty", "NO_ACTIVE_WORK"); },
    configure() { throw new installer.InstallerError("missing", "NOT_INSTALLED"); },
  } });
  assert.equal(result.failed, true);
  assert.ok(ui.messages.some((message) => message.includes("No work items")));
  assert.ok(ui.messages.some((message) => message.includes("Choose Install")));
  ui.verify();
});

// Drive the real library through terminal streams; wait for each render before keys.
function interactive({ columns = 80, rows = 24, env = process.env } = {}) {
  const input = new PassThrough(); input.isTTY = true;
  const output = new PassThrough(); output.isTTY = true;
  output.columns = columns; output.rows = rows;
  output.end = () => output; // Like process.stdout, remain open between prompts.
  let screen = ""; output.on("data", (chunk) => { screen += chunk; });
  const ui = terminal(input, output, env);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
  return { input, output, ui, tick, screen: () => screen };
}

test("terminal supports arrow menus, checkbox selection, defaults, and validation", async () => {
  const { input, ui, tick, screen } = interactive();
  try {
    const choice = ui.choose("Pick", [["one", "One"], ["two", "Two"]]);
    await tick(); input.write("\x1b[B"); input.write("\r");
    assert.equal(await choice, "two");
    const multiple = ui.multiple("Integrations", [["codex", "Codex"], ["pi", "Pi"]], ["codex"]);
    await tick(); input.write("\x1b[B"); input.write(" "); input.write("\r");
    assert.deepEqual(await multiple, ["codex", "pi"]);
    const confirm = ui.confirm("Save?", true);
    await tick(); input.write("\r");
    assert.equal(await confirm, true);
    const value = ui.text("Interval", "24", (answer) => Number(answer) > 0);
    await tick(); input.write("bad\r"); await tick();
    assert.match(screen(), /Enter a valid value/);
    const cancelled = assert.rejects(value, Cancelled);
    input.write("\x03"); await cancelled;
    const valid = ui.text("Interval", "24", (answer) => Number(answer) > 0);
    await tick(); input.write("12\r");
    assert.equal(await valid, "12");
  } finally { ui.close(); }
});

test("terminal Ctrl-C, Ctrl-D, and stream EOF cancel and release listeners", async () => {
  for (const key of ["\x03", "\x04", null]) {
    const { input, ui, tick } = interactive();
    const pending = ui.confirm("Save?");
    const cancelled = assert.rejects(pending, Cancelled);
    await tick();
    if (key === null) input.end(); else input.write(key);
    await cancelled;
    ui.close();
    assert.equal(input.listenerCount("keypress"), 0);
    assert.equal(input.listenerCount("end"), 0);
    assert.equal(input.listenerCount("close"), 0);
  }
});

test("Escape backs out of every prompt type without cancelling subsequent prompts", async () => {
  const { input, ui, tick } = interactive();
  try {
    for (const prompt of [() => ui.choose("Pick", [["one", "One"]]), () => ui.multiple("Pick", [["one", "One"]]),
      () => ui.text("Text"), () => ui.confirm("Save?")]) {
      const pending = assert.rejects(prompt(), Back);
      await tick(); input.write("\x1b"); await pending;
      const next = ui.confirm("Still here?", true);
      await tick(); input.write("\r"); assert.equal(await next, true);
    }
  } finally { ui.close(); }
  assert.equal(input.listenerCount("keypress"), 0);
});

test("Escape returns to the immediate parent and discards unfinished operations", async () => {
  const ui = scripted([
    new Back(), // Root remains open.
    "install", "custom", new Back(),
    "configure", "standalone", new Back(),
    "configure", "colocated", false, new Back(), // Save confirmation.
    "list", "chosen", "bindWork", "session", new Back(),
    "share", new Back(), // Back to actions, not the root.
    new Back(), // Actions -> work picker.
    new Back(), // Work picker -> root.
    "exit",
  ]);
  const result = await setup({ target: "/tmp" }, { ui, api: {
    detectHarnesses: () => ({ supported: [] }),
    install: () => assert.fail("must not install"),
    bindWork: () => assert.fail("must not bind"),
    share: () => assert.fail("must not share"),
    configure: (options) => { assert.equal(options.key, undefined); return { config }; },
    listWork: () => ({ workItems: [{ slug: "chosen", title: "Chosen", status: "active" }] }),
  } });
  assert.deepEqual(result, { failed: false });
  ui.verify();
});

test("entry browsing returns after editor success or failure and handles empty journals", async () => {
  const ui = scripted(["list", "chosen", "entries", "entry.md", "entry.md", new Back(), "entries", new Back(), new Back(), "exit"]);
  let lists = 0, opens = 0;
  const record = { relative: "entry.md", title: "Entry", entryType: "manual", date: "2026-10-22" };
  const result = await setup({ target: "/tmp" }, { ui, api: {
    listWork: () => ({ workItems: [{ slug: "chosen", title: "Chosen", status: "active" }] }),
    listEntries(options) { assert.equal(options.work, "chosen"); return ++lists > 3 ? [] : [record]; },
    openEntry(entry, options) {
      assert.equal(entry, record); assert.equal(options.cwd, "/tmp");
      if (++opens === 1) throw new installer.InstallerError("missing editor", "EDITOR_ERROR");
    },
  } });
  assert.equal(opens, 2);
  assert.equal(result.failed, true);
  assert.ok(ui.messages.some((message) => message.includes("missing editor")));
  assert.ok(ui.messages.some((message) => message.includes("No journal entries")));
  ui.verify();
});

test("entry listing uses canonical storage, legacy titles, dates, and all supporting areas", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "setup-entries-"));
  const store = path.join(target, "canonical store");
  const root = path.join(store, ".journal");
  const write = (relative, content) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; };
  try {
    fs.writeFileSync(path.join(target, ".djournal.json"), JSON.stringify({ schemaVersion: 1, projectKey: "test", journalStore: store }));
    write("work/chosen/journal/2026-10-20-01-legacy.md", "# Legacy title\n");
    write("work/chosen/decisions/old-name.md", '---\ntitle: Newest decision\ncreatedAt: "2026-10-22T12:00:00.000Z"\nentryType: decision\n---\n');
    write("work/chosen/docs/reference.md", "---\ntitle: [broken\n---\n# Readable fallback\n");
    write("work/chosen/_research/nested/research.md", "# Research\n");
    write("work/other/journal/ignored.md", "# Other work\n");
    fs.mkdirSync(path.join(target, ".journal/work/chosen/journal"), { recursive: true });
    fs.writeFileSync(path.join(target, ".journal/work/chosen/journal/projection.md"), "# Wrong projection\n");
    fs.symlinkSync(path.join(target, "package-outside.md"), path.join(root, "work/chosen/journal/link.md"));
    const records = listEntries({ target, work: "chosen" });
    assert.equal(records.length, 4);
    assert.deepEqual(records.slice(0, 2).map((entry) => entry.title), ["Newest decision", "Legacy title"]);
    assert.ok(records.some((entry) => entry.title === "Readable fallback"));
    assert.ok(records.every((entry) => entry.root === root));
    // Recheck a file replaced with a symlink after listing.
    const entry = records[0];
    fs.unlinkSync(path.join(root, entry.relative));
    fs.symlinkSync(path.join(root, records[1].relative), path.join(root, entry.relative));
    assert.throws(() => openEntry(entry), { code: "UNSAFE_PATH" });
    fs.symlinkSync(path.join(root, "work/chosen"), path.join(root, "work/alias"));
    assert.throws(() => listEntries({ target, work: "alias" }), { code: "UNSAFE_PATH" });
    assert.throws(() => listEntries({ target, work: "../chosen" }), { code: "INVALID_WORK" });
    // Legacy local-only projects still work when no project marker/store exists.
    fs.mkdirSync(path.join(target, "local/.journal/work/chosen"), { recursive: true });
    assert.equal(listEntries({ target: path.join(target, "local"), work: "chosen", djournalHome: path.join(target, "isolated-home") }).length, 0);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test("editor command honors precedence and quoting without evaluating filename or arguments", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "setup-editor-"));
  const relative = "entry ' $(touch INJECTION); space.md";
  const capture = path.join(root, "argv.json");
  const script = path.join(root, "fake editor.js");
  fs.writeFileSync(path.join(root, relative), "# Entry\n");
  fs.writeFileSync(script, 'require("node:fs").writeFileSync(process.env.EDITOR_CAPTURE, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));');
  try {
    const command = `"${process.execPath}" "${script}" --wait 'argument with spaces' '$(touch INJECTION)'`;
    openEntry({ root, relative }, { cwd: root, env: { ...process.env, VISUAL: command, EDITOR: "missing-editor", EDITOR_CAPTURE: capture } });
    assert.deepEqual(JSON.parse(fs.readFileSync(capture)), { args: ["--wait", "argument with spaces", "$(touch INJECTION)", path.join(root, relative)], cwd: root });
    assert.equal(fs.existsSync(path.join(root, "INJECTION")), false);
    for (const env of [{ VISUAL: " ", EDITOR: "nano -R" }, {}]) {
      openEntry({ root, relative }, { env, spawnSync(bin, args, options) {
        assert.equal(bin, env.EDITOR ? "nano" : process.platform === "win32" ? "notepad" : "vi");
        assert.equal(args.at(-1), path.join(root, relative));
        assert.equal(options.shell, false); assert.equal(options.stdio, "inherit");
        return { status: 0 };
      } });
    }
    assert.throws(() => openEntry({ root, relative }, { env: { EDITOR: '"unclosed' } }), { code: "EDITOR_CONFIG" });
    assert.throws(() => openEntry({ root, relative }, { env: { EDITOR: "djournal-nonexistent-test-editor" } }), { code: "EDITOR_ERROR" });
    for (const result of [{ status: 2 }, { status: null, signal: "SIGINT" }]) {
      assert.throws(() => openEntry({ root, relative }, { env: {}, spawnSync: () => result }), { code: "EDITOR_ERROR" });
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("external editor handoff restores terminal state and prompts after failure", async () => {
  const { input, ui, tick } = interactive();
  input.isRaw = true;
  input.setRawMode = (raw) => { input.isRaw = raw; };
  try {
    await assert.rejects(ui.external(() => {
      assert.equal(input.isRaw, false);
      assert.equal(input.isPaused(), true);
      throw new Error("editor failed");
    }), /editor failed/);
    assert.equal(input.isRaw, true);
    const next = ui.confirm("Return to picker?", true);
    await tick(); input.write("\r"); assert.equal(await next, true);
  } finally { ui.close(); }
});

test("each prompt replaces the previous frame while retaining only fresh context", async () => {
  const { input, ui, tick, screen } = interactive();
  const clear = "\x1b[2J\x1b[H";
  const frame = () => screen().split(clear).at(-1);
  ui.header("djournal setup\nProject: /example");
  try {
    ui.write("Choose integrations for this project.");
    const first = ui.choose("First menu", [["one", "One"]]);
    await tick();
    assert.match(frame(), /djournal setup/);
    assert.match(frame(), /Choose integrations/);
    input.write("\r"); await first;

    ui.write("Proposed settings:"); ui.write("  sync.enabled: true");
    const next = ui.confirm("Save settings?");
    await tick();
    assert.match(frame(), /Project: \/example/);
    assert.match(frame(), /Proposed settings:[\s\S]*sync.enabled: true/);
    assert.doesNotMatch(frame(), /First menu|Choose integrations/);
    const back = assert.rejects(next, Back);
    input.write("\x1b"); await back;

    const parent = ui.choose("Parent menu", [["exit", "Exit"]]);
    await tick();
    assert.match(frame(), /Parent menu/);
    assert.doesNotMatch(frame(), /Save settings|Proposed settings|sync.enabled/);
    input.write("\r"); await parent;
  } finally { ui.close(); }
});

test("operation results and errors survive clearing until the next user transition", async () => {
  const { input, ui, tick, screen } = interactive();
  const frame = () => screen().split("\x1b[2J\x1b[H").at(-1);
  let calls = 0;
  const running = setup({ target: "/tmp" }, { ui, print, api: {
    doctor() {
      if (++calls === 2) throw new installer.InstallerError("Cannot inspect project", "CHECK_ERROR");
      return { ok: true, target: "/tmp", checks: [{ ok: true, name: "manifest", detail: "supported" }] };
    },
  } });
  await tick(); input.write("\x1b[B".repeat(7)); input.write("\r");
  await tick();
  assert.match(frame(), /ok: \/tmp/);
  assert.match(frame(), /ok manifest: supported/);
  assert.match(frame(), /What would you like to do\?/);
  await tick(); assert.match(frame(), /ok manifest: supported/);
  input.write("\x1b[B".repeat(7)); input.write("\r");
  await tick();
  assert.match(frame(), /CHECK_ERROR: Cannot inspect project/);
  assert.doesNotMatch(frame(), /ok manifest: supported/);
  input.write("\x03");
  assert.deepEqual(await running, { cancelled: true, failed: true });
  assert.match(frame(), /Wizard cancelled/);
  assert.doesNotMatch(frame(), /What would you like to do/);
});

test("returning from an editor clears its output before drawing the next picker", async () => {
  const { input, output, ui, tick, screen } = interactive();
  const frame = () => screen().split("\x1b[2J\x1b[H").at(-1);
  try {
    const before = ui.choose("Entry picker", [["entry", "Example entry"]]);
    await tick(); input.write("\r"); await before;
    await ui.external(() => {
      assert.equal(frame(), "");
      output.write("External editor content\n");
    });
    ui.write("EDITOR_ERROR: Editor exited unsuccessfully.");
    const after = ui.choose("Entry picker again", [["entry", "Example entry"]]);
    await tick();
    assert.match(frame(), /EDITOR_ERROR/);
    assert.match(frame(), /Entry picker again/);
    assert.doesNotMatch(frame(), /External editor content/);
    input.write("\r"); await after;
  } finally { ui.close(); }
});

test("presentation fits narrow terminals and retains full titles and paths in details", () => {
  const longTitle = "Investigate journal synchronization across several repositories";
  const location = "/a/very/long/project/path/that/must/remain/available/to/the/user";
  for (const columns of [40, 80]) {
    const style = presentation({ columns, rows: 24 }, { NO_COLOR: "1", FORCE_COLOR: "1" });
    const choices = style.choices([["entry", longTitle, location]]);
    const frame = style.frame({ project: location }, [], "select", "Choose an entry", choices);
    const description = style.theme("select").style.description(choices[0].description);
    for (const line of (frame.text + description).split("\n")) assert.ok(line.length < columns, line);
    assert.ok(frame.pageSize >= 3 && frame.pageSize <= 10);
    assert.ok(choices[0].description.includes(location));
    assert.equal(choices[0].value, "entry");
    if (columns === 40) {
      assert.match(frame.text, /djournal/);
      assert.ok(choices[0].description.includes(longTitle));
      assert.match(frame.text, /Esc back   Ctrl-C exit/);
    } else assert.ok(frame.text.includes("│  │    ▾ │   djournal"));
    assert.doesNotMatch(frame.text + description, /\x1b\[[\d;]*m/);
  }
  const output = { columns: 80, rows: 24, getColorDepth: () => 8 };
  const color = presentation(output, {}).theme("select").style.highlight("Selected");
  assert.match(color, /\x1b\[36m/);
  assert.equal(stripVTControlCharacters(color), "Selected");
  for (const env of [{ NO_COLOR: "1" }, { TERM: "dumb" }, { FORCE_COLOR: "0" }]) {
    assert.equal(presentation(output, env).theme("select").style.highlight("Selected"), "Selected");
  }
});

test("short menu labels reveal selected details and remain navigable without color", async () => {
  const { input, ui, tick, screen } = interactive({ columns: 40, rows: 20, env: { NO_COLOR: "1" } });
  ui.header({ project: "/tmp/project" });
  try {
    const pending = ui.choose("Choose an action", [
      ["first", "First action", "Details for the first action."],
      ["second", "Second action", "Details for the second action."],
    ]);
    await tick();
    assert.match(screen(), /> First action/);
    assert.match(screen(), /Details for the first action/);
    assert.doesNotMatch(screen(), /Details for the second action/);
    input.write("\x1b[B"); await tick();
    assert.match(screen(), /> Second action/);
    assert.match(screen(), /Details for the second action/);
    assert.doesNotMatch(screen(), /\x1b\[[\d;]*m/);
    input.write("\r"); assert.equal(await pending, "second");
  } finally { ui.close(); }
});

async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "timed out waiting for search");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("live recall debounces typing and displays selectable results without Enter", async () => {
  const { input, ui, tick, screen } = interactive();
  const calls = [];
  try {
    const pending = ui.search("Search journal", async (query) => {
      calls.push(query);
      return { choices: [[1, "First match"], [2, "Second match"]], message: "Two matches" };
    });
    await tick(); assert.deepEqual(calls, []);
    input.write("qua"); await tick(); input.write("sar");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(calls, []);
    await until(() => screen().includes("Second match"));
    assert.deepEqual(calls, ["quasar"]);
    input.write("\x1b[B"); input.write("\r");
    assert.deepEqual(await pending, { query: "quasar", value: 2 });
  } finally { ui.close(); }
});

test("live recall ignores stale responses and cannot select while a query is pending", async () => {
  const { input, ui, tick, screen } = interactive();
  const requests = [];
  let completed = false;
  try {
    const pending = ui.search("Search journal", (query, { signal }) => new Promise((resolve, reject) => {
      requests.push({ query, signal, resolve, reject });
    }), { query: "old" }).then((value) => { completed = true; return value; });
    await until(() => requests.length === 1);
    input.write("er"); input.write("\r"); await tick();
    assert.equal(completed, false);
    assert.equal(requests[0].signal.aborted, true);
    await until(() => requests.length === 2);
    assert.equal(requests[1].query, "older");
    requests[1].resolve({ choices: [[2, "Current result"]], message: "One match" });
    await until(() => screen().includes("Current result"));
    requests[0].resolve({ choices: [[1, "Stale result"]], message: "Old matches" });
    await tick(); assert.doesNotMatch(screen(), /Stale result/);
    // Invalidate already visible matches immediately as well.
    input.write("x"); input.write("\r"); await tick(); assert.equal(completed, false);
    await until(() => requests.length === 3);
    requests[2].resolve({ choices: [[3, "Newest result"]], message: "One match" });
    await until(() => screen().includes("Newest result"));
    input.write("\r");
    assert.deepEqual(await pending, { query: "olderx", value: 3 });
  } finally { ui.close(); }
});

test("live recall handles errors and empty queries, and preserves input after navigation", async () => {
  const { input, ui, tick, screen } = interactive();
  const calls = [];
  const source = async (query) => {
    calls.push(query);
    if (query === "bad") throw new Error("Search unavailable");
    return { choices: [], message: "No matches" };
  };
  try {
    const first = ui.search("Search journal", source, { query: "bad" });
    await until(() => screen().includes("Search unavailable"));
    input.write("\x15"); input.write("good");
    await until(() => screen().includes("No matches"));
    input.write("\t");
    assert.deepEqual(await first, { query: "good", value: "filters" });
    const second = ui.search("Search journal", source, { query: "good" });
    await until(() => calls.length === 3);
    await tick(); input.write("\x1b[B"); input.write("x");
    await until(() => calls.length === 4);
    assert.equal(calls[3], "goodx");
    input.write("\x15"); input.write("   "); await tick();
    input.write("\t");
    assert.deepEqual(await second, { query: "   ", value: "filters" });
    assert.deepEqual(calls, ["bad", "good", "good", "goodx"]);
  } finally { ui.close(); }
});

test("live recall cancels debounce timers and in-flight results on exit", async () => {
  for (const inFlight of [false, true]) {
    for (const key of ["\x1b", "\x03", "\x04", null]) {
      const { input, ui, tick, screen } = interactive();
      const calls = [];
      const pending = ui.search("Search journal", (query, { signal }) => new Promise((resolve, reject) => {
        calls.push({ query, signal, resolve, reject });
      }), { query: "cancel" });
      const rejected = assert.rejects(pending, key === "\x1b" ? Back : Cancelled);
      if (inFlight) await until(() => calls.length === 1); else await tick();
      // Emit Escape directly to avoid readline's escape-sequence timeout.
      if (key === "\x1b") input.emit("keypress", key, { name: "escape" });
      else if (key === null) input.end(); else input.write(key);
      await rejected;
      if (inFlight) {
        assert.equal(calls[0].signal.aborted, true);
        calls[0].reject(new Error("Late failure"));
      }
      await new Promise((resolve) => setTimeout(resolve, 280));
      assert.equal(calls.length, inFlight ? 1 : 0);
      assert.doesNotMatch(screen(), /Late failure/);
      ui.close();
      assert.equal(input.listenerCount("keypress"), 0);
    }
  }
});

test("flat filters edit any field in place and apply a draft without touching other values", async () => {
  const { input, ui, tick, screen } = interactive({ columns: 40, rows: 20 });
  const original = { limit: 10, status: "completed" };
  ui.header({ project: "/tmp/project" });
  try {
    const pending = ui.filters(original, filterFields([{ slug: "chosen", title: "Chosen work" }]));
    await tick();
    for (const label of ["Work", "Kind", "Entry type", "Work status", "Visibility", "Result limit"]) assert.ok(screen().includes(label));
    input.write("\x1b[C"); // Work: Chosen work.
    input.write("\x1b[B".repeat(2)); input.write("\x1b[D"); // Entry type: decision.
    input.write("\x1b[B".repeat(3)); input.write("25");
    input.write("\r");
    assert.deepEqual(await pending, { work: "chosen", type: "decision", status: "completed", limit: 25 });
    assert.deepEqual(original, { limit: 10, status: "completed" });
    assert.equal(screen().split("\x1b[2J\x1b[H").length - 1, 1, "edits must stay on the same screen");
  } finally { ui.close(); }
});

test("flat filters validate numeric limits, reset drafts, and discard changes on Escape", async () => {
  const { input, ui, tick, screen } = interactive();
  const original = { limit: 100, type: "decision" };
  try {
    let applied = false;
    const first = ui.filters(original, filterFields()).then((value) => { applied = true; return value; });
    await tick(); input.write("\x1b[A"); input.write("0\r"); await tick();
    assert.equal(applied, false);
    assert.match(screen(), /limit from 1 to 100/);
    input.write("\x7f101\r"); await tick(); assert.equal(applied, false);
    input.write("\x7f\r"); assert.equal((await first).limit, 10);
    const second = ui.filters(original, filterFields());
    await tick(); input.write("\x12\r"); assert.deepEqual(await second, { limit: 10 });
    const third = assert.rejects(ui.filters(original, filterFields()), Back);
    await tick(); input.write("\x1b[C");
    input.emit("keypress", "\x1b", { name: "escape" }); await third;
    assert.deepEqual(original, { limit: 100, type: "decision" });
  } finally { ui.close(); }
});

test("Tab opens filters while searches are pending, and a failed refresh cannot open old matches", async () => {
  const { input, ui, tick, screen } = interactive();
  const requests = [];
  const source = (query, { signal }) => new Promise((resolve, reject) => requests.push({ query, signal, resolve, reject }));
  try {
    const waiting = ui.search("Search journal", source, { query: "waiting" });
    await tick(); input.write("\t"); assert.deepEqual(await waiting, { query: "waiting", value: "filters" });
    assert.equal(requests.length, 0);
    const loading = ui.search("Search journal", source, { query: "loading" });
    await until(() => requests.length === 1);
    input.write("\t"); await loading; assert.equal(requests[0].signal.aborted, true);
    let completed = false;
    const pending = ui.search("Search journal", source, { query: "good" }).then((value) => { completed = true; return value; });
    await until(() => requests.length === 2);
    requests[1].resolve({ choices: [[1, "Original match"]], message: "One result" });
    await until(() => screen().includes("Original match"));
    const offset = screen().length;
    input.write("x"); await tick();
    assert.match(screen().slice(offset), /Original match/); // Retained while updating.
    await until(() => requests.length === 3);
    requests[2].reject(new Error("Refresh failed"));
    await until(() => screen().includes("Refresh failed"));
    input.write("\r"); await tick(); assert.equal(completed, false);
    input.write("\t"); assert.deepEqual(await pending, { query: "goodx", value: "filters" });
  } finally { ui.close(); }
});

test("search keeps a bounded, steady viewport with long metadata in narrow terminals", async () => {
  for (const [columns, rows] of [[40, 20], [80, 24]]) {
    const { input, output, ui, tick } = interactive({ columns, rows, env: { NO_COLOR: "1" } });
    const chunks = [];
    output.on("data", (chunk) => chunks.push(stripVTControlCharacters(String(chunk))));
    ui.header({ project: "/tmp/a-long-project-path/with-many-segments" });
    try {
      const pending = ui.search("Search journal", async () => ({
        choices: Array.from({ length: 20 }, (_,index) => [index, `Result ${index}`, "Very long metadata ".repeat(40)]),
        message: "20 results\nWarning: a long diagnostic that needs truncating ".repeat(4),
      }), { query: "query", scope: "Work: a-long-work-item | Type: decision | Limit: 10" });
      await until(() => chunks.some((chunk) => chunk.includes("1/20")));
      input.write("x"); await tick();
      const header = chunks.find((chunk) => chunk.includes("▤ djournal"));
      const frames = chunks.filter((chunk) => chunk.startsWith("  Search journal\n"));
      assert.ok(frames.length >= 3);
      const height = frames[0].split("\n").length;
      for (const frame of frames) {
        assert.equal(frame.split("\n").length, height);
        assert.ok(header.split("\n").length - 1 + height <= rows);
        assert.ok(frame.split("\n").every((line) => line.length <= columns));
        assert.doesNotMatch(frame, /Change filters|Back to Recall/);
      }
      assert.match(header, /Tab filters/);
      input.write("\t"); await pending;
    } finally { ui.close(); }
  }
});
