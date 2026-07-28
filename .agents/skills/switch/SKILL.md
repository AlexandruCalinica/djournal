---
name: switch
description: Change the active filesystem journal work item without changing Git state. Use when moving journal context to another existing project or work stream.
---

# Switch active work

Switch journal context only. Work items are projects and are not Git branches.

## Procedure

1. Read `.agents/rules/STATE.md`, `FEAT.md`, `METADATA.md`, and `SAFETY.md`.
2. Run `djournal pull` from the project root so remote-only and recently updated
   work is present before selection. Continue when synchronization is disabled
   or no projection exists. Stop and report unresolved pull conflicts.
3. Resolve the journal root according to `STATE.md`; read current state when
   valid.
4. Enumerate `<journal-root>/work/*/work.md` and show slug, title, status, and
   visibility. Include legacy folders with incomplete metadata.
5. Match the argument by exact slug first, then unique title/slug substring.
   If omitted, missing, or ambiguous, request one explicit selection.
6. If already selected, report that and stop.
7. Optionally inspect Git status read-only and mention uncommitted changes, but do
   not commit, stash, switch branches, or block the journal switch.
8. Update `<journal-root>/state.json` atomically to the selected slug using the
   exact shape in `STATE.md`.
9. Re-read state and verify the target folder and `work.md` slug.
10. Present the selected work's latest spine summary and next steps using the
   `resume` retrieval procedure.

## Constraints

- Do not modify work-item status, visibility, IDs, or timestamps.
- Do not create a missing work item; use `init-work` instead.
- Never infer an ambiguous write target from recency.
