"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const YAML = require("yaml");

const root = path.resolve(__dirname, "..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

test("recall reinforcement is workflow-owned and recall remains read-only", () => {
  const recall = read(".agents/skills/journal-recall/SKILL.md");
  const workflow = read(".agents/skills/journal-workflow/SKILL.md");
  const journal = read(".agents/skills/journal-entry/SKILL.md");
  const reinforce = read(".agents/skills/journal-reinforce/SKILL.md");

  assert.match(recall, /Recall remains read-only/);
  assert.match(recall, /Reinforcement signal/);
  assert.match(recall, /The surrounding workflow, not recall/);

  assert.match(workflow, /Recall reinforcement/);
  assert.match(workflow, /Immaterial recall: answer from sources and finish `not-needed`/);
  assert.match(workflow, /route durable evidence to `journal-research-codebase`, `journal-research-web`,\n   `journal-decision`, `journal-document`, or `journal-reinforce`/);

  assert.match(journal, /Include recalled journal entries when recall materially affected/);
  assert.match(journal, /recalled spine or supporting entries that materially affected/);

  assert.match(reinforce, /name: journal-reinforce/);
  assert.match(reinforce, /Link recalled journal evidence/);
  assert.match(reinforce, /without turning recall into a writer/);
  assert.match(reinforce, /Closed body edits: avoid them/);
});

test("journal catalog has matching names and folders with automatic invocation available", () => {
  const directory = path.join(root, ".agents/skills");
  const names = fs.readdirSync(directory).filter((name) => fs.statSync(path.join(directory, name)).isDirectory());
  assert.equal(names.length, 14);
  for (const name of names) {
    assert.match(name, /^journal-[a-z0-9-]+$/);
    const text = read(`.agents/skills/${name}/SKILL.md`);
    const metadata = YAML.parse(text.split("---")[1]);
    assert.equal(metadata.name, name);
    assert.equal(typeof metadata.description, "string");
    assert.ok(metadata.description.trim().length > 0);
    assert.notEqual(metadata["disable-model-invocation"], true);
    const uiFile = path.join(directory, name, "agents/openai.yaml");
    if (fs.existsSync(uiFile)) {
      const ui = YAML.parse(fs.readFileSync(uiFile, "utf8"));
      assert.notEqual(ui.policy?.allow_implicit_invocation, false);
      assert.ok(ui.interface.default_prompt.includes(`$${name}`));
    }
  }
  assert.ok(names.includes("journal-entry"));
  assert.ok(names.includes("journal-workflow"));
});

test("portable routing references resolve to the current journal skill catalog", () => {
  const names = fs.readdirSync(path.join(root, ".agents/skills"));
  const files = ["AGENTS.md", ".agents/rules/AUTOMATION.md", ".agents/rules/STATE.md",
    ...names.map((name) => `.agents/skills/${name}/SKILL.md`)];
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(/`(journal-[a-z0-9-]+)`/g)) {
      assert.ok(names.includes(match[1]), `${file}: unknown skill ${match[1]}`);
    }
    for (const match of text.matchAll(/\.agents\/skills\/([a-z0-9-]+)\/SKILL\.md/g)) {
      assert.ok(fs.existsSync(path.join(root, match[0])), `${file}: broken skill path ${match[0]}`);
    }
  }
});

test("closed marker instructions use the canonical logical journal path", () => {
  const agents = read("AGENTS.md");
  const workflow = read(".agents/skills/journal-workflow/SKILL.md");
  const contract = read(".agents/adapters/contract.md");

  for (const instructions of [agents, workflow]) {
    assert.match(instructions, /journal-status: closed \.journal\/work\/<slug>\/journal\/<entry>\.md/);
  }
  assert.match(agents, /global-store projects, hooks resolve that prefix through/);
  assert.match(workflow, /Always emit the logical repository-relative `\.journal\/\.\.\.` path/);
  assert.match(contract, /checker may accept journal-root-relative `work\/\.\.\.` as a compatibility form/);
});

test("work initialization and switching pull before enumerating canonical work", () => {
  const init = read(".agents/skills/journal-init-work/SKILL.md");
  const switching = read(".agents/skills/journal-switch/SKILL.md");

  for (const instructions of [init, switching]) {
    assert.match(instructions, /Run `djournal pull`/);
    assert.match(instructions, /Stop and\s+report .*pull conflict/i);
  }
});
