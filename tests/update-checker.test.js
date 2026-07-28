"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  REGISTRY_ACCEPT,
  UpdateCheckError,
  cacheIsStale,
  deriveUpdateState,
  fetchLatest,
  passiveChecksEnabled,
  readCache,
  refreshCache,
  writeCache,
} = require("../lib/update-checker.js");

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "djournal-update-"));
}

function response(value, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    text: async () => typeof value === "string" ? value : JSON.stringify(value),
  };
}

test("cache writes atomically and malformed cache is ignored", () => {
  const djournalHome = home();
  const expected = {
    checkedAt: "2026-07-28T12:00:00.000Z",
    latestVersion: "1.2.3",
    distTag: "latest",
  };
  assert.deepEqual(writeCache(expected, { djournalHome }), expected);
  assert.deepEqual(readCache({ djournalHome }), expected);

  fs.writeFileSync(path.join(djournalHome, "update-check.json"), "{broken");
  assert.equal(readCache({ djournalHome }), null);
});

test("cache staleness uses the configured interval", () => {
  const cache = { checkedAt: "2026-07-28T12:00:00.000Z", latestVersion: "1.0.0", distTag: "latest" };
  assert.equal(cacheIsStale(cache, { now: Date.parse("2026-07-29T11:59:59.999Z") }), false);
  assert.equal(cacheIsStale(cache, { now: Date.parse("2026-07-29T12:00:00.000Z") }), true);
  assert.equal(cacheIsStale(cache, { now: Date.parse("2026-07-28T13:00:00.000Z"), config: { updates: { intervalHours: 2 } } }), false);
  assert.equal(cacheIsStale(null), true);
});

test("semver state handles releases, prereleases, assets, and upgraded suppression", () => {
  const cache = { checkedAt: "2026-07-28T12:00:00.000Z", latestVersion: "2.0.0", distTag: "latest" };
  assert.deepEqual(
    deriveUpdateState({ cliVersion: "1.9.0", projectVersion: "1.8.0", cache }),
    {
      cliVersion: "1.9.0",
      projectVersion: "1.8.0",
      latestVersion: "2.0.0",
      checkedAt: cache.checkedAt,
      distTag: "latest",
      updateAvailable: true,
      projectUpdateAvailable: true,
    },
  );
  assert.equal(deriveUpdateState({ cliVersion: "2.0.0", projectVersion: "2.0.0", cache }).updateAvailable, false);
  assert.equal(deriveUpdateState({ cliVersion: "2.1.0", projectVersion: "2.0.0", cache }).updateAvailable, false);
  assert.equal(deriveUpdateState({ cliVersion: "2.0.0-beta.1", projectVersion: "1.0.0", cache }).updateAvailable, true);
  assert.equal(deriveUpdateState({ cliVersion: "invalid", projectVersion: "1.0.0", cache }).updateAvailable, false);
});

test("registry fetch requests abbreviated metadata and refreshes cache", async () => {
  const djournalHome = home();
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return response({ "dist-tags": { latest: "3.2.1" } });
  };
  const cache = await refreshCache({
    djournalHome,
    cliVersion: "3.0.0",
    fetchImpl,
    now: Date.parse("2026-07-28T12:00:00.000Z"),
  });
  assert.equal(request.url, "https://registry.npmjs.org/djournal");
  assert.equal(request.options.headers.accept, REGISTRY_ACCEPT);
  assert.deepEqual(cache, {
    checkedAt: "2026-07-28T12:00:00.000Z",
    latestVersion: "3.2.1",
    distTag: "latest",
  });
  assert.deepEqual(readCache({ djournalHome }), cache);
});

test("registry failures and invalid responses are explicit and preserve prior cache", async () => {
  const djournalHome = home();
  const prior = writeCache({
    checkedAt: "2026-07-27T12:00:00.000Z",
    latestVersion: "1.0.0",
    distTag: "latest",
  }, { djournalHome });
  await assert.rejects(
    fetchLatest({ fetchImpl: async () => response("", { ok: false, status: 503 }) }),
    (error) => error instanceof UpdateCheckError && error.code === "UPDATE_HTTP_FAILED",
  );
  await assert.rejects(
    refreshCache({ djournalHome, fetchImpl: async () => response({ "dist-tags": { latest: "nope" } }) }),
    (error) => error instanceof UpdateCheckError && error.code === "UPDATE_RESPONSE_INVALID",
  );
  assert.deepEqual(readCache({ djournalHome }), prior);
});

test("passive policy honors config, environment, CI, and test controls", () => {
  assert.equal(passiveChecksEnabled({}, {}), true);
  assert.equal(passiveChecksEnabled({ updates: { enabled: false } }, {}), false);
  assert.equal(passiveChecksEnabled({}, { NO_UPDATE_NOTIFIER: "1" }), false);
  assert.equal(passiveChecksEnabled({}, { CI: "true" }), false);
  assert.equal(passiveChecksEnabled({}, { NODE_ENV: "test" }), false);
  assert.equal(passiveChecksEnabled({}, { NODE_ENV: "test" }, { allowTest: true }), true);
});
