# Architecture and Data Model

djournal is a filesystem journal. Markdown is the source of truth; indexes,
RAG systems, graph views, and model context are projections over that source.

## Directory layout

The canonical journal lives in the user's djournal home, keyed by project:

```text
~/.djournal/projects/<project-key>/
  config.json
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
and timestamps.

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

Hooks remind agents about the workflow and validate final status markers. Hooks
do not create semantic journal entries. When `.djournal.json` exists, hooks read
active work and sync config from the global project store.

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

## Related docs

- [Djournal in practice](djournal-in-practice.md)
- [Visibility and sharing](visibility-and-sharing.md)
- [spec.md](../spec.md)
