"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { analyzeCommits } = require("../scripts/analyze-release.cjs");
const { analyze, parseTitle, releaseTypeForCommit } = require("../scripts/release-policy.cjs");

test("accepts supported conventional pull request titles", () => {
  assert.deepEqual(parseTitle("feat(installer): support zed"), {
    type: "feat",
    scope: "installer",
    breaking: false,
    subject: "support zed",
    title: "feat(installer): support zed",
  });
  assert.equal(parseTitle("fix!: remove legacy format").breaking, true);
  assert.equal(parseTitle("docs: explain sync").type, "docs");
});

test("rejects titles that cannot guarantee a release", () => {
  assert.throws(() => parseTitle("Update the README"), /expected/);
  assert.throws(() => parseTitle("feature: add hooks"), /unsupported type/);
  assert.throws(() => parseTitle("feat: "), /expected/);
  assert.throws(() => parseTitle("Feat: uppercase type"), /expected/);
});

test("maps every accepted non-feature type to a patch release", () => {
  for (const type of ["build", "ci", "chore", "docs", "fix", "perf", "refactor", "revert", "style", "test"]) {
    assert.equal(releaseTypeForCommit({ subject: `${type}: change` }, "0.4.2"), "patch");
  }
});

test("uses minor for features and pre-1.0 breaking changes", () => {
  assert.equal(releaseTypeForCommit({ subject: "feat: add adapter" }, "0.4.2"), "minor");
  assert.equal(releaseTypeForCommit({ subject: "fix!: remove option" }, "0.4.2"), "minor");
  assert.equal(
    releaseTypeForCommit({ subject: "fix: change option", body: "BREAKING CHANGE: option removed" }, "0.4.2"),
    "minor",
  );
});

test("uses major for breaking changes at and after 1.0", () => {
  assert.equal(releaseTypeForCommit({ subject: "feat!: replace journal schema" }, "1.2.0"), "major");
});

test("selects the highest release and rejects invalid commits", () => {
  assert.equal(analyze([{ subject: "fix: one" }, { subject: "feat: two" }], "0.1.0"), "minor");
  assert.equal(analyze([], "0.1.0"), null);
  assert.throws(() => analyze([{ hash: "abcdef0123", subject: "unstructured" }], "0.1.0"), /abcdef0/);
});

test("semantic-release analyzer uses the last released version", async () => {
  const messages = [];
  const result = await analyzeCommits({}, {
    commits: [{ subject: "feat!: replace config" }],
    lastRelease: { version: "0.9.0" },
    logger: { log: (message) => messages.push(message) },
  });
  assert.equal(result, "minor");
  assert.match(messages[0], /minor release/);
});
