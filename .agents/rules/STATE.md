# Active Work State Rules

Agent configuration lives in `.agents/`; runtime active-work state lives at the
resolved journal root's `state.json`.

## Journal root resolution

Before reading or writing active work state, resolve the journal root:

1. If `.djournal.json` exists in the project root, parse it and use
   `<journalStore>/.journal` as the journal root.
2. Otherwise use the project-local `.journal`.

The installed project's `.djournal.json` is the authority for the canonical
global store. A repository-local `.journal/` may be only installer metadata or a
shared projection; do not treat it as canonical active state when
`.djournal.json` is present.

The state file contains exactly one field:

```json
{
  "active_work_name": "YYYY-MM-DD-NN-work-name"
}
```

## Invariants

- The file MUST be valid JSON with no trailing comma.
- `active_work_name` MUST be a non-empty string.
- Its value MUST exactly match a folder under `<journal-root>/work/`.
- That folder SHOULD contain a `work.md` whose `slug` matches the folder name.
- State selects the current work item; it does not encode lifecycle status,
  visibility, repository, branch, session, or user identity.
- Update the file atomically when switching active work.

## Missing or invalid state

- `init-work` may create `<journal-root>/state.json` after creating the work
  folder and `work.md`.
- `switch` may repair state only after the user selects an existing work item.
- Other write skills MUST stop with: `No active work found. Run init-work or switch first.`
- Read-only recall across all work items may proceed without active state.
- Never guess the active work item from recency when a write would result.
