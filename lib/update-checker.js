"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const semver = require("semver");

const CACHE_FILENAME = "update-check.json";
const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REGISTRY_ACCEPT = "application/vnd.npm.install-v1+json";

class UpdateCheckError extends Error {
  constructor(message, code = "UPDATE_CHECK_FAILED") {
    super(message);
    this.name = "UpdateCheckError";
    this.code = code;
  }
}

function djournalHome(options = {}) {
  return path.resolve(options.djournalHome || process.env.DJOURNAL_HOME || path.join(os.homedir(), ".djournal"));
}

function cacheFile(options = {}) {
  return path.resolve(options.cacheFile || path.join(djournalHome(options), CACHE_FILENAME));
}

function validVersion(value) {
  return typeof value === "string" ? semver.valid(value) : null;
}

function normalizeCache(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const latestVersion = validVersion(value.latestVersion);
  const checkedAt = typeof value.checkedAt === "string" && Number.isFinite(Date.parse(value.checkedAt))
    ? new Date(value.checkedAt).toISOString()
    : null;
  const distTag = typeof value.distTag === "string" && value.distTag ? value.distTag : null;
  if (!latestVersion || !checkedAt || !distTag) return null;
  return { checkedAt, latestVersion, distTag };
}

function readCache(options = {}) {
  try {
    const file = cacheFile(options);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_RESPONSE_BYTES) return null;
    return normalizeCache(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

function writeCache(value, options = {}) {
  const normalized = normalizeCache(value);
  if (!normalized) throw new UpdateCheckError("update cache is invalid", "INVALID_UPDATE_CACHE");
  const file = cacheFile(options);
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
  return normalized;
}

function intervalHours(config = {}) {
  const value = config?.updates?.intervalHours;
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL_HOURS;
}

function cacheIsStale(cache, options = {}) {
  if (!cache) return true;
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const checkedAt = Date.parse(cache.checkedAt);
  const intervalMs = intervalHours(options.config) * 60 * 60 * 1000;
  return !Number.isFinite(now) || !Number.isFinite(checkedAt) || now - checkedAt >= intervalMs;
}

function environmentFlag(value) {
  return typeof value === "string" ? !["", "0", "false"].includes(value.toLowerCase()) : Boolean(value);
}

function passiveChecksEnabled(config = {}, env = process.env, options = {}) {
  if (config?.updates?.enabled === false) return false;
  if (environmentFlag(env.NO_UPDATE_NOTIFIER) || environmentFlag(env.CI)) return false;
  if (!options.allowTest && (env.NODE_ENV === "test" || environmentFlag(env.NODE_TEST_CONTEXT))) return false;
  return true;
}

function deriveUpdateState(options = {}) {
  const cliVersion = validVersion(options.cliVersion);
  const projectVersion = validVersion(options.projectVersion);
  const cache = normalizeCache(options.cache);
  const latestVersion = cache?.latestVersion || null;
  return {
    cliVersion,
    projectVersion,
    latestVersion,
    checkedAt: cache?.checkedAt || null,
    distTag: cache?.distTag || options.distTag || "latest",
    updateAvailable: Boolean(cliVersion && latestVersion && semver.gt(latestVersion, cliVersion)),
    projectUpdateAvailable: Boolean(cliVersion && projectVersion && semver.gt(cliVersion, projectVersion)),
  };
}

async function fetchLatest(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new UpdateCheckError("fetch is unavailable", "UPDATE_FETCH_UNAVAILABLE");
  const packageName = options.packageName || "djournal";
  const distTag = options.distTag || "latest";
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const signal = options.signal || AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      headers: {
        accept: REGISTRY_ACCEPT,
        "user-agent": `${packageName}/${options.cliVersion || "unknown"}`,
      },
      signal,
    });
  } catch (error) {
    throw new UpdateCheckError(`npm registry request failed: ${error.message}`, "UPDATE_NETWORK_FAILED");
  }
  if (!response || response.ok !== true) {
    throw new UpdateCheckError(`npm registry returned HTTP ${response?.status || "unknown"}`, "UPDATE_HTTP_FAILED");
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    throw new UpdateCheckError("npm registry response is too large", "UPDATE_RESPONSE_INVALID");
  }
  let metadata;
  try { metadata = JSON.parse(text); } catch {
    throw new UpdateCheckError("npm registry response is not valid JSON", "UPDATE_RESPONSE_INVALID");
  }
  const latestVersion = validVersion(metadata?.["dist-tags"]?.[distTag]);
  if (!latestVersion) {
    throw new UpdateCheckError(`npm registry response has no valid ${distTag} version`, "UPDATE_RESPONSE_INVALID");
  }
  return { latestVersion, distTag };
}

async function refreshCache(options = {}) {
  const latest = await fetchLatest(options);
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  if (!Number.isFinite(now.getTime())) throw new UpdateCheckError("current time is invalid", "UPDATE_TIME_INVALID");
  return writeCache({ ...latest, checkedAt: now.toISOString() }, options);
}

module.exports = {
  CACHE_FILENAME,
  DEFAULT_INTERVAL_HOURS,
  DEFAULT_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  REGISTRY_ACCEPT,
  UpdateCheckError,
  cacheFile,
  cacheIsStale,
  deriveUpdateState,
  djournalHome,
  fetchLatest,
  intervalHours,
  normalizeCache,
  passiveChecksEnabled,
  readCache,
  refreshCache,
  validVersion,
  writeCache,
};
