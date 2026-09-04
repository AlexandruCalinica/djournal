"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const ENTRY_DIRECTORIES = ["journal", "_research", "docs", "decisions"];
const MAX_MARKDOWN_BYTES = 16 * 1024 * 1024;

class RecallCorpusError extends Error {
  constructor(message, code = "RECALL_CORPUS_ERROR") {
    super(message);
    this.name = "RecallCorpusError";
    this.code = code;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function posix(relative) {
  return relative.split(path.sep).join("/");
}

function fingerprint(stat) {
  return { size: stat.size, mtimeMs: stat.mtimeMs };
}

function sameFingerprint(left, right) {
  return Boolean(left && right && left.size === right.size && left.mtimeMs === right.mtimeMs);
}

function assertWithin(root, candidate) {
  const boundary = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== boundary && !resolved.startsWith(`${boundary}${path.sep}`)) {
    throw new RecallCorpusError(`journal path escapes canonical root: ${candidate}`, "UNSAFE_PATH");
  }
  return resolved;
}

function listMarkdown(directory, journalRoot, workSlug, area, warnings, result) {
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
  catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const absolute = assertWithin(journalRoot, path.join(directory, entry.name));
    if (entry.isSymbolicLink()) {
      warnings.push({ code: "SYMLINK_IGNORED", path: posix(path.relative(journalRoot, absolute)) });
      continue;
    }
    if (entry.isDirectory()) {
      listMarkdown(absolute, journalRoot, workSlug, area, warnings, result);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") continue;
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    result.push({
      absolute,
      relative: posix(path.relative(journalRoot, absolute)),
      workSlug,
      area,
      kind: "entry",
      ...fingerprint(stat),
    });
  }
}

function discoverSourceFiles(context) {
  const journalRoot = path.resolve(context.journalRoot);
  const workRoot = path.join(journalRoot, "work");
  const warnings = [];
  const files = [];
  let workDirectories = [];
  try { workDirectories = fs.readdirSync(workRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }

  for (const entry of workDirectories) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      if (entry.isSymbolicLink()) warnings.push({ code: "SYMLINK_IGNORED", path: `work/${entry.name}` });
      continue;
    }
    const workDirectory = assertWithin(journalRoot, path.join(workRoot, entry.name));
    const workFile = path.join(workDirectory, "work.md");
    try {
      const stat = fs.lstatSync(workFile);
      if (stat.isFile() && !stat.isSymbolicLink()) {
        files.push({
          absolute: workFile,
          relative: posix(path.relative(journalRoot, workFile)),
          workSlug: entry.name,
          area: "work",
          kind: "work",
          ...fingerprint(stat),
        });
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    for (const area of ENTRY_DIRECTORIES) {
      listMarkdown(path.join(workDirectory, area), journalRoot, entry.name, area, warnings, files);
    }
  }
  return { files: files.sort((a, b) => a.relative.localeCompare(b.relative)), warnings };
}

function stableRead(descriptor) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = fs.lstatSync(descriptor.absolute);
    if (!before.isFile() || before.isSymbolicLink()) {
      throw new RecallCorpusError(`source is not a regular file: ${descriptor.relative}`, "UNSAFE_PATH");
    }
    if (before.size > MAX_MARKDOWN_BYTES) {
      throw new RecallCorpusError(`journal file exceeds ${MAX_MARKDOWN_BYTES} bytes: ${descriptor.relative}`, "RECALL_FILE_TOO_LARGE");
    }
    const buffer = fs.readFileSync(descriptor.absolute);
    const after = fs.lstatSync(descriptor.absolute);
    if (sameFingerprint(fingerprint(before), fingerprint(after))) {
      return { buffer, stat: fingerprint(after), sha256: sha256(buffer) };
    }
  }
  throw new RecallCorpusError(`journal file changed while indexing: ${descriptor.relative}`, "RECALL_SOURCE_CHANGED");
}

function parseMarkdown(buffer, relative, warnings) {
  const text = buffer.toString("utf8");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return { metadata: {}, body: text };
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    warnings.push({ code: "MALFORMED_FRONTMATTER", path: relative, detail: "unterminated" });
    return { metadata: {}, body: text };
  }
  try {
    const metadata = YAML.parse(match[1]) || {};
    return { metadata: typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}, body: text.slice(match[0].length) };
  } catch (error) {
    warnings.push({ code: "MALFORMED_FRONTMATTER", path: relative, detail: error.message.split("\n")[0] });
    return { metadata: {}, body: text.slice(match[0].length) };
  }
}

function firstHeading(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function headings(body) {
  return [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1].trim()).join("\n");
}

function legacyTitle(relative) {
  return path.basename(relative, path.extname(relative))
    .replace(/^\d{4}-\d{2}-\d{2}-\d{2}-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scalar(value, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function normalizeLinks(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((link) => link && typeof link === "object").map((link) => ({
    id: scalar(link.id),
    fromEntryId: scalar(link.fromEntryId),
    toEntryId: scalar(link.toEntryId),
    relation: scalar(link.relation),
    createdAt: scalar(link.createdAt),
    targetPath: scalar(link.targetPath),
  }));
}

function inferredEntryType(area, relative) {
  if (area === "decisions") return "decision";
  if (area === "docs") return "doc";
  if (area === "_research") return "research";
  const name = path.basename(relative).toLowerCase();
  if (name.includes("plan")) return "plan";
  if (name.includes("status")) return "status";
  return "manual";
}

function rawId(kind, metadata, relative) {
  const value = scalar(metadata.id);
  return value || `path_${sha256(relative).slice(0, 24)}`;
}

function logicalPath(relative) {
  return `.journal/${posix(relative)}`;
}

function readWorkContexts(files, warnings) {
  const result = new Map();
  for (const descriptor of files.filter((file) => file.kind === "work")) {
    const read = stableRead(descriptor);
    const parsed = parseMarkdown(read.buffer, descriptor.relative, warnings);
    const metadata = parsed.metadata;
    result.set(descriptor.workSlug, {
      descriptor,
      read,
      metadata,
      body: parsed.body,
      workItemId: scalar(metadata.id),
      title: scalar(metadata.title, descriptor.workSlug),
      description: scalar(metadata.description),
      status: scalar(metadata.status, "unknown"),
      visibility: scalar(metadata.visibility, "local_only"),
    });
  }
  return result;
}

function documentFromDescriptor(descriptor, workContexts, warnings, existingRead) {
  const work = workContexts.get(descriptor.workSlug) || {
    workItemId: "",
    title: descriptor.workSlug,
    description: "",
    status: "unknown",
    visibility: "local_only",
  };
  const read = existingRead || stableRead(descriptor);
  const parsed = descriptor.kind === "work" && work.descriptor?.relative === descriptor.relative
    ? { metadata: work.metadata, body: work.body }
    : parseMarkdown(read.buffer, descriptor.relative, warnings);
  const metadata = parsed.metadata;
  const fallbackTitle = legacyTitle(descriptor.relative);
  const itemId = rawId(descriptor.kind, metadata, descriptor.relative);
  const kind = descriptor.kind;
  const entryType = kind === "entry" ? scalar(metadata.entryType, inferredEntryType(descriptor.area, descriptor.relative)) : "work";
  return {
    document: {
      id: `${kind}:${itemId}`,
      rawId: scalar(metadata.id, itemId),
      kind,
      path: logicalPath(descriptor.relative),
      sourceRelative: descriptor.relative,
      workSlug: descriptor.workSlug,
      workItemId: kind === "work" ? scalar(metadata.id, work.workItemId) : scalar(metadata.workItemId, work.workItemId),
      workTitle: kind === "work" ? scalar(metadata.title, work.title) : work.title,
      workDescription: kind === "work" ? scalar(metadata.description, work.description) : work.description,
      title: scalar(metadata.title, firstHeading(parsed.body, fallbackTitle)),
      summary: scalar(metadata.summary, kind === "work" ? scalar(metadata.description) : ""),
      headings: headings(parsed.body),
      body: parsed.body,
      entryType,
      status: work.status,
      visibility: work.visibility,
      createdAt: scalar(metadata.createdAt),
      updatedAt: scalar(metadata.updatedAt),
      links: normalizeLinks(metadata.links),
      incomingLinks: [],
    },
    manifest: {
      size: read.stat.size,
      mtimeMs: read.stat.mtimeMs,
      sha256: read.sha256,
      documentId: `${kind}:${itemId}`,
      workSlug: descriptor.workSlug,
      kind,
    },
  };
}

function normalizeDuplicateIds(records, warnings) {
  const seen = new Map();
  for (const record of records) {
    const prior = seen.get(record.document.id);
    if (!prior) {
      seen.set(record.document.id, record.document.path);
      continue;
    }
    warnings.push({ code: "DUPLICATE_DOCUMENT_ID", path: record.document.path, detail: prior });
    const replacement = `${record.document.kind}:path_${sha256(record.document.sourceRelative).slice(0, 24)}`;
    record.document.id = replacement;
    record.manifest.documentId = replacement;
  }
}

function deriveIncomingLinks(records, warnings) {
  const byRawId = new Map();
  for (const record of records.filter((item) => item.document.kind === "entry")) {
    if (!byRawId.has(record.document.rawId)) byRawId.set(record.document.rawId, record.document);
  }
  for (const record of records) {
    for (const link of record.document.links) {
      const target = byRawId.get(link.toEntryId);
      if (!target) {
        if (link.toEntryId) warnings.push({ code: "UNRESOLVED_LINK", path: record.document.path, detail: link.toEntryId });
        continue;
      }
      target.incomingLinks.push({
        fromEntryId: record.document.rawId,
        relation: link.relation,
        sourcePath: record.document.path,
      });
    }
  }
}

function buildCorpus(context, discovery = discoverSourceFiles(context)) {
  const warnings = [...discovery.warnings];
  const workContexts = readWorkContexts(discovery.files, warnings);
  const workReads = new Map([...workContexts.values()].map((work) => [work.descriptor.relative, work.read]));
  const records = discovery.files.map((descriptor) => documentFromDescriptor(descriptor, workContexts, warnings, workReads.get(descriptor.relative)));
  normalizeDuplicateIds(records, warnings);
  deriveIncomingLinks(records, warnings);
  return { records, files: discovery.files, warnings };
}

module.exports = {
  ENTRY_DIRECTORIES,
  MAX_MARKDOWN_BYTES,
  RecallCorpusError,
  buildCorpus,
  documentFromDescriptor,
  discoverSourceFiles,
  fingerprint,
  readWorkContexts,
  sameFingerprint,
  sha256,
  stableRead,
};
