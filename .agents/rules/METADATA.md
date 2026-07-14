# Metadata Rules

These rules define the journal domain model in YAML frontmatter. Markdown files
remain the source of truth; there is no database, server, event store, or sync
process.

## Canonical names

Use the canonical field names and enum values exactly. Do not introduce aliases such
as `type`, `work_item`, `created_at`, `privacy`, or `role`.

### Work item

Every work item MUST have `<journal-root>/work/<slug>/work.md` with this
frontmatter:

```yaml
---
id: wi_0197c4d2-7b20-7abc-8d2e-0123456789ab
slug: 2026-06-29-01-portable-journal-skill-improvements
title: Portable journal skill improvements
description: Improve the filesystem journal through rules and skills only.
status: active
visibility: local_only
createdBy: user@example.com
createdAt: "2026-06-29T12:00:00.000Z"
updatedAt: "2026-06-29T12:00:00.000Z"
---
```

Required fields:

- `id`: prefixed UUIDv7 using `wi_`
- `slug`: exact work-folder name
- `title`: concise human-readable name
- `status`: `draft`, `active`, `paused`, `completed`, or `archived`
- `visibility`: `local_only`, `private_synced`, or `team_shared`
- `createdBy`: identity resolved as described below
- `createdAt` and `updatedAt`: ISO-8601 UTC strings

Optional fields:

- `description`: target outcome or scope
- `metadata`: mapping for incidental structured facts

The default status for newly initialized meaningful work is `active`. The
default visibility is `local_only`. This filesystem-only implementation does
not sync or share content; the other visibility values exist for compatibility.

Work items are projects and MAY span repositories. Repository, branch, and cwd
are not work-item identity or partition fields. If useful, they may be recorded
as incidental values under `metadata` or in an entry body.

### Entry

Every newly generated Markdown entry MUST begin with this shape:

```yaml
---
id: ent_0197c4d2-7b20-7abc-8d2e-0123456789ab
workItemId: wi_0197c4d2-7b20-7abc-8d2e-0123456789ab
entryType: implementation
entryNumber: 2
title: Implement metadata contracts
summary: Added canonical filesystem rules for metadata, links, and safety.
createdBy: user@example.com
createdAt: "2026-06-29T12:00:00.000Z"
updatedAt: "2026-06-29T12:00:00.000Z"
source: manual
---
```

Required for all new entries:

- `id`: prefixed UUIDv7 using `ent_`
- `workItemId`: exact `id` from the containing work item's `work.md`
- `entryType`: one of `plan`, `implementation`, `research`, `decision`,
  `status`, `manual`, or `doc`
- `title`
- `summary`: useful one- or two-sentence synopsis
- `createdBy`
- `createdAt` and `updatedAt`
- `source`: `generated_from_session`, `imported_markdown`, or `manual`

Optional fields:

- `entryNumber`: best-effort integer; it may be absent or non-monotonic
- `metadata`: mapping for additional structured facts

Fields represented by the filesystem and therefore omitted:

- `bodyMarkdown`: the Markdown following the closing frontmatter delimiter
- `sourcePath`: the file's path
- `sessionId`: omitted because this port has no formal session records

Skill-created files use `source: manual`. `generated_from_session` is reserved
for a future implementation with formal session records. Historical files
enriched by migration or reconcile use `source: imported_markdown`.

Do not store `role`, entry `status`, or entry `visibility`. Role is derived from
`entryType`; status and visibility belong to the work item.

### Derived role

- Supporting: `research`, `doc`, `decision`
- Spine: `plan`, `implementation`, `status`, `manual`

Supporting entries do not appear as independent steps in the chronological
project timeline. They are reached through links and targeted retrieval.

## Identity

Resolve `createdBy` in this order:

1. non-empty `JOURNAL_USER_ID`
2. non-empty `git config user.email`
3. `<os-user>@local`
4. `unknown@local`

Do not invent an email address for another person.

## Timestamps

- New timestamps use `new Date().toISOString()` semantics: UTC ISO-8601 with
  millisecond precision and a `Z` suffix.
- At creation, `createdAt` and `updatedAt` are identical.
- On a substantive edit, preserve `createdAt` and replace `updatedAt`.
- Quote timestamps in YAML so parsers retain them as strings.
- A metadata-only reconcile fix is a substantive edit and updates `updatedAt`.

For legacy files, follow the journal's deterministic import ordering:

1. Parse a leading `YYYY-MM-DD` from the filename when present.
2. Start at `YYYY-MM-DDT00:00:00.000Z`.
3. Add an ordering offset in seconds:
   - journal: `0 + min(sequence, 999)`
   - research: `1000 + min(sequence, 999)`
   - docs and decisions: `2000 + min(sequence, 999)`
4. If the date is invalid or absent, use the current UTC timestamp.
5. Set both `createdAt` and `updatedAt` to the derived value.

Do not claim that a derived legacy timestamp is the original creation time; it
is a deterministic ordering value.

## UUIDv7 identifiers

Use the journal ID prefixes:

- work item: `wi_`
- entry: `ent_`
- link: `lnk_`

The UUID portion MUST be RFC 9562 UUIDv7: version nibble `7`, RFC variant bits
`10`, and a 48-bit Unix millisecond timestamp. Generate a new ID once and keep
it stable across file renames and edits.

If a UUIDv7 utility is unavailable, this dependency-free Node command generates
one. Pass `wi`, `ent`, or `lnk` as the first argument:

```bash
node -e 'const c=require("node:crypto");const p=process.argv[1];const b=c.randomBytes(16);let t=BigInt(Date.now());for(let i=5;i>=0;i--){b[i]=Number(t&255n);t>>=8n}b[6]=(b[6]&15)|112;b[8]=(b[8]&63)|128;const h=b.toString("hex");console.log(`${p}_${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`)' ent
```

Never regenerate an existing ID to match a filename or ordering change.

## YAML conventions

- Frontmatter is the first content in the file and is bounded by `---` lines.
- Use UTF-8 and spaces, never tabs.
- Quote timestamps and strings containing `:`, `#`, `{`, `}`, `[`, or `]`.
- Omit optional fields rather than writing empty strings, nulls, or empty maps.
- Unknown structured values belong under `metadata`; do not add top-level fields
  that collide with the journal model.

## Legacy compatibility

Existing Markdown without frontmatter remains readable and MUST NOT be rejected
by resume or recall. Treat its type, title, date, and entry number as best-effort
values inferred from directory, filename, and first heading. Audit flags missing
metadata; reconcile may add it conservatively without rewriting the body.
