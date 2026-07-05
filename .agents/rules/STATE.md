# Active Work State Rules

Agent configuration lives in `.agents/`; runtime active-work state lives at
`.journal/state.json`.

The state file contains exactly one field:

```json
{
  "active_work_name": "YYYY-MM-DD-NN-work-name"
}
```

## Invariants

- The file MUST be valid JSON with no trailing comma.
- `active_work_name` MUST be a non-empty string.
- Its value MUST exactly match a folder under `.journal/work/`.
- That folder SHOULD contain a `work.md` whose `slug` matches the folder name.
- State selects the current work item; it does not encode lifecycle status,
  visibility, repository, branch, session, or user identity.
- Update the file atomically when switching active work.

## Missing or invalid state

- `init-work` may create `.journal/state.json` after creating the work folder and
  `work.md`.
- `switch` may repair state only after the user selects an existing work item.
- Other write skills MUST stop with: `No active work found. Run init-work or switch first.`
- Read-only recall across all work items may proceed without active state.
- Never guess the active work item from recency when a write would result.
