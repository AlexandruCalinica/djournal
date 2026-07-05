---
name: switch
description: Change the active filesystem journal work item without changing Git state. Use when moving journal context to another existing project or work stream.
---

# Switch active work

Switch journal context only. Work items are projects and are not Git branches.

## Procedure

1. Read `.agents/rules/STATE.md`, `FEAT.md`, `METADATA.md`, and `SAFETY.md`.
2. Read current state when valid.
3. Enumerate `.journal/work/*/work.md` and show slug, title, status, and visibility.
   Include legacy folders with incomplete metadata.
4. Match the argument by exact slug first, then unique title/slug substring.
   If omitted, missing, or ambiguous, request one explicit selection.
5. If already selected, report that and stop.
6. Optionally inspect Git status read-only and mention uncommitted changes, but do
   not commit, stash, switch branches, or block the journal switch.
7. Update `.journal/state.json` atomically to the selected slug using the exact
   shape in `STATE.md`.
8. Re-read state and verify the target folder and `work.md` slug.
9. Present the selected work's latest spine summary and next steps using the
   `resume` retrieval procedure.

## Constraints

- Do not modify work-item status, visibility, IDs, or timestamps.
- Do not create a missing work item; use `init-work` instead.
- Never infer an ambiguous write target from recency.
