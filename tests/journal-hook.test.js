"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { handle } = require("../.agents/adapters/shared/journal-hook.js");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "journal-hook-"));
  const work = "2026-07-01-01-test-work";
  const entry = `.journal/work/${work}/journal/2026-07-01-01-test.md`;
  fs.mkdirSync(path.join(root, ".agents/rules"), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, entry)), { recursive: true });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Test\n");
  fs.writeFileSync(path.join(root, ".agents/rules/AUTOMATION.md"), "# Test\n");
  fs.writeFileSync(path.join(root, ".journal/state.json"), JSON.stringify({ active_work_name: work }));
  fs.writeFileSync(path.join(root, `.journal/work/${work}/work.md`), "---\nid: wi_test\n---\n");
  fs.writeFileSync(path.join(root, entry), "---\nid: ent_test\nentryType: implementation\n---\n");
  return { root, work, entry };
}

function writeWork(root, slug, body = "---\nid: wi_test\n---\n") {
  const entry = `.journal/work/${slug}/journal/2026-07-01-01-test.md`;
  fs.mkdirSync(path.dirname(path.join(root, entry)), { recursive: true });
  fs.writeFileSync(path.join(root, `.journal/work/${slug}/work.md`), body);
  fs.writeFileSync(path.join(root, entry), "---\nid: ent_test\nentryType: implementation\n---\n");
  return entry;
}

function run(payload) {
  return handle(payload);
}

test("session start reports active work from a nested cwd", () => {
  const { root, work } = fixture();
  const nested = path.join(root, "src/deep");
  fs.mkdirSync(nested, { recursive: true });
  const output = run({ cwd: nested, hook_event_name: "SessionStart" });
  assert.match(output.hookSpecificOutput.additionalContext, new RegExp(work));
});

test("prompt submit preserves explicit opt-out", () => {
  const { root } = fixture();
  const output = run({ cwd: root, hook_event_name: "UserPromptSubmit", prompt: "journal: off fix this" });
  assert.match(output.hookSpecificOutput.additionalContext, /opt-out/);
});

test("stop requests one pass when the marker is absent", () => {
  const { root } = fixture();
  const output = run({ cwd: root, hook_event_name: "Stop", last_assistant_message: "Done", stop_hook_active: false });
  assert.equal(output.decision, "block");
});

test("active stop guard always permits stopping", () => {
  const { root } = fixture();
  const output = run({ cwd: root, hook_event_name: "Stop", last_assistant_message: "Done", stop_hook_active: true });
  assert.deepEqual(output, {});
});

test("not-needed and off markers permit stopping", () => {
  const { root } = fixture();
  for (const status of ["not-needed", "off"]) {
    const output = run({ cwd: root, hook_event_name: "Stop", last_assistant_message: `Done\n<!-- journal-status: ${status} -->` });
    assert.deepEqual(output, {});
  }
});

test("closed marker requires an existing spine entry", () => {
  const { root, entry } = fixture();
  const valid = run({ cwd: root, hook_event_name: "Stop", last_assistant_message: `Done\n<!-- journal-status: closed ${entry} -->` });
  assert.deepEqual(valid, {});
  const invalid = run({ cwd: root, hook_event_name: "Stop", last_assistant_message: "Done\n<!-- journal-status: closed .journal/work/missing.md -->" });
  assert.equal(invalid.decision, "block");
});

test("closed marker validates global store without repo-local projection", () => {
  const { root, entry, work } = fixture();
  const store = fs.mkdtempSync(path.join(os.tmpdir(), "journal-hook-store-"));
  const globalEntry = path.join(store, entry);
  fs.rmSync(path.join(root, ".journal"), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(globalEntry), { recursive: true });
  fs.writeFileSync(path.join(store, ".journal/state.json"), JSON.stringify({ active_work_name: work }));
  fs.writeFileSync(path.join(store, ".journal/work", work, "work.md"), "---\nid: wi_test\n---\n");
  fs.writeFileSync(globalEntry, "---\nid: ent_test\nentryType: implementation\n---\n");
  fs.writeFileSync(path.join(root, ".djournal.json"), JSON.stringify({
    schemaVersion: 1,
    projectKey: "test",
    journalStore: store,
  }));

  const output = run({ cwd: root, hook_event_name: "Stop", last_assistant_message: `Done\n<!-- journal-status: closed ${entry} -->` });
  assert.deepEqual(output, {});
});

test("closed team-shared work does not auto-sync without standalone config", () => {
  const { root, entry, work } = fixture();
  fs.writeFileSync(path.join(root, `.journal/work/${work}/work.md`), "---\nid: wi_test\nvisibility: team_shared\n---\n");
  let called = false;
  const output = handle(
    { cwd: root, hook_event_name: "Stop", last_assistant_message: `Done\n<!-- journal-status: closed ${entry} -->` },
    { syncRunner: () => { called = true; return { status: 0, stdout: "" }; } },
  );
  assert.deepEqual(output, {});
  assert.equal(called, false);
});

test("closed team-shared work auto-syncs when standalone config enables auto", () => {
  const { root, entry, work } = fixture();
  fs.writeFileSync(path.join(root, `.journal/work/${work}/work.md`), "---\nid: wi_test\nvisibility: team_shared\n---\n");
  fs.writeFileSync(path.join(root, ".journal/config.json"), JSON.stringify({ sync: { enabled: true, mode: "standalone", auto: true } }));
  let called = false;
  const output = handle(
    { cwd: root, hook_event_name: "Stop", last_assistant_message: `Done\n<!-- journal-status: closed ${entry} -->` },
    { syncRunner: () => { called = true; return { status: 0, stdout: "ok" }; } },
  );
  assert.equal(called, true);
  assert.match(output.hookSpecificOutput.additionalContext, /synchronized/);
});

test("closed marker work owns auto-sync when active work differs", () => {
  const { root, work: active } = fixture();
  const closed = "2026-07-02-01-closed-work";
  const closedEntry = writeWork(root, closed, "---\nid: wi_closed\nvisibility: team_shared\n---\n");
  fs.writeFileSync(path.join(root, ".journal/config.json"), JSON.stringify({ sync: { enabled: true, mode: "standalone", auto: true } }));
  let args = [];
  const output = handle(
    { cwd: root, hook_event_name: "Stop", last_assistant_message: `Done\n<!-- journal-status: closed ${closedEntry} -->` },
    { syncRunner: (_command, nextArgs) => { args = nextArgs; return { status: 0, stdout: "ok" }; } },
  );

  assert.equal(active, "2026-07-01-01-test-work");
  assert.deepEqual(args, ["sync", "--auto", "--work", closed]);
  assert.match(output.hookSpecificOutput.additionalContext, /synchronized/);
});

test("unshared closed work does not auto-sync even when active work is shared", () => {
  const { root, work: active } = fixture();
  const closed = "2026-07-02-01-unshared-work";
  const closedEntry = writeWork(root, closed);
  fs.writeFileSync(path.join(root, ".journal/config.json"), JSON.stringify({
    sync: { enabled: true, mode: "standalone", auto: true },
    sharing: { sharedWorkItems: { [active]: { sharedAt: "2026-07-01T00:00:00.000Z", sharedBy: "test@local" } } },
  }));
  let called = false;
  const output = handle(
    { cwd: root, hook_event_name: "Stop", last_assistant_message: `Done\n<!-- journal-status: closed ${closedEntry} -->` },
    { syncRunner: () => { called = true; return { status: 0, stdout: "ok" }; } },
  );

  assert.deepEqual(output, {});
  assert.equal(called, false);
});

test("global closed marker work owns auto-sync when active work differs", () => {
  const { root } = fixture();
  const store = fs.mkdtempSync(path.join(os.tmpdir(), "journal-hook-store-"));
  const active = "2026-07-01-01-active-work";
  const closed = "2026-07-02-01-closed-work";
  const closedEntry = `.journal/work/${closed}/journal/2026-07-01-01-test.md`;
  fs.rmSync(path.join(root, ".journal"), { recursive: true, force: true });
  fs.mkdirSync(path.join(store, ".journal/work", active), { recursive: true });
  fs.writeFileSync(path.join(store, ".journal/state.json"), JSON.stringify({ active_work_name: active }));
  fs.writeFileSync(path.join(store, ".journal/work", active, "work.md"), "---\nid: wi_active\n---\n");
  fs.mkdirSync(path.dirname(path.join(store, closedEntry)), { recursive: true });
  fs.writeFileSync(path.join(store, ".journal/work", closed, "work.md"), "---\nid: wi_closed\n---\n");
  fs.writeFileSync(path.join(store, closedEntry), "---\nid: ent_test\nentryType: implementation\n---\n");
  fs.writeFileSync(path.join(store, "config.json"), JSON.stringify({
    sync: { enabled: true, mode: "standalone", auto: true },
    sharing: { sharedWorkItems: { [closed]: { sharedAt: "2026-07-01T00:00:00.000Z", sharedBy: "test@local" } } },
  }));
  fs.writeFileSync(path.join(root, ".djournal.json"), JSON.stringify({
    schemaVersion: 1,
    projectKey: "test",
    journalStore: store,
  }));
  let args = [];
  const output = handle(
    { cwd: root, hook_event_name: "Stop", last_assistant_message: `Done\n<!-- journal-status: closed ${closedEntry} -->` },
    { syncRunner: (_command, nextArgs) => { args = nextArgs; return { status: 0, stdout: "ok" }; } },
  );

  assert.deepEqual(args, ["sync", "--auto", "--work", closed]);
  assert.match(output.hookSpecificOutput.additionalContext, /synchronized/);
});

test("status marker must be the final response content", () => {
  const { root } = fixture();
  const output = run({ cwd: root, hook_event_name: "Stop", last_assistant_message: "<!-- journal-status: not-needed -->\nMore text" });
  assert.equal(output.decision, "block");
});

test("absent journal installation fails open", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "journal-hook-empty-"));
  const output = run({ cwd: root, hook_event_name: "Stop", last_assistant_message: "Done" });
  assert.deepEqual(output, {});
});
