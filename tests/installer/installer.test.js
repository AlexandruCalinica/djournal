"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const sourceRoot = path.resolve(__dirname, "../..");
const djournalHome = fs.mkdtempSync(path.join(os.tmpdir(), "djournal-home-"));
process.env.DJOURNAL_HOME = djournalHome;
const { parseArgs } = require("../../bin/journal.js");
const {
  InstallerError,
  MANIFEST_PATH,
  PROJECT_MARKER_PATH,
  configure,
  detectHarnesses,
  doctor,
  install,
  loadManifest,
  selectHarnesses,
  share,
  sourceInventory,
  sync,
  status,
  uninstall,
  upgrade,
} = require("../../lib/installer/index.js");
const {
  BEGIN,
  END,
  LEGACY_BEGIN,
  LEGACY_END,
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

test("legacy managed Markdown blocks migrate without duplicating surrounding content", () => {
  const original = "# Existing\n\nKeep this.\n";
  const legacy = `${original}\n${LEGACY_BEGIN}\nLegacy instructions\n${LEGACY_END}\n`;
  const migrated = upsertManagedBlock(legacy, "djournal instructions");
  assert.equal(count(migrated, BEGIN), 1);
  assert.equal(count(migrated, LEGACY_BEGIN), 0);
  assert.match(migrated, /Keep this/);
  assert.equal(removeManagedBlock(migrated).text, original);
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

test("CLI parsing accepts share and sync work selection", () => {
  const shareOptions = parseArgs(["share", "--target", "/tmp/example", "--work", "2026-07-01-01-demo", "--dry-run", "--json"]);
  assert.equal(shareOptions.command, "share");
  assert.equal(shareOptions.work, "2026-07-01-01-demo");
  assert.equal(shareOptions.dryRun, true);
  assert.equal(shareOptions.json, true);

  const syncOptions = parseArgs(["sync", "--target=/tmp/example", "--work=2026-07-01-01-demo", "--auto"]);
  assert.equal(syncOptions.command, "sync");
  assert.equal(syncOptions.work, "2026-07-01-01-demo");
  assert.equal(syncOptions.auto, true);

  const allShareOptions = parseArgs(["share", "--target", "/tmp/example", "--all"]);
  assert.equal(allShareOptions.all, true);
  assert.throws(() => parseArgs(["share", "--all", "--work", "2026-07-01-01-demo"]), /either --all or --work/);
  assert.throws(() => parseArgs(["sync", "--all"]), /not supported for sync/);
});

test("share --all marks every canonical work item and preserves existing records", () => {
  const root = target();
  const store = path.join(djournalHome, "projects", "demo-all");
  const slugs = ["2026-07-01-01-first", "2026-07-02-01-second"];
  for (const slug of slugs) {
    fs.mkdirSync(path.join(store, ".journal/work", slug), { recursive: true });
    fs.writeFileSync(path.join(store, ".journal/work", slug, "work.md"), `---\nid: wi_${slug}\n---\n`);
  }
  fs.mkdirSync(path.join(store, ".journal/work/not-a-work-item"), { recursive: true });
  fs.writeFileSync(path.join(root, PROJECT_MARKER_PATH), JSON.stringify({ schemaVersion: 1, projectKey: "demo-all", journalStore: store }));
  const existing = { sharedAt: "2026-07-01T00:00:00.000Z", sharedBy: "original@local" };
  fs.writeFileSync(path.join(store, "config.json"), JSON.stringify({
    sync: { enabled: false, mode: "standalone", path: root },
    sharing: { sharedWorkItems: { [slugs[0]]: existing } },
  }));

  const result = share({ target: root, all: true });

  assert.equal(result.changed, true);
  assert.deepEqual(result.workItems.map((item) => item.work), slugs);
  assert.deepEqual(result.workItems.map((item) => item.changed), [false, true]);
  const shared = json(store, "config.json").sharing.sharedWorkItems;
  assert.deepEqual(shared[slugs[0]], existing);
  assert.equal(typeof shared[slugs[1]].sharedAt, "string");
  assert.equal(shared["not-a-work-item"], undefined);

  const repeated = share({ target: root, all: true });
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.workItems.map((item) => item.changed), [false, false]);

  const dryRunSlug = "2026-07-03-01-dry-run";
  fs.mkdirSync(path.join(store, ".journal/work", dryRunSlug), { recursive: true });
  fs.writeFileSync(path.join(store, ".journal/work", dryRunSlug, "work.md"), `---\nid: wi_${dryRunSlug}\n---\n`);
  const dryRun = share({ target: root, all: true, dryRun: true });
  assert.equal(dryRun.changed, true);
  assert.equal(json(store, "config.json").sharing.sharedWorkItems[dryRunSlug], undefined);
});

test("global store config gates share projection and sync", () => {
  const root = target();
  const store = path.join(djournalHome, "projects", "demo");
  fs.mkdirSync(path.join(store, ".journal/work/2026-07-01-01-demo/journal"), { recursive: true });
  fs.writeFileSync(path.join(root, PROJECT_MARKER_PATH), JSON.stringify({ schemaVersion: 1, projectKey: "demo", journalStore: store }));
  fs.writeFileSync(path.join(store, ".journal/state.json"), JSON.stringify({ active_work_name: "2026-07-01-01-demo" }));
  fs.writeFileSync(path.join(store, ".journal/work/2026-07-01-01-demo/work.md"), [
    "---",
    "id: wi_demo",
    "slug: 2026-07-01-01-demo",
    "title: Demo",
    "status: active",
    "visibility: local_only",
    "createdBy: test@local",
    "createdAt: \"2026-07-01T00:00:00.000Z\"",
    "updatedAt: \"2026-07-01T00:00:00.000Z\"",
    "---",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(store, ".journal/work/2026-07-01-01-demo/journal/2026-07-01-01-demo.md"), "# Demo\n");
  fs.writeFileSync(path.join(store, "config.json"), JSON.stringify({ sync: { enabled: false, mode: "colocated", path: root }, sharing: { sharedWorkItems: {} } }));

  const disabled = sync({ target: root });
  assert.equal(disabled.skipped, true);
  assert.equal(disabled.reason, "sync is not enabled");

  configure({ target: root, key: "sync.enabled", value: "true" });
  const unshared = sync({ target: root });
  assert.equal(unshared.skipped, true);
  assert.equal(unshared.reason, "work is not shared");

  const result = share({ target: root });
  assert.equal(result.changed, true);
  assert.equal(result.shared, true);
  assert.equal(json(store, "config.json").sharing.sharedWorkItems["2026-07-01-01-demo"].sharedBy.endsWith("@local") || json(store, "config.json").sharing.sharedWorkItems["2026-07-01-01-demo"].sharedBy.includes("@"), true);

  const projected = sync({ target: root });
  assert.equal(projected.skipped, undefined);
  assert.equal(fs.existsSync(path.join(root, ".journal/work/2026-07-01-01-demo/work.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".journal/work/2026-07-01-01-demo/journal/2026-07-01-01-demo.md")), true);
});

test("install bootstraps global project store and migrates durable journal content", async () => {
  const root = target();
  fs.mkdirSync(path.join(root, ".journal/work/2026-07-01-01-demo"), { recursive: true });
  fs.mkdirSync(path.join(root, ".journal/.install"), { recursive: true });
  fs.writeFileSync(path.join(root, ".journal/state.json"), JSON.stringify({ active_work_name: "2026-07-01-01-demo" }));
  fs.writeFileSync(path.join(root, ".journal/config.json"), JSON.stringify({ sync: { enabled: true, mode: "colocated" } }));
  fs.writeFileSync(path.join(root, ".journal/.install/local.json"), "{}\n");
  fs.writeFileSync(path.join(root, ".journal/work/2026-07-01-01-demo/work.md"), "---\nid: wi_demo\n---\n");

  await install({ sourceRoot, target: root, instructionsOnly: true, interactive: false });

  const marker = json(root, PROJECT_MARKER_PATH);
  assert.equal(marker.schemaVersion, 1);
  assert.equal(fs.existsSync(path.join(marker.journalStore, "config.json")), true);
  assert.equal(fs.existsSync(path.join(marker.journalStore, ".journal/state.json")), true);
  assert.equal(fs.existsSync(path.join(marker.journalStore, ".journal/work/2026-07-01-01-demo/work.md")), true);
  assert.equal(fs.existsSync(path.join(marker.journalStore, ".journal/config.json")), false);
  assert.equal(fs.existsSync(path.join(marker.journalStore, ".journal/.install/local.json")), false);
  assert.equal(json(marker.journalStore, "config.json").sync.enabled, true);
});

test("detection distinguishes supported and future harness evidence", () => {
  const root = target();
  fs.mkdirSync(path.join(root, ".claude"));
  fs.mkdirSync(path.join(root, ".pi"));
  const detected = detectHarnesses(root, { commandExists: (name) => name === "codex" });
  assert.deepEqual(detected.supported, ["codex", "claude-code", "pi"]);
  assert.deepEqual(detected.future, []);
});

test("non-interactive ambiguous detection requires explicit selection", async () => {
  await assert.rejects(
    selectHarnesses({ interactive: false }, { supported: ["codex", "claude-code"] }),
    (error) => error instanceof InstallerError && error.code === "HARNESS_SELECTION_REQUIRED",
  );
});

test("--all selects every supported harness including Pi", async () => {
  assert.deepEqual(await selectHarnesses({ all: true }, { supported: [] }), ["codex", "claude-code", "pi"]);
});

test("three-harness install is idempotent and partial/full uninstall preserves user content", async () => {
  const root = target();
  const agentsOriginal = "# Existing agents\n\nKeep this.\n";
  const claudeOriginal = "# Existing Claude\n\nKeep this too.\n";
  fs.writeFileSync(path.join(root, "AGENTS.md"), agentsOriginal);
  fs.writeFileSync(path.join(root, "CLAUDE.md"), claudeOriginal);
  fs.mkdirSync(path.join(root, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex/hooks.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "user-codex" }] }] }, custom: true }));
  fs.writeFileSync(path.join(root, ".claude/settings.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "user-claude" }] }] }, permissions: { defaultMode: "ask" } }));

  const options = { sourceRoot, target: root, harnesses: ["codex", "claude-code", "pi"], interactive: false };
  const first = await install(options);
  assert.equal(first.action, "install");
  assert.deepEqual(first.harnesses, ["claude-code", "codex", "pi"]);
  assert.equal(count(read(root, "AGENTS.md"), BEGIN), 1);
  assert.equal(count(read(root, "CLAUDE.md"), BEGIN), 1);
  assert.equal(json(root, ".codex/hooks.json").custom, true);
  assert.equal(json(root, ".claude/settings.json").permissions.defaultMode, "ask");
  assert.equal(read(root, ".pi/extensions/djournal.ts"), read(sourceRoot, ".pi/extensions/djournal.ts"));
  const piRecord = loadManifest(root).files.find((record) => record.path === ".pi/extensions/djournal.ts");
  assert.equal(piRecord.mode, "copy");
  assert.equal(piRecord.harness, "pi");
  assert.equal(fs.existsSync(path.join(root, ".journal/state.json")), false);
  const marker = json(root, PROJECT_MARKER_PATH);
  const claudeSettings = json(root, ".claude/settings.json");
  assert.equal(claudeSettings.permissions.additionalDirectories.includes(marker.journalStore), true);
  assert.equal(claudeSettings.permissions.allow.includes("Bash(journal status:*)"), true);
  assert.equal(
    claudeSettings.hooks.SessionStart[0].hooks[0].statusMessage,
    "Loading journal workflow",
  );
  assert.equal(
    claudeSettings.hooks.Stop
      .flatMap((group) => group.hooks)
      .find((hook) => hook.args?.includes("--harness") && hook.args?.includes("claude-code"))
      ?.statusMessage,
    "Checking journal closure",
  );

  const second = await install(options);
  assert.equal(second.action, "upgrade");
  assert.equal(count(read(root, "AGENTS.md"), BEGIN), 1);
  assert.equal(json(root, ".codex/hooks.json").hooks.Stop.length, 2);
  assert.equal(status({ target: root }).clean, true);
  const piCheck = doctor({ target: root }).checks.find((check) => check.name === ".pi/extensions/djournal.ts");
  assert.equal(piCheck.ok, true);
  assert.match(piCheck.detail, /clean; Pi project trust required/);
  assert.equal(json(root, ".claude/settings.json").permissions.additionalDirectories.filter((item) => item === marker.journalStore).length, 1);

  const piPartial = uninstall({ target: root, harnesses: ["pi"] });
  assert.equal(piPartial.action, "partial-uninstall");
  assert.deepEqual(piPartial.harnesses, ["claude-code", "codex"]);
  assert.equal(fs.existsSync(path.join(root, ".pi/extensions/djournal.ts")), false);
  assert.equal(fs.existsSync(path.join(root, ".agents/adapters/pi/journal-hook.js")), true);

  const partial = uninstall({ target: root, harnesses: ["codex"] });
  assert.equal(partial.action, "partial-uninstall");
  assert.deepEqual(partial.harnesses, ["claude-code"]);
  assert.equal(json(root, ".codex/hooks.json").hooks.Stop.length, 1);
  assert.equal(fs.existsSync(path.join(root, ".agents/rules/AUTOMATION.md")), true);
  assert.equal(count(read(root, "CLAUDE.md"), BEGIN), 1);
  assert.equal(json(root, ".claude/settings.json").permissions.additionalDirectories.includes(marker.journalStore), true);

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

test("upgrade and uninstall preserve user edits outside managed instruction blocks", async () => {
  const root = target();
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Existing agents\n\nOriginal agent guidance.\n");
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Existing Claude\n\nOriginal Claude guidance.\n");

  const options = { sourceRoot, target: root, harnesses: ["codex", "claude-code"], interactive: false };
  await install(options);

  const editedAgents = `# Added after install\n\n${read(root, "AGENTS.md")}\nAgent footer added after install.\n`;
  const editedClaude = `# Added after install\n\n${read(root, "CLAUDE.md")}\nClaude footer added after install.\n`;
  fs.writeFileSync(path.join(root, "AGENTS.md"), editedAgents);
  fs.writeFileSync(path.join(root, "CLAUDE.md"), editedClaude);
  const expectedAgents = removeManagedBlock(editedAgents).text;
  const expectedClaude = removeManagedBlock(editedClaude).text;

  await upgrade({ sourceRoot, target: root, interactive: false });
  assert.match(read(root, "AGENTS.md"), /Added after install/);
  assert.match(read(root, "AGENTS.md"), /Agent footer added after install/);
  assert.match(read(root, "CLAUDE.md"), /Added after install/);
  assert.match(read(root, "CLAUDE.md"), /Claude footer added after install/);
  assert.equal(count(read(root, "AGENTS.md"), BEGIN), 1);
  assert.equal(count(read(root, "CLAUDE.md"), BEGIN), 1);

  uninstall({ target: root });
  assert.equal(read(root, "AGENTS.md"), expectedAgents);
  assert.equal(read(root, "CLAUDE.md"), expectedClaude);
});

test("upgrade refuses a corrupted managed instruction block without rewriting the file", async () => {
  const root = target();
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Existing\n\nKeep this content.\n");
  await install({ sourceRoot, target: root, instructionsOnly: true, interactive: false });
  const corrupted = read(root, "AGENTS.md").replace(END, "<!-- boundary removed -->");
  fs.writeFileSync(path.join(root, "AGENTS.md"), corrupted);

  await assert.rejects(
    upgrade({ sourceRoot, target: root, interactive: false }),
    (error) => error instanceof InstallerError && error.code === "ASSET_CONFLICT",
  );
  assert.equal(read(root, "AGENTS.md"), corrupted);
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
  assert.equal(fs.existsSync(path.join(root, ".agents/rules/AUTOMATION.md")), false);
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
  fs.appendFileSync(path.join(root, ".agents/rules/AUTOMATION.md"), "\nlocal modification\n");
  await assert.rejects(
    upgrade({ sourceRoot, target: root, interactive: false }),
    (error) => error instanceof InstallerError && error.code === "ASSET_CONFLICT",
  );
  const result = uninstall({ target: root });
  assert.equal(result.action, "uninstall-with-conflicts");
  assert.deepEqual(result.conflicts, [".agents/rules/AUTOMATION.md"]);
  assert.match(read(root, ".agents/rules/AUTOMATION.md"), /local modification/);
  const manifest = loadManifest(root);
  assert.deepEqual(manifest.files.map((record) => record.path), [".agents/rules/AUTOMATION.md"]);
});

test("Pi extension conflicts preserve user content and manifest ownership", async () => {
  const occupied = target();
  fs.mkdirSync(path.join(occupied, ".pi/extensions"), { recursive: true });
  fs.writeFileSync(path.join(occupied, ".pi/extensions/djournal.ts"), "export default function userExtension() {}\n");
  await assert.rejects(
    install({ sourceRoot, target: occupied, harnesses: ["pi"], interactive: false }),
    (error) => error instanceof InstallerError && error.code === "ASSET_CONFLICT",
  );
  assert.match(read(occupied, ".pi/extensions/djournal.ts"), /userExtension/);
  assert.equal(fs.existsSync(path.join(occupied, MANIFEST_PATH)), false);

  const root = target();
  await install({ sourceRoot, target: root, harnesses: ["pi"], interactive: false });
  fs.appendFileSync(path.join(root, ".pi/extensions/djournal.ts"), "\n// local modification\n");
  assert.equal(status({ target: root }).clean, false);
  assert.match(doctor({ target: root }).checks.find((check) => check.name === ".pi/extensions/djournal.ts").detail, /modified/);
  await assert.rejects(
    upgrade({ sourceRoot, target: root, interactive: false }),
    (error) => error instanceof InstallerError && error.code === "ASSET_CONFLICT",
  );
  const result = uninstall({ target: root, harnesses: ["pi"] });
  assert.deepEqual(result.conflicts, [".pi/extensions/djournal.ts"]);
  assert.deepEqual(result.harnesses, ["pi"]);
  assert.match(read(root, ".pi/extensions/djournal.ts"), /local modification/);
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
