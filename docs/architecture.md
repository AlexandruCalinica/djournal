# Architecture and Data Model

djournal is a filesystem journal. Markdown is the source of truth; indexes,
RAG systems, graph views, and model context are projections over that source.

## Directory layout

```text
.journal/
  config.json
  state.json
  work/<work-item>/
    work.md
    journal/
    decisions/
    docs/
    _research/
```

## Work items

A work item is a durable unit of product or engineering work. It may span
repositories, branches, harnesses, and models.

Every work item has:

```text
.journal/work/<slug>/work.md
```

The frontmatter stores stable identity, title, status, visibility, authorship,
and timestamps.

## Configuration

`.journal/config.json` stores repository-level journal behavior. Sync is
disabled unless configuration opts in:

```json
{
  "sync": {
    "enabled": true,
    "mode": "standalone",
    "auto": true
  }
}
```

Use `mode: "standalone"` for a dedicated journal repository. Use
`mode: "colocated"` or omit sync configuration when `.journal/` is committed
with a product repository and normal Git commits carry journal history.

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
do not create semantic journal entries.

## Related docs

- [Djournal in practice](djournal-in-practice.md)
- [Visibility and sharing](visibility-and-sharing.md)
- [spec.md](../spec.md)
