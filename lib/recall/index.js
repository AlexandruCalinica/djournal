"use strict";

const { performance } = require("node:perf_hooks");
const { projectContext } = require("../installer/index.js");
const { searchIndex } = require("./search.js");
const { ensureSnapshot } = require("./snapshot.js");
const { normalizeInputs, lookupPaths } = require("./files.js");

function contextFor(options = {}) {
  const target = options.target || process.cwd();
  return options.context || projectContext(target, options);
}

function cacheSummary(ensured, timings = {}) {
  return {
    mode: ensured.mode,
    status: ensured.status,
    documentCount: Object.keys(ensured.snapshot.documents || {}).length,
    builtAt: ensured.snapshot.builtAt,
    ...timings,
  };
}

function buildRecallIndex(options = {}) {
  const started = performance.now();
  const context = contextFor(options);
  const ensured = ensureSnapshot(context, options);
  return {
    action: "recall-index",
    target: context.target,
    projectKey: ensured.snapshot.projectKey,
    cache: cacheSummary(ensured, { totalMs: performance.now() - started }),
    warnings: ensured.warnings,
  };
}

function searchRecall(query, options = {}) {
  const started = performance.now();
  const context = contextFor(options);
  const ensureStarted = performance.now();
  const ensured = ensureSnapshot(context, options);
  const ensureMs = performance.now() - ensureStarted;
  const searchStarted = performance.now();
  const results = searchIndex(ensured.index, query, { ...options, incomingLinks: ensured.snapshot.incomingLinks });
  const searchMs = performance.now() - searchStarted;
  return {
    action: "recall-search",
    target: context.target,
    projectKey: ensured.snapshot.projectKey,
    query,
    cache: cacheSummary(ensured, { ensureMs, searchMs, totalMs: performance.now() - started }),
    ...results,
    warnings: ensured.warnings,
  };
}

function lookupFiles(paths, options = {}) {
  const started = performance.now();
  const context = contextFor(options);
  const inputs = normalizeInputs(paths, { ...options, target: context.target });
  const ensured = ensureSnapshot(context, options);
  const ensureMs = performance.now() - started;
  const results = lookupPaths(ensured.snapshot, inputs, options);
  return {
    action: "recall-files",
    target: context.target,
    projectKey: ensured.snapshot.projectKey,
    repository: options.repository || null,
    cache: cacheSummary(ensured, { ensureMs, totalMs: performance.now() - started }),
    ...results,
    warnings: [...ensured.warnings, ...results.warnings],
  };
}

module.exports = { buildRecallIndex, searchRecall, lookupFiles };
