"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ENTRY_DIRECTORIES = Object.freeze({
  plan: "journal",
  implementation: "journal",
  status: "journal",
  manual: "journal",
  research: "_research",
  doc: "docs",
  decision: "decisions",
});

const SPINE_TYPES = new Set(["plan", "implementation", "status", "manual"]);
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class JournalEntryError extends Error {
  constructor(message, code = "ENTRY_ERROR") {
    super(message);
    this.name = "JournalEntryError";
    this.code = code;
  }
}

function uuidV7(prefix) {
  const bytes = crypto.randomBytes(16);
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 255n);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return `${prefix}_${id}`;
}

function isUuidV7(value, prefix) {
  if (typeof value !== "string" || !value.startsWith(`${prefix}_`)) return false;
  return UUID_V7.test(value.slice(prefix.length + 1));
}

function kebab(value) {
  const text = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return text.slice(0, 60) || "entry";
}

function utcDate(now) {
  return now.toISOString().slice(0, 10);
}

function parseSimpleFrontmatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};
  const result = {};
  for (const line of text.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!match) continue;
    result[match[1]] = match[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return result;
}

function frontmatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    lines.push(typeof value === "number" ? `${key}: ${value}` : `${key}: ${JSON.stringify(String(value))}`);
  }
  lines.push("---", "");
  return `${lines.join("\n")}`;
}

function nextDailySequence(directory, date) {
  let max = 0;
  if (fs.existsSync(directory)) {
    for (const name of fs.readdirSync(directory)) {
      const match = /^(\d{4}-\d{2}-\d{2})-(\d+)-/.exec(name);
      if (match && match[1] === date) max = Math.max(max, Number(match[2]));
    }
  }
  return max + 1;
}

function sequenceName(date, sequence, suffix) {
  return `${date}-${String(sequence).padStart(2, "0")}-${suffix}`;
}

function writeExclusive(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const descriptor = fs.openSync(file, "wx");
  try {
    fs.writeFileSync(descriptor, content);
  } finally {
    fs.closeSync(descriptor);
  }
}

function allocate(directory, date, suffix, render) {
  let sequence = nextDailySequence(directory, date);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const stem = sequenceName(date, sequence, suffix);
    const file = path.join(directory, `${stem}.md`);
    if (!fs.existsSync(file)) {
      try {
        writeExclusive(file, render(stem, sequence));
        return { file, stem, sequence };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    sequence += 1;
  }
  throw new JournalEntryError("could not allocate a free journal filename", "ENTRY_COLLISION");
}

function workDirectory(journalRoot, slug) {
  if (!slug || slug.includes("/") || slug.includes("\\") || slug === "." || slug === "..") {
    throw new JournalEntryError(`invalid work slug: ${slug || ""}`, "INVALID_WORK");
  }
  const directory = path.join(journalRoot, "work", slug);
  if (!fs.existsSync(path.join(directory, "work.md"))) {
    throw new JournalEntryError(`work item not found: ${slug}`, "INVALID_WORK");
  }
  return directory;
}

function nextEntryNumber(journalDirectory) {
  let max = 0;
  if (!fs.existsSync(journalDirectory)) return 1;
  for (const name of fs.readdirSync(journalDirectory)) {
    if (!name.endsWith(".md")) continue;
    const text = fs.readFileSync(path.join(journalDirectory, name), "utf8");
    const value = Number(parseSimpleFrontmatter(text).entryNumber);
    if (Number.isInteger(value)) max = Math.max(max, value);
  }
  return max + 1;
}

function createWorkDirectory(options) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new JournalEntryError("current time is invalid", "ENTRY_TIME");
  const title = typeof options.title === "string" ? options.title.trim() : "";
  if (!title) throw new JournalEntryError("work new requires --title", "USAGE");
  const suffix = kebab(options.name || title);
  const date = utcDate(now);
  const workRoot = path.join(options.journalRoot, "work");
  const timestamp = now.toISOString();
  const id = uuidV7("wi");
  const createdBy = options.createdBy || "unknown@local";
  const description = typeof options.description === "string" ? options.description.trim() : "";
  let sequence = nextDailySequence(workRoot, date);
  if (options.dryRun) {
    const slug = sequenceName(date, sequence, suffix);
    return {
      action: "work-new",
      dryRun: true,
      id,
      slug,
      title,
      path: path.join(workRoot, slug, "work.md"),
      journalRoot: options.journalRoot,
    };
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const slug = sequenceName(date, sequence, suffix);
    const directory = path.join(workRoot, slug);
    try {
      fs.mkdirSync(directory);
      for (const child of ["journal", "_research", "docs", "decisions"]) {
        fs.mkdirSync(path.join(directory, child));
      }
      const file = path.join(directory, "work.md");
      fs.writeFileSync(file, `${frontmatter({
        id,
        slug,
        title,
        description,
        status: "active",
        visibility: "local_only",
        createdBy,
        createdAt: timestamp,
        updatedAt: timestamp,
      })}# ${title}\n\n## Objective\n\n${description || title}\n`);
      return {
        action: "work-new",
        dryRun: false,
        id,
        slug,
        title,
        path: file,
        journalRoot: options.journalRoot,
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      sequence += 1;
    }
  }
  throw new JournalEntryError("could not allocate a free work item name", "ENTRY_COLLISION");
}

function createEntry(options) {
  const entryType = options.entryType;
  const directoryName = ENTRY_DIRECTORIES[entryType];
  if (!directoryName) {
    throw new JournalEntryError(`entry new requires --type ${Object.keys(ENTRY_DIRECTORIES).join("|")}`, "USAGE");
  }
  const title = typeof options.title === "string" ? options.title.trim() : "";
  if (!title) throw new JournalEntryError("entry new requires --title", "USAGE");
  const summary = typeof options.summary === "string" ? options.summary.trim() : "";
  if (!summary) throw new JournalEntryError("entry new requires --summary", "USAGE");
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new JournalEntryError("current time is invalid", "ENTRY_TIME");
  const workDir = workDirectory(options.journalRoot, options.workSlug);
  const work = parseSimpleFrontmatter(fs.readFileSync(path.join(workDir, "work.md"), "utf8"));
  if (!work.id) throw new JournalEntryError(`work item is missing an id: ${options.workSlug}`, "INVALID_WORK");
  const destination = path.join(workDir, directoryName);
  const suffix = kebab(options.name || title);
  const date = utcDate(now);
  const timestamp = now.toISOString();
  const id = uuidV7("ent");
  const createdBy = options.createdBy || "unknown@local";
  const entryNumber = SPINE_TYPES.has(entryType) ? nextEntryNumber(destination) : undefined;
  const render = () => `${frontmatter({
    id,
    workItemId: work.id,
    entryType,
    entryNumber,
    title,
    summary,
    createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: "manual",
  })}# ${title}\n`;
  if (options.dryRun) {
    const sequence = nextDailySequence(destination, date);
    const stem = sequenceName(date, sequence, suffix);
    return {
      action: "entry-new",
      dryRun: true,
      id,
      entryType,
      entryNumber,
      work: options.workSlug,
      path: path.join(destination, `${stem}.md`),
      journalRoot: options.journalRoot,
    };
  }
  fs.mkdirSync(destination, { recursive: true });
  const created = allocate(destination, date, suffix, () => render());
  return {
    action: "entry-new",
    dryRun: false,
    id,
    entryType,
    entryNumber,
    work: options.workSlug,
    path: created.file,
    journalRoot: options.journalRoot,
  };
}

function relativeTo(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function validateJournal(options) {
  const issues = [];
  const workRoot = path.join(options.journalRoot, "work");
  if (!fs.existsSync(workRoot)) {
    return { action: "entry-validate", ok: true, journalRoot: options.journalRoot, issues };
  }
  const slugs = fs.readdirSync(workRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((slug) => !options.workSlug || slug === options.workSlug)
    .sort();
  if (options.workSlug && !slugs.includes(options.workSlug)) {
    throw new JournalEntryError(`work item not found: ${options.workSlug}`, "INVALID_WORK");
  }
  for (const slug of slugs) {
    const directory = path.join(workRoot, slug);
    const workFile = path.join(directory, "work.md");
    if (!fs.existsSync(workFile)) continue;
    const work = parseSimpleFrontmatter(fs.readFileSync(workFile, "utf8"));
    const workPath = relativeTo(options.journalRoot, workFile);
    if (!isUuidV7(work.id, "wi")) issues.push({ path: workPath, code: "ID_NOT_V7", detail: "work id must be a wi_ UUIDv7" });
    for (const field of ["slug", "title", "status", "visibility", "createdBy", "createdAt", "updatedAt"]) {
      if (!work[field]) issues.push({ path: workPath, code: "MISSING_FIELD", detail: field });
    }
    for (const role of Object.values(ENTRY_DIRECTORIES)) {
      const bucket = path.join(directory, role);
      if (!fs.existsSync(bucket)) continue;
      const sequences = new Map();
      for (const name of fs.readdirSync(bucket)) {
        if (!name.endsWith(".md")) continue;
        const file = path.join(bucket, name);
        const relative = relativeTo(options.journalRoot, file);
        const metadata = parseSimpleFrontmatter(fs.readFileSync(file, "utf8"));
        if (!isUuidV7(metadata.id, "ent")) issues.push({ path: relative, code: "ID_NOT_V7", detail: "entry id must be an ent_ UUIDv7" });
        for (const field of ["workItemId", "entryType", "title", "summary", "createdBy", "createdAt", "updatedAt", "source"]) {
          if (!metadata[field]) issues.push({ path: relative, code: "MISSING_FIELD", detail: field });
        }
        if (work.id && metadata.workItemId && metadata.workItemId !== work.id) {
          issues.push({ path: relative, code: "WORK_ITEM_MISMATCH", detail: "workItemId does not match work.md" });
        }
        const sequence = /^(\d{4}-\d{2}-\d{2}-\d+)-/.exec(name);
        if (sequence) {
          const key = `${role}:${sequence[1]}`;
          if (sequences.has(key)) {
            issues.push({ path: relative, code: "DUPLICATE_SEQUENCE", detail: `same date-sequence as ${sequences.get(key)}` });
          } else sequences.set(key, name);
        }
      }
    }
  }
  return { action: "entry-validate", ok: issues.length === 0, journalRoot: options.journalRoot, work: options.workSlug, issues };
}

module.exports = {
  ENTRY_DIRECTORIES,
  JournalEntryError,
  createEntry,
  createWorkItem: createWorkDirectory,
  isUuidV7,
  uuidV7,
  validateJournal,
};
