"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

test("recall reinforcement is workflow-owned and recall remains read-only", () => {
  const recall = read(".agents/skills/recall/SKILL.md");
  const workflow = read(".agents/skills/journal-workflow/SKILL.md");
  const journal = read(".agents/skills/journal/SKILL.md");
  const reinforce = read(".agents/skills/reinforce/SKILL.md");

  assert.match(recall, /Recall remains read-only/);
  assert.match(recall, /Reinforcement signal/);
  assert.match(recall, /The surrounding workflow, not recall/);

  assert.match(workflow, /Recall reinforcement/);
  assert.match(workflow, /Immaterial recall: answer from sources and finish `not-needed`/);
  assert.match(workflow, /route durable evidence to `research-codebase`, `research-web`,\n   `decision`, `document`, or `reinforce`/);

  assert.match(journal, /Include recalled journal entries when recall materially affected/);
  assert.match(journal, /recalled spine or supporting entries that materially affected/);

  assert.match(reinforce, /name: reinforce/);
  assert.match(reinforce, /Link recalled journal evidence/);
  assert.match(reinforce, /without turning recall into a writer/);
  assert.match(reinforce, /Closed body edits: avoid them/);
});
