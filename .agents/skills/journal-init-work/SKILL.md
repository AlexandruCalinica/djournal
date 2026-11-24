---
name: journal-init-work
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
2. Run `djournal pull` from the project root before inspecting existing work.
   Continue when synchronization is disabled or no projection exists. Stop and
   report any unresolved pull conflict before creating a work item.
3. Require a non-empty work name or infer one only when the user's requested
   project is unambiguous.
4. Resolve the journal root according to `STATE.md`. List `<journal-root>/work/`
   when it exists. Reject an equivalent existing work item instead of creating a
   duplicate. If this directory is a sync checkout, stop and use the project
   root from the projection marker.
5. Create the work item in the canonical store:

   ```bash
   djournal work new --title "<title>" --name <kebab-case-name> --description "<objective>"
   ```

   The command creates `<journal-root>/work/<slug>/` with `work.md` and the
   `journal/`, `_research/`, `docs/`, and `decisions/` directories. It uses the
   next free `YYYY-MM-DD-NN` slug, a `wi_` UUIDv7, `status: active`, and
   `visibility: local_only`. When a session id is available (see `STATE.md`),
   it binds that session and does not change the shared `state.json`. Without
   a session id it updates the shared fallback and warns. On a machine with
   several agents, set `DJOURNAL_SESSION_ID` first so the new item is not
   selected for every agent.
6. Re-read `work.md` and the selection. Verify slug, IDs, directories,
   timestamps, status, visibility, and that the file is under the store from
   `djournal status --json`, not under a sync checkout.

## Constraints

- Do not use repository name as project identity.
- Do not create an initial journal entry; planning or implementation creates it.
- Do not change another work item's status or visibility.
- Do not overwrite an existing work folder.
- Report the work-item path and ID when complete.
