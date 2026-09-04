"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildCorpus,
  discoverSourceFiles,
  documentFromDescriptor,
  readWorkContexts,
  sameFingerprint,
  sha256,
} = require("./corpus.js");
const {
  INDEX_VERSION,
  createSearchIndex,
  loadSearchIndex,
  serializeSearchIndex,
} = require("./search.js");

const SNAPSHOT_SCHEMA_VERSION = 1;
const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;
const LOCK_STALE_MS = 30_000;

class RecallSnapshotError extends Error {
  constructor(message, code = "RECALL_SNAPSHOT_ERROR") {
    super(message);
    this.name = "RecallSnapshotError";
    this.code = code;
  }
}

function projectIdentity(context) {
  return context.projectKey || `local-${sha256(path.resolve(context.root || context.target)).slice(0, 16)}`;
}

function cachePaths(context, options = {}) {
  const directory = path.resolve(options.cacheDir || path.join(context.root || context.target, "cache", "recall"));
  return { directory, snapshot: path.join(directory, "snapshot.json"), lock: path.join(directory, "refresh.lock") };
}

function warning(code, detail, file) {
  return { code, ...(file ? { path: file } : {}), ...(detail ? { detail } : {}) };
}

function validManifest(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => (
    item && typeof item === "object" && Number.isFinite(item.size) && Number.isFinite(item.mtimeMs) &&
    typeof item.sha256 === "string" && typeof item.documentId === "string"
  ));
}

function validateSnapshot(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || value.indexVersion !== INDEX_VERSION) return false;
  if (value.projectKey !== projectIdentity(context) || typeof value.builtAt !== "string") return false;
  if (!validManifest(value.files) || !value.documents || typeof value.documents !== "object" || !value.index) return false;
  return true;
}

function loadSnapshot(context, options = {}) {
  const file = cachePaths(context, options).snapshot;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_SNAPSHOT_BYTES) {
      return { snapshot: null, warnings: [warning("RECALL_CACHE_INVALID", "snapshot is not a bounded regular file")] };
    }
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!validateSnapshot(value, context)) {
      return { snapshot: null, warnings: [warning("RECALL_CACHE_INCOMPATIBLE", "snapshot schema, index version, or project identity differs")] };
    }
    return { snapshot: value, warnings: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { snapshot: null, warnings: [] };
    return { snapshot: null, warnings: [warning("RECALL_CACHE_INVALID", error.message)] };
  }
}

function acquireLock(paths, options = {}) {
  fs.mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(paths.directory, 0o700); } catch {}
  try {
    const descriptor = fs.openSync(paths.lock, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`);
    fs.closeSync(descriptor);
    return () => { try { fs.unlinkSync(paths.lock); } catch {} };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    try {
      const stat = fs.statSync(paths.lock);
      const now = Number(options.now ?? Date.now());
      if (Number.isFinite(now) && now - stat.mtimeMs > (options.lockStaleMs || LOCK_STALE_MS)) {
        fs.unlinkSync(paths.lock);
        return acquireLock(paths, options);
      }
    } catch (retryError) {
      if (retryError.code === "ENOENT") return acquireLock(paths, options);
    }
    return null;
  }
}

function inspectSnapshot(context, options = {}) {
  const paths = cachePaths(context, options);
  const loaded = loadSnapshot(context, options);
  const exists = fs.existsSync(paths.snapshot);
  let persistenceAvailable = false;
  try {
    let probe = paths.directory;
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
    fs.accessSync(probe, fs.constants.W_OK);
    persistenceAvailable = true;
  } catch {}
  return {
    path: paths.snapshot,
    exists,
    valid: Boolean(loaded.snapshot),
    persistenceAvailable,
    schemaVersion: loaded.snapshot?.schemaVersion,
    indexVersion: loaded.snapshot?.indexVersion,
    documentCount: loaded.snapshot ? Object.keys(loaded.snapshot.documents).length : 0,
    builtAt: loaded.snapshot?.builtAt,
    warnings: loaded.warnings,
  };
}

function writeSnapshot(context, snapshot, options = {}) {
  const paths = cachePaths(context, options);
  let release;
  try {
    release = acquireLock(paths, options);
    if (!release) return { persisted: false, warning: warning("RECALL_CACHE_LOCKED", "another process is refreshing the cache") };
    const temporary = path.join(paths.directory, `.snapshot.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, paths.snapshot);
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch {}
      throw error;
    }
    return { persisted: true };
  } catch (error) {
    return { persisted: false, warning: warning("RECALL_CACHE_UNWRITABLE", error.message) };
  } finally {
    if (release) release();
  }
}

function storedDocument(document) {
  const { body, headings, workDescription, sourceRelative, ...stored } = document;
  return stored;
}

function incomingLinks(documents) {
  const incoming = {};
  for (const document of Object.values(documents)) {
    for (const link of document.links || []) {
      if (!link.toEntryId) continue;
      if (!incoming[link.toEntryId]) incoming[link.toEntryId] = [];
      incoming[link.toEntryId].push({
        fromEntryId: document.rawId,
        relation: link.relation,
        sourcePath: document.path,
      });
    }
  }
  return incoming;
}

function snapshotFromRecords(context, records, index) {
  const files = {};
  const documents = {};
  for (const record of records) {
    files[record.document.sourceRelative] = record.manifest;
    documents[record.document.id] = storedDocument(record.document);
  }
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    indexVersion: INDEX_VERSION,
    projectKey: projectIdentity(context),
    builtAt: new Date().toISOString(),
    files,
    documents,
    incomingLinks: incomingLinks(documents),
    index: serializeSearchIndex(index),
  };
}

function fullBuild(context, discovery) {
  const corpus = buildCorpus(context, discovery);
  const index = createSearchIndex(corpus.records.map((record) => record.document));
  return { index, snapshot: snapshotFromRecords(context, corpus.records, index), warnings: corpus.warnings };
}

function changedPaths(snapshot, discovery, force) {
  const current = new Map(discovery.files.map((file) => [file.relative, file]));
  const changed = new Set();
  const removed = [];
  if (force) for (const relative of current.keys()) changed.add(relative);
  else {
    for (const descriptor of discovery.files) {
      if (!sameFingerprint(snapshot.files[descriptor.relative], descriptor)) changed.add(descriptor.relative);
    }
    for (const relative of Object.keys(snapshot.files)) if (!current.has(relative)) removed.push(relative);
  }
  const affectedWork = new Set();
  for (const relative of changed) if (current.get(relative)?.kind === "work") affectedWork.add(current.get(relative).workSlug);
  for (const relative of removed) if (snapshot.files[relative]?.kind === "work") affectedWork.add(snapshot.files[relative].workSlug);
  for (const descriptor of discovery.files) if (affectedWork.has(descriptor.workSlug)) changed.add(descriptor.relative);
  return { changed, removed, current };
}

function incrementalBuild(context, prior, discovery) {
  const warnings = [...discovery.warnings];
  const index = loadSearchIndex(prior.index);
  const files = { ...prior.files };
  const documents = { ...prior.documents };
  const changes = changedPaths(prior, discovery, false);
  if (!changes.changed.size && !changes.removed.length) return { index, snapshot: prior, warnings, changed: false };

  for (const relative of changes.removed) {
    const old = files[relative];
    if (old?.documentId && index.has(old.documentId)) index.discard(old.documentId);
    if (old?.documentId) delete documents[old.documentId];
    delete files[relative];
  }

  const workContexts = readWorkContexts(discovery.files, warnings);
  for (const relative of [...changes.changed].sort()) {
    const descriptor = changes.current.get(relative);
    if (!descriptor) continue;
    const old = files[relative];
    if (old?.documentId && index.has(old.documentId)) index.discard(old.documentId);
    if (old?.documentId) delete documents[old.documentId];
    const record = documentFromDescriptor(descriptor, workContexts, warnings);
    if (index.has(record.document.id)) {
      warnings.push(warning("DUPLICATE_DOCUMENT_ID", record.document.id, record.document.path));
      record.document.id = `${record.document.kind}:path_${sha256(record.document.sourceRelative).slice(0, 24)}`;
      record.manifest.documentId = record.document.id;
    }
    index.add(record.document);
    files[relative] = record.manifest;
    documents[record.document.id] = storedDocument(record.document);
  }

  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    indexVersion: INDEX_VERSION,
    projectKey: projectIdentity(context),
    builtAt: new Date().toISOString(),
    files,
    documents,
    incomingLinks: incomingLinks(documents),
    index: serializeSearchIndex(index),
  };
  return { index, snapshot, warnings, changed: true };
}

function ensureSnapshot(context, options = {}) {
  const discovery = discoverSourceFiles(context);
  const loaded = options.noCache || options.rebuild ? { snapshot: null, warnings: [] } : loadSnapshot(context, options);
  let built;
  let status;
  if (!loaded.snapshot || options.rebuild || options.noCache) {
    built = fullBuild(context, discovery);
    status = "rebuilt";
  } else {
    try {
      built = incrementalBuild(context, loaded.snapshot, discovery);
      status = built.changed ? "refreshed" : "hit";
    } catch (error) {
      loaded.warnings.push(warning("RECALL_CACHE_REBUILD", error.message));
      built = fullBuild(context, discovery);
      status = "rebuilt";
    }
  }

  const warnings = [...loaded.warnings, ...built.warnings];
  let mode = "persistent";
  if (options.noCache) mode = "memory";
  else if (status !== "hit") {
    const written = writeSnapshot(context, built.snapshot, options);
    if (!written.persisted) {
      mode = "memory";
      if (written.warning) warnings.push(written.warning);
    }
  }
  return { index: built.index, snapshot: built.snapshot, mode, status, warnings };
}

module.exports = {
  LOCK_STALE_MS,
  MAX_SNAPSHOT_BYTES,
  RecallSnapshotError,
  SNAPSHOT_SCHEMA_VERSION,
  cachePaths,
  ensureSnapshot,
  incomingLinks,
  inspectSnapshot,
  loadSnapshot,
  projectIdentity,
  validateSnapshot,
  writeSnapshot,
};
