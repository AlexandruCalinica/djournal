"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const sourceRoot = path.resolve(__dirname, "../..");
const { parseArgs } = require("../../bin/journal.js");
const {
  InstallerError,
  MANIFEST_PATH,
  detectHarnesses,
  install,
  loadManifest,
  selectHarnesses,
  sourceInventory,
  status,
  uninstall,
  upgrade,
} = require("../../lib/installer/index.js");
const {
  BEGIN,
  END,
  mergeHookConfig,
  removeHookConfig,
  removeManagedBlock,
  upsertManagedBlock,
} = require("../../lib/installer/merge.js");

function target() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "journal-installer-"));
}

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function json(root, relative) {
  return JSON.parse(read(root, relative));
}

function count(text, value) {
  return text.split(value).length - 1;
}

test("managed Markdown blocks update and remove without replacing surrounding text", () => {
  const original = "# Existing\n\nKeep this.\n";
  const installed = upsertManagedBlock(original, "Journal v1");
  assert.match(installed, /Keep this/);
  assert.equal(count(installed, BEGIN), 1);
  const updated = upsertManagedBlock(installed, "Journal v2");
  assert.doesNotMatch(updated, /Journal v1/);
  assert.match(updated, /Journal v2/);
  assert.equal(removeManagedBlock(updated).text, original);
});

test("hook fragments merge idempotently and remove only injected groups", () => {
  const existing = { permissions: { defaultMode: "ask" }, hooks: { Stop: [{ hooks: [{ type: "command", command: "user-check" }] }] } };
  const fragment = { hooks: { Stop: [{ hooks: [{ type: "command", command: "journal-check" }] }], SessionStart: [{ hooks: [{ type: "command", command: "journal-start" }] }] } };
  const first = mergeHookConfig(existing, fragment);
  const second = mergeHookConfig(first.value, fragment);
  assert.equal(first.value.hooks.Stop.length, 2);
  assert.deepEqual(second.injected, {});
  const removed = removeHookConfig(first.value, first.injected);
  assert.deepEqual(removed.conflicts, []);
  assert.deepEqual(removed.value, existing);
});

test("pre-existing equivalent hook groups are not claimed or rewritten", async () => {
  const root = target();
  fs.mkdirSync(path.join(root, ".codex"));
  const sourceFragment = JSON.parse(fs.readFileSync(path.join(sourceRoot, ".codex/hooks.json"), "utf8"));
  const original = `${JSON.stringify({ custom: true, ...sourceFragment })}\n`;
  fs.writeFileSync(path.join(root, ".codex/hooks.json"), original);
  await install({ sourceRoot, target: root, harnesses: ["codex"], interactive: false });
  assert.equal(read(root, ".codex/hooks.json"), original);
  const record = loadManifest(root).files.find((item) => item.path === ".codex/hooks.json");
  assert.deepEqual(record.injected, {});
  uninstall({ target: root });
  assert.deepEqual(json(root, ".codex/hooks.json"), JSON.parse(original));
});

test("CLI parsing accepts multi-harness and lifecycle flags", () => {
  const options = parseArgs(["install", "--target", "/tmp/example", "--harness", "codex,claude", "--dry-run", "--yes"]);
  assert.deepEqual(options.harnesses, ["codex", "claude"]);
  assert.equal(options.dryRun, true);
  assert.equal(options.interactive, false);
  assert.throws(() => parseArgs(["install", "--all", "--harness", "codex"]), /either --all or --harness/);
});

test("detection distinguishes supported and future harness evidence", () => {
  const root = target();
  fs.mkdirSync(path.join(root, ".claude"));
  fs.mkdirSync(path.join(root, ".pi"));
  const detected = detectHarnesses(root, { commandExists: (name) => name === "codex" });
  assert.deepEqual(detected.supported, ["codex", "claude-code"]);
  assert.deepEqual(detected.future, ["pi"]);
});

test("non-interactive ambiguous detection requires explicit selection", async () => {
  await assert.rejects(
    selectHarnesses({ interactive: false }, { supported: ["codex", "claude-code"] }),
    (error) => error instanceof InstallerError && error.code === "HARNESS_SELECTION_REQUIRED",
  );
});

test("both-harness install is idempotent and partial/full uninstall preserves user content", async () => {
  const root = target();
  const agentsOriginal = "# Existing agents\n\nKeep this.\n";
  const claudeOriginal = "# Existing Claude\n\nKeep this too.\n";
  fs.writeFileSync(path.join(root, "AGENTS.md"), agentsOriginal);
  fs.writeFileSync(path.join(root, "CLAUDE.md"), claudeOriginal);
  fs.mkdirSync(path.join(root, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex/hooks.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "user-codex" }] }] }, custom: true }));
  fs.writeFileSync(path.join(root, ".claude/settings.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "user-claude" }] }] }, permissions: { defaultMode: "ask" } }));

  const options = { sourceRoot, target: root, harnesses: ["codex", "claude-code"], interactive: false };
  const first = await install(options);
  assert.equal(first.action, "install");
  assert.deepEqual(first.harnesses, ["claude-code", "codex"]);
  assert.equal(count(read(root, "AGENTS.md"), BEGIN), 1);
  assert.equal(count(read(root, "CLAUDE.md"), BEGIN), 1);
  assert.equal(json(root, ".codex/hooks.json").custom, true);
  assert.deepEqual(json(root, ".claude/settings.json").permissions, { defaultMode: "ask" });
  assert.equal(fs.existsSync(path.join(root, ".journal/state.json")), false);

  const second = await install(options);
  assert.equal(second.action, "upgrade");
  assert.equal(count(read(root, "AGENTS.md"), BEGIN), 1);
  assert.equal(json(root, ".codex/hooks.json").hooks.Stop.length, 2);
  assert.equal(status({ target: root }).clean, true);

  const partial = uninstall({ target: root, harnesses: ["codex"] });
  assert.equal(partial.action, "partial-uninstall");
  assert.deepEqual(partial.harnesses, ["claude-code"]);
  assert.equal(json(root, ".codex/hooks.json").hooks.Stop.length, 1);
  assert.equal(fs.existsSync(path.join(root, ".agents/rules/AUTOMATION.md")), true);
  assert.equal(count(read(root, "CLAUDE.md"), BEGIN), 1);

  fs.mkdirSync(path.join(root, ".journal/work/example"), { recursive: true });
  fs.writeFileSync(path.join(root, ".journal/work/example/work.md"), "history\n");
  fs.writeFileSync(path.join(root, ".journal/state.json"), JSON.stringify({ active_work_name: "example" }));
  const removed = uninstall({ target: root });
  assert.equal(removed.action, "uninstall");
  assert.equal(removed.conflicts.length, 0);
  assert.equal(read(root, "AGENTS.md"), agentsOriginal);
  assert.equal(read(root, "CLAUDE.md"), claudeOriginal);
  assert.equal(json(root, ".claude/settings.json").hooks.Stop.length, 1);
  assert.deepEqual(json(root, ".claude/settings.json").permissions, { defaultMode: "ask" });
  assert.equal(fs.existsSync(path.join(root, ".agents/rules/AUTOMATION.md")), false);
  assert.equal(read(root, ".journal/work/example/work.md"), "history\n");
  assert.deepEqual(json(root, ".journal/state.json"), { active_work_name: "example" });
  assert.equal(fs.existsSync(path.join(root, MANIFEST_PATH)), false);
});

test("instructions-only dry-run makes no changes", async () => {
  const root = target();
  const result = await install({ sourceRoot, target: root, instructionsOnly: true, interactive: false, dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(fs.readdirSync(root).length, 0);
});

test("malformed shared JSON fails before installation writes", async () => {
  const root = target();
  fs.mkdirSync(path.join(root, ".codex"));
  fs.writeFileSync(path.join(root, ".codex/hooks.json"), "{");
  await assert.rejects(
    install({ sourceRoot, target: root, harnesses: ["codex"], interactive: false }),
    (error) => error instanceof InstallerError && error.code === "DOCTOR_FAILED",
  );
  assert.equal(fs.existsSync(path.join(root, MANIFEST_PATH)), false);
  assert.equal(fs.existsSync(path.join(root, "spec.md")), false);
});

test("symlink destinations are rejected before writes", async () => {
  const root = target();
  const outside = target();
  fs.symlinkSync(outside, path.join(root, ".agents"), "dir");
  await assert.rejects(
    install({ sourceRoot, target: root, instructionsOnly: true, interactive: false }),
    (error) => error instanceof InstallerError && error.code === "UNSAFE_PATH",
  );
  assert.equal(fs.readdirSync(outside).length, 0);
  assert.equal(fs.existsSync(path.join(root, MANIFEST_PATH)), false);
});

test("modified copied assets block upgrade and survive uninstall with ownership retained", async () => {
  const root = target();
  await install({ sourceRoot, target: root, instructionsOnly: true, interactive: false });
  fs.appendFileSync(path.join(root, "spec.md"), "\nlocal modification\n");
  await assert.rejects(
    upgrade({ sourceRoot, target: root, interactive: false }),
    (error) => error instanceof InstallerError && error.code === "ASSET_CONFLICT",
  );
  const result = uninstall({ target: root });
  assert.equal(result.action, "uninstall-with-conflicts");
  assert.deepEqual(result.conflicts, ["spec.md"]);
  assert.match(read(root, "spec.md"), /local modification/);
  const manifest = loadManifest(root);
  assert.deepEqual(manifest.files.map((record) => record.path), ["spec.md"]);
});

test("injected transaction failure rolls every file back", async () => {
  const root = target();
  await assert.rejects(
    install({ sourceRoot, target: root, instructionsOnly: true, interactive: false, failAfter: 3 }),
    /injected transaction failure/,
  );
  for (const relative of sourceInventory(sourceRoot)) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  }
  assert.equal(fs.existsSync(path.join(root, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(root, MANIFEST_PATH)), false);
  assert.equal(fs.existsSync(path.join(root, ".journal/.install/transaction.json")), false);
});
