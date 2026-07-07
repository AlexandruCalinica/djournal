"use strict";

const packageJson = require("../package.json");
const { analyze } = require("./release-policy.cjs");

async function analyzeCommits(_pluginConfig, context) {
  const currentVersion = context.lastRelease?.version || packageJson.version;
  const release = analyze(context.commits || [], currentVersion);
  context.logger?.log(
    release
      ? `Selected a ${release} release from ${context.commits.length} commit(s) after ${currentVersion}`
      : "No commits require a release",
  );
  return release;
}

module.exports = { analyzeCommits };
