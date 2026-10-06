# Architecture and Data Model

djournal is a filesystem journal. Markdown is the source of truth; indexes,
RAG systems, graph views, and model context are projections over that source.

## Directory layout

The canonical journal lives in the user's djournal home, keyed by project:

```text
~/.djournal/projects/<project-key>/
  config.json
  sessions/          # local operational session bindings
  cache/recall/       # disposable private recall index
  .journal/
    state.json
    work/<work-item>/
      work.md
      journal/
      decisions/
      docs/
      _research/
```

The installed project contains a marker that points back to that store:

```text
.djournal.json
```

## Recall index

`djournal recall search` uses a serialized MiniSearch inverted index at
`<project-store>/cache/recall/snapshot.json`. It indexes work metadata, entry
metadata, headings, and body terms, while storing only the metadata needed to
return explainable ranked paths. The complete Markdown body is not a stored
result field, and every final answer still reads the selected canonical files.

The snapshot is schema-, extractor-, index-option-, and project-versioned.
`djournal recall files` uses exact-file and directory reverse postings in the
same snapshot. References are extracted from explicit entry metadata and bounded
Markdown literals during normalization, and retained even though full bodies are
omitted from stored documents. Postings are rebuilt from retained references after
incremental changes, and validated on cache load. Repository labels and evidence
provenance remain attached to matches. Linked decision context is bounded and
never constitutes an automatic compliance verdict.

The cache lifecycle is shared with text recall. Each search compares a
manifest of source paths, sizes, and modification times; changed work metadata
reindexes its entries, and additions, edits, renames, and deletions are applied
incrementally. Missing, incompatible, oversized, or malformed snapshots rebuild
from Markdown. Writes use a private directory, a short-lived lock, and atomic
rename. If persistence is unavailable, the same query runs with an ephemeral
in-memory index.

The cache is outside `.journal/`, is never shared, and may be removed at any
time. `djournal recall index --rebuild` recreates it explicitly, while
`djournal recall search "query" --no-cache` bypasses it for one invocation.
Pull and sync do not block on prewarming: the next search performs authoritative
reconciliation. This keeps publication latency predictable while preserving a
warm snapshot whenever prior recall has already built one.

When sync is enabled, a repository-local `.journal/` is a projection containing
the shared work items copied out of the global store.

```text
<projection-target>/
  .journal/
    work/<shared-work-item>/
```

## Work items

A work item is a durable unit of product or engineering work. It may span
repositories, branches, harnesses, and models.

Every work item has:

```text
~/.djournal/projects/<project-key>/.journal/work/<slug>/work.md
```

The frontmatter stores stable identity, title, status, visibility, authorship,
and timestamps. Several work items may have lifecycle `status: active` at the
same time.

`state.json` stores the global fallback selected work item for backward
compatibility. Parallel sessions can bind to a different active work item using
local operational state under `sessions/`; those bindings are not durable
journal history and are not projected into shared `.journal/` content.

## Configuration

`config.json` is a sibling of the global `.journal/` directory. It stores
project identity, sync settings, and the sharing index. Sync is disabled unless
configuration opts in:

```json
{
  "project": {
    "id": "my-product-a1b2c3d4",
    "name": "my-product",
    "sourcePath": "/workspace/my-product"
  },
  "sync": {
    "enabled": true,
    "mode": "colocated",
    "path": "/workspace/my-product",
    "auto": false
  },
  "sharing": {
    "default": "local_only",
    "sharedWorkItems": {}
  }
}
```

Use the CLI to change it:

```bash
djournal config sync.enabled true
djournal config sync.mode colocated
djournal config sync.path /workspace/my-product
```

Use `mode: "standalone"` for a dedicated journal repository. Use
`mode: "colocated"` when shared work should be projected into the product
repository and published by normal product commits.

## Entry types

| Directory | Entry types | Role |
| --- | --- | --- |
| `journal/` | `plan`, `implementation`, `status`, `manual` | Spine |
| `decisions/` | `decision` | Supporting |
| `docs/` | `doc` | Supporting |
| `_research/` | `research` | Supporting |

The spine is the chronological project timeline. Supporting entries are durable
evidence and references linked from the spine or from each other.

## Frontmatter

Entries use YAML frontmatter for stable metadata:

```yaml
---
id: ent_...
workItemId: wi_...
entryType: implementation
entryNumber: 7
title: Implement README overhaul
summary: Rewrote README.md around portable project memory.
createdBy: person@example.com
createdAt: "2026-07-07T20:03:30.906Z"
updatedAt: "2026-07-07T20:03:30.906Z"
source: manual
---
```

The Markdown body carries the human-readable meaning. Frontmatter keeps lookup,
sorting, identity, and link resolution deterministic.

## Links

Links are typed objects in frontmatter:

```yaml
links:
  - id: lnk_...
    fromEntryId: ent_...
    toEntryId: ent_...
    relation: references
    createdAt: "2026-07-08T08:00:00.000Z"
    targetPath: ../docs/example.md
```

Supported relations:

- `references`: source uses target as evidence or context
- `relates_to`: source is loosely connected to target
- `supersedes`: newer entry replaces or rolls back an older entry

## Decisions, docs, and research

Decision entries record accepted choices, rationale, consequences, and
supersession.

Doc entries synthesize durable reference material such as architecture notes,
how-tos, and product explanations.

Research entries capture codebase or web findings with sources and open
questions.

## Hooks and skills

`AGENTS.md` gives agents portable instructions. Skills perform journal-aware
work such as resume, planning, research, decision capture, documentation,
audit, reconciliation, and closure.

Hooks remind agents about the workflow, delegate configured synchronization
transport to the CLI, and validate final status markers. Hooks do not create
semantic journal entries. When `.djournal.json` exists, hooks read work context
and sync config from the global project store. If a session binding exists, the
hook reports that bound work item. If several work items are lifecycle-active and
no binding exists, the hook asks the agent to prompt the user before meaningful
work.

For Claude Code, install also injects a narrow permission grant into
`.claude/settings.json` for the exact global project store path and safe
`journal`/`djournal` commands. Codex filesystem access is governed by the Codex
runtime sandbox, so Codex sessions must be launched with the global store path
available when sandboxing would otherwise hide `~/.djournal`.

Pi uses a trusted project extension at `.pi/extensions/djournal.ts`. A thin Pi
adapter maps `session_start`, `before_agent_start`, and final `turn_end` events
into the shared checker. Because Pi has no blocking stop hook,
an invalid final marker causes at most one follow-up turn. Pi project trust is
managed by Pi, and external sandboxes must expose the global store.

Configured standalone session-start hooks invoke `djournal pull --auto` before
loading active work. Explicit journal-sync prompt intent invokes a manual pull.
Close hooks invoke `djournal sync --auto --work <slug>`, whose transport ordering
is pull and reconcile, project canonical work, then commit and push. Hooks never
implement reconciliation or write semantic entries themselves.

## Related docs

- [Djournal in practice](djournal-in-practice.md)
- [Visibility and sharing](visibility-and-sharing.md)
- [spec.md](../spec.md)
