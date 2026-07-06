#!/usr/bin/env node

"use strict";

const { parseTitle } = require("./release-policy.cjs");

const title = process.env.PR_TITLE || process.argv.slice(2).join(" ");

try {
  const parsed = parseTitle(title);
  process.stdout.write(`valid release title: ${parsed.title}\n`);
} catch (error) {
  process.stderr.write(`invalid pull request title: ${error.message}\n`);
  process.exitCode = 1;
}
