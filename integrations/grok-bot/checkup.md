---
name: Checkup with Journal Hub
description: Review djournal status, shared work, and sync conflicts for a project without taking over engineering bots or publishing local-only work.
---

# Checkup with Journal Hub

Use this when someone asks the hub to review journal health. Engineering bots
keep writing their own entries. This checkup is an asynchronous reconcile
pass.

## Steps

1. If `<project-root>` is not already known, ask for the directory that
   contains `.djournal.json`. Ask only that question, then continue.
2. Read status and install health:

   ```bash
   djournal status --target <project-root>
   djournal doctor --target <project-root>
   djournal work list --target <project-root>
   ```

3. Report which work items are `local_only` and which are shared. Do not run
   `djournal share` unless the operator explicitly chooses a work item to
   publish.
4. When sync is enabled, pull the shared projection and report conflicts:

   ```bash
   djournal pull --target <project-root>
   ```

   If the command reports conflicts, quote the conflict paths and stop. Do not
   overwrite either side.
5. Run `djournal sync --target <project-root>` only for a work item the
   operator has already shared and only when they ask to project it.
6. Summarize what peers should do next. Point them at the journal skills and
   `djournal` / `journal` commands. Do not ask them to wait for another hub
   turn before they journal.

Hooks are not part of this harness. A missing hook file is healthy.
