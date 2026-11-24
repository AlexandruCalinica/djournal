# Active Work State Rules

Agent configuration lives in `.agents/`; runtime active-work state lives at the
resolved journal root's `state.json`.

## Journal root resolution

Before reading or writing active work state, resolve the journal root. Walk
from the current directory up to the git root, or the filesystem root when
there is no git root.

1. If `.djournal.json` exists in one of those directories, that directory is
   the project root. Parse the marker and use `<journalStore>/.journal` as the
   journal root.
2. If `.journal/.djournal-projection.json` exists on that walk, this tree is a
   sync checkout, not the canonical store. Read `journalStore` and
   `projectRoot` from the marker. Do not read or write the checkout's
   `.journal`. Run journal commands with `--target` set to `projectRoot`.
3. Otherwise use the project-local `.journal` only for a directory that is
   itself the project. If `djournal status` reports that this directory is not
   installed and it already contains `.journal/work`, stop. That tree may be a
   sync checkout whose marker has not been written yet. Do not create entries
   there.

The installed project's `.djournal.json` is the authority for the canonical
global store. A repository-local `.journal/` may be only installer metadata or a
shared projection; do not treat it as canonical active state when
`.djournal.json` or `.journal/.djournal-projection.json` is present.

`djournal status --json` prints `journalRoot`. Create work items and entries
with `djournal work new` and `djournal entry new` so the files land in that
store. Do not hand-write a journal file into a sync checkout.

## Session binding

`state.json` is the global fallback selection. It is shared by every agent
that uses this user account. A session binds its own work item with
`djournal work bind <slug>`. The CLI resolves the session id from `--session`,
then the first non-empty value among `DJOURNAL_SESSION_ID`,
`AGENT_SESSION_ID`, and `CURSOR_CONVERSATION_ID`.

On a machine shared by several agents, set `DJOURNAL_SESSION_ID` to a stable
id for this agent before binding. Do not change `state.json` to switch one
agent's work. When no session id is available, pass `--work <slug>` on
commands that need a work item and leave the shared fallback unchanged.

The state file contains exactly one field:

```json
{
  "active_work_name": "YYYY-MM-DD-NN-work-name"
}
```

This file is the global fallback selection. A session may also bind to a work
item through local operational session state created by `djournal work bind`.
Session binding does not change this file and is not durable journal history.

## Invariants

- The file MUST be valid JSON with no trailing comma.
- `active_work_name` MUST be a non-empty string.
- Its value MUST exactly match a folder under `<journal-root>/work/`.
- That folder SHOULD contain a `work.md` whose `slug` matches the folder name.
- State selects the fallback current work item; it does not encode lifecycle
  status, visibility, repository, branch, session, or user identity.
- Update the file atomically when switching active work.
- When multiple work items have `status: active` and no valid session binding is
  available, do not guess from this fallback. Prompt the user to choose the work
  item for the session before meaningful writes.

## Missing or invalid state

- `journal-init-work` may create `<journal-root>/state.json` after creating the work
  folder and `work.md`.
- `journal-switch` may repair state only after the user selects an existing work item.
- Other write skills MUST stop with: `No active work found. Run journal-init-work or journal-switch first.`
- Read-only recall across all work items may proceed without active state.
- Never guess the active work item from recency when a write would result.
