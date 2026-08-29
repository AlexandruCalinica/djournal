"use strict";

const MiniSearch = require("minisearch");

const INDEX_VERSION = "minisearch-v1";
const INDEX_OPTIONS = Object.freeze({
  idField: "id",
  fields: ["path", "workTitle", "workDescription", "title", "summary", "headings", "body"],
  storeFields: [
    "rawId", "kind", "path", "workSlug", "workItemId", "workTitle", "title", "summary",
    "entryType", "status", "visibility", "createdAt", "updatedAt", "links", "incomingLinks",
  ],
});

function createSearchIndex(documents = []) {
  const index = new MiniSearch(INDEX_OPTIONS);
  if (documents.length) index.addAll(documents);
  return index;
}

function loadSearchIndex(value) {
  return MiniSearch.loadJSON(JSON.stringify(value), INDEX_OPTIONS);
}

function serializeSearchIndex(index) {
  return JSON.parse(JSON.stringify(index));
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function resultShape(result, incomingLinks) {
  return {
    id: result.rawId,
    documentId: result.id,
    path: result.path,
    workSlug: result.workSlug,
    workItemId: result.workItemId,
    title: result.title,
    summary: result.summary,
    entryType: result.entryType,
    status: result.status,
    visibility: result.visibility,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    score: result.score,
    terms: result.terms,
    match: result.match,
    links: result.links || [],
    incomingLinks: incomingLinks?.[result.rawId] || [],
  };
}

function searchIndex(index, query, options = {}) {
  if (typeof query !== "string" || !query.trim()) {
    const error = new Error("recall search requires a non-empty query");
    error.code = "USAGE";
    throw error;
  }
  const types = new Set(list(options.types || options.type));
  const kinds = new Set(list(options.kinds || options.kind));
  const statuses = new Set(list(options.status));
  const visibilities = new Set(list(options.visibility));
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 100) : 10;
  const results = index.search(query.trim(), {
    boost: { title: 7, workTitle: 5, summary: 4, path: 3, workDescription: 2, headings: 2, body: 1 },
    prefix: (term) => term.length >= 3,
    fuzzy: (term) => term.length >= 5 ? 0.2 : false,
    filter: (result) => {
      if (options.work && result.workSlug !== options.work) return false;
      if (types.size && !types.has(result.entryType)) return false;
      if (kinds.size && !kinds.has(result.kind)) return false;
      if (statuses.size && !statuses.has(result.status)) return false;
      if (visibilities.size && !visibilities.has(result.visibility)) return false;
      return true;
    },
  });
  return {
    workItems: results.filter((result) => result.kind === "work").slice(0, limit).map((result) => resultShape(result, options.incomingLinks)),
    entries: results.filter((result) => result.kind === "entry").slice(0, limit).map((result) => resultShape(result, options.incomingLinks)),
  };
}

module.exports = {
  INDEX_OPTIONS,
  INDEX_VERSION,
  createSearchIndex,
  loadSearchIndex,
  searchIndex,
  serializeSearchIndex,
};
