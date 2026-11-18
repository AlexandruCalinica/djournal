"use strict";

// Temporary directories created by tests are removed when the test process
// exits, including after failed assertions, so repeated runs do not fill the
// system temp directory.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const created = new Set();
let registered = false;

function cleanupTempDirs() {
  for (const dir of created) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best effort: a leftover directory must not fail the test run.
    }
  }
  created.clear();
}

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.add(dir);
  if (!registered) {
    registered = true;
    process.once("exit", cleanupTempDirs);
  }
  return dir;
}

module.exports = { cleanupTempDirs, makeTempDir };
