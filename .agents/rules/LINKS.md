# Entry Link Rules

Links form a directed graph between any two journal entries. The source entry owns
the outgoing link in its frontmatter; incoming links are derived by scanning all
entries.

Read `.agents/rules/METADATA.md` before creating or modifying links.

## Link shape

Store outgoing links in the source entry's frontmatter:

```yaml
links:
  - id: lnk_0197c4d2-7b20-7abc-8d2e-0123456789ab
    fromEntryId: ent_0197c4d2-7b20-7abc-8d2e-0123456789ab
    toEntryId: ent_0197c4d3-1010-7def-8abc-0123456789ab
    relation: references
    createdAt: "2026-06-29T12:05:00.000Z"
    targetPath: ../_research/codebase-portable-journal-skill-improvements.md
```

Canonical fields:

- `id`: stable `lnk_` UUIDv7
- `fromEntryId`: MUST equal the containing entry's `id`
- `toEntryId`: MUST equal the target entry's `id`
- `relation`: `references`, `supersedes`, or `relates_to`
- `createdAt`: canonical ISO-8601 UTC timestamp

Filesystem addition:

- `targetPath`: required relative path from the source file to the target file

Do not add `referencedBy`; it is derived from other entries' outgoing links.

## Relation semantics

- `references`: source uses or cites target for context. This is the default.
- `supersedes`: source replaces or rolls back target. Direction is newer to older.
- `relates_to`: loose association or evolution when neither other relation fits.

The entry endpoints carry what they are through `entryType`; the relation says
why they are connected. Any entry type may link to any other entry type.

## Invariants

- The tuple `(fromEntryId, toEntryId, relation)` MUST be unique.
- `fromEntryId` and `toEntryId` MUST resolve to existing entries.
- `targetPath` MUST resolve to the same entry as `toEntryId`.
- Paths MUST be relative, use `/`, and include the `.md` extension.
- IDs remain authoritative across renames; paths are the human/filesystem locator.
- A path-only Markdown citation does not replace the structured link.
- Do not create a reciprocal link unless it has independent directional meaning.
- Do not create self-links.

Cross-work-item links are allowed.
Use the correct relative path and target ID.

## Spine and supporting entries

The role is derived from `entryType`:

- Spine: `plan`, `implementation`, `status`, `manual`
- Supporting: `research`, `doc`, `decision`

A supporting entry is orphaned when no entry links to it. Audit should flag an
orphan. Reconcile may add a link only when the source entry is unambiguous.

Typical relationships:

- plan `references` research
- implementation `references` a doc
- implementation `references` a decision
- decision `references` the research supporting its rationale
- newer decision `supersedes` an older decision
- entries in an evolution chain `relates_to` one another

## Link maintenance

- Creating or removing a link updates the source entry's `updatedAt`.
- Renaming a target updates every matching `targetPath`, but preserves link and
  entry IDs and `createdAt`.
- Removing an incorrect link removes only the link object. Never delete either
  entry as a side effect.
- When a path is broken but `toEntryId` resolves uniquely, reconcile may repair
  `targetPath`.
- When an ID or target is ambiguous, report it for human review.
- Duplicate entry numbers do not affect link identity and are never auto-fixed.

## Legacy references

For legacy files, body references to `_research/*.md`, `docs/*.md`,
`decisions/*.md`, or another journal entry are evidence of a potentially missing structured link. Audit
reports the discrepancy. Reconcile may create the link only after resolving one
unique target and confirming the relation from context.
