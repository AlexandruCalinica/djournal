"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { searchRecall } = require("../lib/recall/index.js");

const documentCount = Math.max(1, Number.parseInt(process.env.DJOURNAL_BENCH_DOCUMENTS || "1000", 10));
const base = fs.mkdtempSync(path.join(os.tmpdir(), "djournal-recall-bench-"));
const root = path.join(base, "store");
const journalRoot = path.join(root, ".journal");
const workRoot = path.join(journalRoot, "work", "benchmark");
fs.mkdirSync(path.join(workRoot, "journal"), { recursive: true });
fs.writeFileSync(path.join(workRoot, "work.md"), `---
id: wi_benchmark
slug: benchmark
title: Recall benchmark
description: Synthetic retrieval corpus
status: active
visibility: local_only
---
# Recall benchmark
`);

for (let index = 0; index < documentCount; index += 1) {
  const needle = index === documentCount - 1 ? " targetneedle" : "";
  fs.writeFileSync(path.join(workRoot, "journal", `${String(index).padStart(6, "0")}.md`), `---
id: ent_benchmark_${index}
workItemId: wi_benchmark
entryType: implementation
title: Benchmark entry ${index}
summary: Synthetic journal entry ${index}${needle}
---
# Benchmark entry ${index}

Repeated product history, implementation context, decisions, and retrieval terms.${needle}
`);
}

const context = { target: base, root, journalRoot, projectKey: "benchmark", global: true };
const coldStarted = performance.now();
const cold = searchRecall("targetneedle", { context });
const coldMs = performance.now() - coldStarted;
const warmStarted = performance.now();
const warm = searchRecall("targetneedle", { context });
const warmMs = performance.now() - warmStarted;

process.stdout.write(`${JSON.stringify({
  documents: documentCount + 1,
  coldMs,
  warmMs,
  speedup: coldMs / Math.max(warmMs, 0.001),
  coldStatus: cold.cache.status,
  warmStatus: warm.cache.status,
  match: warm.entries[0]?.id,
}, null, 2)}\n`);
