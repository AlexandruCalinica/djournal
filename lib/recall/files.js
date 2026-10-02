"use strict";

const path = require("node:path");

const EXTRACTOR_VERSION = 1;
const MAX_REFERENCES = 1000;
const MAX_RELATED_EDGES = 200;
const MAX_MATCHES = 100;

function usage(message) {
  return Object.assign(new Error(message), { code: "USAGE" });
}

// Paths are lexical: deleted and not-yet-created code must remain searchable.
function normalizePath(value, { target, query = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048 || /[\x00-\x1f\x7f]/.test(value)) return null;
  let normalized = value.trim().replace(/(?::\d+(?::\d+)?|#L\d+(?:-L?\d+)?)$/, "");
  if (process.platform === "win32") normalized = normalized.replace(/\\/g, "/");
  if (/^[a-z][a-z\d+.-]*:/i.test(normalized) && !path.isAbsolute(normalized)) return null;
  if (path.isAbsolute(normalized)) {
    if (!query || !target) return null;
    normalized = path.relative(path.resolve(target), normalized).split(path.sep).join("/");
  }
  if (/[<>*?`|]/.test(normalized) || normalized.includes("${")) return null;
  normalized = path.posix.normalize(normalized).replace(/\/$/, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) return null;
  if (normalized === ".journal" || normalized.startsWith(".journal/")) return null;
  return normalized;
}

function repositoryLabel(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value);
}

function extractReferences(metadata, body, warnings, journalPath) {
  const references = [];
  const seen = new Set();
  let truncated = false;
  function add(raw, kind, repository, relation, provenance, bodyLine, excerpt) {
    const normalized = normalizePath(raw);
    if (!normalized || !["file", "directory"].includes(kind) || !["mentions", "changes", "constrains"].includes(relation)) return false;
    if (repository !== "" && !repositoryLabel(repository)) return false;
    const reference = { path: normalized, kind, repository, relation, provenance, bodyLine, excerpt: excerpt.slice(0, 240) };
    const key = JSON.stringify([normalized, kind, repository, relation, provenance]);
    if (!seen.has(key)) {
      if (references.length >= MAX_REFERENCES) { truncated = true; return true; }
      seen.add(key);
      references.push(reference);
    }
    return true;
  }
  const explicit = metadata.metadata?.codeReferences;
  if (explicit !== undefined) {
    if (!Array.isArray(explicit)) warnings.push({ code: "INVALID_CODE_REFERENCES", path: journalPath });
    else for (const ref of explicit) {
      if (!ref || typeof ref !== "object" || !add(ref.path, ref.kind || "file", ref.repository ?? "", ref.relation || "mentions", "metadata", null, typeof ref.path === "string" ? ref.path : "")) {
        if (!warnings.some(w => w.code === "INVALID_CODE_REFERENCES" && w.path === journalPath)) warnings.push({ code: "INVALID_CODE_REFERENCES", path: journalPath });
      }
    }
  }
  // Deliberately bounded syntax, not a general Markdown parser. Unsupported
  // forms can always use codeReferences. Fenced examples never imply scope.
  let fence = null;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence || /^ {4}|^\t/.test(line)) continue;
    const candidates = [];
    for (const match of line.matchAll(/(`+)([^`\n]+)\1/g)) candidates.push([match[2], "inline_code"]);
    for (const match of line.matchAll(/\[[^\]\n]*\]\((<[^>\n]+>|[^\s()]+)(?:\s+"[^"\n]*")?\)/g)) {
      candidates.push([match[1].replace(/^<|>$/g, ""), "markdown_link"]);
    }
    if (line.trim().startsWith("|")) {
      for (const cell of line.split("|").slice(1, -1)) if (!/[`\[\]]/.test(cell)) candidates.push([cell.trim(), "table_cell"]);
    }
    for (const [raw, provenance] of candidates) {
      // Only whole path literals; commands, prose, and relative journal links
      // must not become references just because they contain a slash.
      if (/^(?:node|npm|npx|git|cat|rg|python\d*|bash|sh|djournal|journal)\s/.test(raw)) continue;
      if (/\s[-]|[;&=]|^\$|^\.{2}\//.test(raw) || /^(?:https?|file):/i.test(raw)) continue;
      const normalized = normalizePath(raw);
      if (!normalized || raw.includes("\\") || /#(?!L\d+(?:-L?\d+)?$)/.test(raw)) continue;
      const directory = raw.endsWith("/");
      const basename = path.posix.basename(normalized);
      if (!directory && !/^(?:[^\s/]+\.[a-z\d]+|\.[\w.-]+|README|LICENSE|Makefile|Dockerfile|AGENTS\.md)$/i.test(basename) && !/\.[a-z\d]+$/i.test(basename)) continue;
      if (/\s/.test(raw) && !normalized.includes("/") && provenance === "table_cell") continue;
      if (/^(?:journal|_research|decisions|docs)\//.test(raw) && /\d{4}-\d{2}-\d{2}-/.test(raw)) continue;
      add(raw, directory ? "directory" : "file", "", "mentions", provenance, i + 1, line.trim());
    }
  }
  if (truncated) warnings.push({ code: "CODE_REFERENCES_TRUNCATED", path: journalPath });
  return { references, truncated };
}

function postingKey(repository, file) { return JSON.stringify([repository, file]); }

function buildPathIndex(documents) {
  const files = Object.create(null);
  const directories = Object.create(null);
  const repositories = new Set();
  for (const document of Object.values(documents)) {
    if (document.kind !== "entry") continue;
    for (const [referenceIndex, ref] of document.codeReferences.entries()) {
      repositories.add(ref.repository);
      const map = ref.kind === "directory" ? directories : files;
      const key = postingKey(ref.repository, ref.path);
      (map[key] ||= []).push({ documentId: document.id, referenceIndex });
    }
  }
  return { files, directories, repositories: [...repositories].sort() };
}

function validPathIndex(snapshot) {
  if (snapshot.extractorVersion !== EXTRACTOR_VERSION || !snapshot.pathIndex) return false;
  for (const [key, doc] of Object.entries(snapshot.documents)) {
    if (!doc || doc.id !== key || !Array.isArray(doc.codeReferences) || doc.codeReferences.length > MAX_REFERENCES || typeof doc.codeReferencesTruncated !== "boolean") return false;
    for (const ref of doc.codeReferences) {
      if (!ref || typeof ref.path !== "string" || normalizePath(ref.path) !== ref.path || !["file", "directory"].includes(ref.kind) || (ref.repository !== "" && !repositoryLabel(ref.repository)) || !["mentions", "changes", "constrains"].includes(ref.relation)) return false;
      if (!["metadata", "inline_code", "markdown_link", "table_cell"].includes(ref.provenance) || !(ref.bodyLine === null || (Number.isInteger(ref.bodyLine) && ref.bodyLine > 0)) || typeof ref.excerpt !== "string" || ref.excerpt.length > 240) return false;
    }
  }
  // Re-derive to reject dangling/forged posting references rather than trusting
  // cached indices. This is linear in retained references, not source bodies.
  return JSON.stringify(snapshot.pathIndex) === JSON.stringify(buildPathIndex(snapshot.documents));
}

function normalizeInputs(inputs, options = {}) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 100) throw usage("recall files requires 1 to 100 paths");
  if (options.repository !== undefined && !repositoryLabel(options.repository)) throw usage("--repository requires a non-empty label (maximum 256 characters)");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)) throw usage("--limit must be an integer from 1 to 100");
  return [...new Set(inputs.map(value => {
    const normalized = normalizePath(value, { ...options, query: true });
    if (!normalized) throw usage("recall files requires code paths within the target checkout");
    return normalized;
  }))];
}

function lookupPaths(snapshot, inputs, options = {}) {
  const results = new Map();
  const documents = snapshot.documents;
  const index = snapshot.pathIndex;
  const scopes = options.repository === undefined ? index.repositories : ["", options.repository];
  const counts = new Map(inputs.map(p => [p, new Set()]));
  const limit = options.limit || 10;
  const warnings = [];
  const eligible = doc => doc.kind === "entry" && (!options.work || doc.workSlug === options.work);
  const inScope = doc => options.repository === undefined || !doc.codeReferences.length || doc.codeReferences.some(ref => !ref.repository || ref.repository === options.repository);
  function add(doc, match) {
    let result = results.get(doc.id);
    if (!result) {
      const { codeReferences, codeReferencesTruncated, ...fields } = doc;
      result = { ...fields, id: doc.rawId, documentId: doc.id, matches: [], matchesTruncated: false, codeReferencesTruncated, incomingLinks: snapshot.incomingLinks?.[doc.rawId] || [], supersededBy: [], supersededByTruncated: false };
      results.set(doc.id, result);
    }
    if (result.matches.length < MAX_MATCHES) result.matches.push(match);
    else result.matchesTruncated = true;
  }
  for (const input of inputs) {
    const ancestors = [];
    for (let dir = path.posix.dirname(input); dir !== "."; dir = path.posix.dirname(dir)) ancestors.push(dir);
    for (const repository of scopes) {
      for (const [map, key, kind] of [[index.files, input, "exact_file"], ...[input, ...ancestors].map(dir => [index.directories, dir, "ancestor_directory"])]) {
        for (const posting of map[postingKey(repository, key)] || []) {
          const doc = documents[posting.documentId];
          if (!eligible(doc)) continue;
          counts.get(input).add(doc.id);
          const ref = doc.codeReferences[posting.referenceIndex];
          add(doc, { inputPath: input, kind, recordedPath: ref.path, repository: ref.repository || null, scope: ref.repository ? "explicit" : "unscoped", relation: ref.relation, evidence: { provenance: ref.provenance, bodyLine: ref.bodyLine, excerpt: ref.excerpt } });
        }
      }
    }
  }
  const byRawId = new Map();
  for (const doc of Object.values(documents)) {
    if (doc.kind === "entry") {
      if (!byRawId.has(doc.rawId)) byRawId.set(doc.rawId, []);
      byRawId.get(doc.rawId).push(doc);
    }
  }
  const edges = new Map();
  let ambiguous = false;
  let inconsistent = false;
  function connect(from, edge) {
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push(edge);
  }
  for (const doc of Object.values(documents)) {
    for (const link of doc.links || []) {
      if (!["references", "relates_to", "supersedes"].includes(link.relation)) continue;
      const targets = byRawId.get(link.toEntryId) || [];
      if (targets.length !== 1 || (byRawId.get(doc.rawId) || []).length !== 1) { if (targets.length > 1 || (byRawId.get(doc.rawId) || []).length > 1) ambiguous = true; continue; }
      const target = targets[0];
      if (link.targetPath && path.posix.normalize(path.posix.join(path.posix.dirname(doc.path), link.targetPath)) !== target.path) {
        inconsistent = true;
        continue;
      }
      connect(doc.id, { doc: target, relation: link.relation, direction: "outgoing" });
      connect(target.id, { doc, relation: link.relation, direction: "incoming" });
    }
  }
  const order = { exact_file: 0, ancestor_directory: 1, linked_context: 2 };
  const rank = entry => Math.min(...entry.matches.map(match => order[match.kind]));
  const sort = (a, b) => rank(a) - rank(b)
    || Number(b.entryType === "decision") - Number(a.entryType === "decision")
    || String(b.createdAt).localeCompare(String(a.createdAt)) || a.path.localeCompare(b.path);
  const direct = [...results.values()].sort(sort);
  let examined = 0;
  let relatedTruncated = false;
  outer: for (const source of direct) {
    for (const edge of edges.get(source.documentId) || []) {
      if (examined++ >= MAX_RELATED_EDGES) { relatedTruncated = true; break outer; }
      if (!eligible(edge.doc) || !inScope(edge.doc) || edge.doc.id === source.documentId) continue;
      if (edge.relation !== "supersedes" && !["decision", "doc"].includes(edge.doc.entryType)) continue;
      // Copy the direct routes: cycles never expand newly linked evidence.
      for (const inputPath of new Set(source.matches.filter(m => m.kind !== "linked_context").map(m => m.inputPath))) {
        add(edge.doc, { inputPath, kind: "linked_context", viaDocumentId: source.documentId, viaPath: source.path, relation: edge.relation, direction: edge.direction });
      }
    }
  }
  for (const result of results.values()) {
    const replacements = (edges.get(result.documentId) || []).filter(e => e.relation === "supersedes" && e.direction === "incoming" && eligible(e.doc) && inScope(e.doc));
    result.supersededByTruncated = replacements.length > MAX_MATCHES;
    result.supersededBy = replacements.slice(0, MAX_MATCHES).map(e => ({ id: e.doc.rawId, documentId: e.doc.id, path: e.doc.path }));
  }
  if (inconsistent) warnings.push({ code: "INCONSISTENT_PATH_EVIDENCE_LINK", detail: "links whose IDs and target paths disagree were not expanded" });
  if (ambiguous) warnings.push({ code: "AMBIGUOUS_PATH_EVIDENCE_LINK", detail: "links with duplicate entry IDs were not expanded" });
  if (Object.values(documents).some(d => d.codeReferencesTruncated)) warnings.push({ code: "CODE_REFERENCES_TRUNCATED", detail: "some entries exceed the reference extraction limit" });
  const all = [...results.values()].sort(sort);
  const entries = all.slice(0, limit);
  return {
    entries,
    totalEntries: all.length,
    truncated: all.length > entries.length,
    relatedTruncated,
    unmatchedPaths: inputs.filter(p => !counts.get(p).size),
    paths: inputs.map(p => ({ path: p, directMatches: counts.get(p).size, returnedDirectMatches: entries.filter(e => counts.get(p).has(e.documentId)).length })),
    warnings,
  };
}

module.exports = { EXTRACTOR_VERSION, extractReferences, buildPathIndex, validPathIndex, normalizeInputs, normalizePath, lookupPaths };
