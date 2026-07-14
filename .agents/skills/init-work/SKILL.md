---
name: init-work
description: Initialize a new filesystem journal work item and make it active. Use when starting a new project or durable unit of work that does not already exist.
---

# Initialize work

Create one project-level work item. Work items may span repositories.

## Procedure

1. Read these files completely:
   - `.agents/rules/FEAT.md`
   - `.agents/rules/METADATA.md`
   - `.agents/rules/SAFETY.md`
   - `.agents/rules/STATE.md`
2. Require a non-empty work name or infer one only when the user's requested
   project is unambiguous.
3. Resolve the journal root according to `STATE.md`. List `<journal-root>/work/`
   when it exists. Reject an equivalent existing work item instead of creating a
   duplicate.
4. Build the folder slug as `YYYY-MM-DD-NN-kebab-case-name` using the current UTC
   date and next unused daily sequence.
5. Resolve `createdBy`, generate a `wi_` UUIDv7, and capture one canonical UTC
   timestamp according to `METADATA.md`.
6. Create:

   ```text
   <journal-root>/work/<slug>/
   ├── work.md
   ├── journal/
   ├── _research/
   ├── docs/
   └── decisions/
   ```

7. Write `work.md` with the exact work-item frontmatter contract. Use:
   - `status: active`
   - `visibility: local_only`
   - identical `createdAt` and `updatedAt`
   - a concise title and description
8. Add a short body:

   ```markdown
   # <Title>

   ## Objective

   <What outcome this work item exists to achieve.>
   ```

9. Create or update `<journal-root>/state.json` to select the new slug. Preserve
   the exact state shape from `STATE.md` and make the update safely.
10. Re-read `work.md` and state. Verify slug, IDs, directories, timestamps,
    status, visibility, and JSON validity.

## Constraints

- Do not use repository name as project identity.
- Do not create an initial journal entry; planning or implementation creates it.
- Do not change another work item's status or visibility.
- Do not overwrite an existing work folder.
- Report the work-item path and ID when complete.
