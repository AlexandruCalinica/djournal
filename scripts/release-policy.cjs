"use strict";

const ALLOWED_TYPES = new Set([
  "build",
  "ci",
  "chore",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
]);

const TITLE_PATTERN = /^([a-z]+)(?:\(([a-z0-9][a-z0-9._/-]*)\))?(!)?: ([^\s].*)$/;
const BREAKING_PATTERN = /(?:^|\n)BREAKING(?: |-)?CHANGE:\s*\S/im;
const RELEASE_RANK = { patch: 1, minor: 2, major: 3 };

class ReleasePolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleasePolicyError";
  }
}

function parseTitle(value) {
  const title = typeof value === "string" ? value.trim() : "";
  const match = TITLE_PATTERN.exec(title);
  if (!match) {
    throw new ReleasePolicyError("expected '<type>(<scope>): <subject>' with an optional ! before the colon");
  }
  const [, type, scope, marker, subject] = match;
  if (!ALLOWED_TYPES.has(type)) {
    throw new ReleasePolicyError(`unsupported type '${type}'; use one of: ${[...ALLOWED_TYPES].join(", ")}`);
  }
  return { type, scope, breaking: marker === "!", subject, title };
}

function majorOf(version) {
  const match = /^(\d+)\./.exec(version || "");
  if (!match) throw new ReleasePolicyError(`invalid current version '${version}'`);
  return Number(match[1]);
}

function commitText(commit) {
  return [commit.message, commit.subject, commit.body, commit.footer].filter(Boolean).join("\n");
}

function releaseTypeForCommit(commit, currentVersion) {
  const text = commitText(commit);
  const title = commit.subject || commit.message?.split("\n", 1)[0] || "";
  const parsed = parseTitle(title);
  const breaking = parsed.breaking || BREAKING_PATTERN.test(text);
  if (breaking) return majorOf(currentVersion) === 0 ? "minor" : "major";
  return parsed.type === "feat" ? "minor" : "patch";
}

function analyze(commits, currentVersion) {
  let selected = null;
  for (const commit of commits) {
    let release;
    try {
      release = releaseTypeForCommit(commit, currentVersion);
    } catch (error) {
      const reference = commit.shortHash || commit.hash?.slice(0, 7) || "unknown";
      throw new ReleasePolicyError(`commit ${reference}: ${error.message}`);
    }
    if (!selected || RELEASE_RANK[release] > RELEASE_RANK[selected]) selected = release;
  }
  return selected;
}

module.exports = {
  ALLOWED_TYPES,
  ReleasePolicyError,
  analyze,
  parseTitle,
  releaseTypeForCommit,
};
