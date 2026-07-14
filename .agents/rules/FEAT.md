# Work Item Rules

Agent configuration lives under `.agents/`. Durable journal data lives under the
resolved journal root from `STATE.md`. Skills MUST read rules from
`.agents/rules/` and MUST NOT write runtime work data into `.agents/`.

Read these rules together with:

- `.agents/rules/METADATA.md`
- `.agents/rules/LINKS.md`
- `.agents/rules/SAFETY.md`
- `.agents/rules/STATE.md`

## Work item layout

When creating a work item, create this structure under the resolved journal root:

```text
<journal-root>/work/YYYY-MM-DD-NN-work-name/
├── work.md
├── journal/
├── _research/
├── docs/
└── decisions/
```

- `work.md`: canonical work-item metadata and a short human-readable overview
- `journal/`: chronological spine entries
- `_research/`: supporting codebase and web research
- `docs/`: supporting synthesized references
- `decisions/`: supporting standalone decisions

## Naming

- Folder format: `YYYY-MM-DD-NN-work-name`.
- Date is the UTC creation date.
- `NN` is the next two-digit sequence for work items created that day.
- `work-name` is lowercase kebab-case, descriptive, and unique.
- Avoid spaces and special characters other than hyphens.
- The folder name MUST equal `slug` in `work.md`.

Example: `2026-06-29-01-portable-journal-skill-improvements`.

## Initialization

`init-work` MUST:

1. Inspect existing work folders to select a non-conflicting daily sequence.
2. Create the complete directory structure above.
3. Resolve identity according to `METADATA.md`.
4. Generate one stable `wi_` UUIDv7.
5. Create `work.md` with all required work-item metadata.
6. Default to `status: active` and `visibility: local_only`.
7. Set `createdAt` and `updatedAt` to the same current UTC timestamp.
8. Set `<journal-root>/state.json` to the new slug according to `STATE.md`.

Work items are projects, not repositories. A project MAY span many repositories,
branches, and working directories. Do not create a new work item merely because
the repository changed.

## Lifecycle

Allowed status values:

- `draft`: created but not yet meaningful active work
- `active`: current ongoing work
- `paused`: intentionally inactive but expected to resume
- `completed`: intended outcome achieved
- `archived`: retained history with no expected continuation

Status updates preserve `createdAt`, update `updatedAt`, and never alter `id` or
`slug`. Visibility changes require an explicit user request.

Only one work item is selected as active in `<journal-root>/state.json`, but
other work items may remain in `active` status. Active selection and lifecycle
status are different concepts.

## Legacy work items

A historical folder without `work.md` remains readable. Resume and recall may
infer its slug and title from the folder name. Audit flags the missing file;
reconcile may create it using deterministic legacy timestamps and
`source`/identity rules without modifying existing entry bodies.
