# Checkup with Journal Hub

Use this as the body of the shared **Checkup with Journal Hub** workflow. The hub reconciles asynchronously. Engineering bots keep using the CLI and their own journal skills.

`<project-root>` is the path confirmed during setup. `<hub-name>` is the hub display name.

## Check

1. Read `<project-root>/.djournal.json` and resolve the journal root the way `<project-root>/.agents/rules/STATE.md` describes.
2. Run:

   ```bash
   journal status --target <project-root>
   journal doctor --target <project-root>
   ```

3. When sync is enabled, inspect the latest sync or pull result for conflicts. Quote the conflict paths. Do not resolve a conflict by deleting either side.
4. List work items and their visibility with `journal work list --target <project-root>`. Treat `local_only` as private.

## Do not publish private work

- Do not run `journal share` or `journal sync` for `local_only` work.
- Do not flip visibility.
- Share or sync only a work item the user has already marked shared, and only when they ask the hub to publish it.

## Report

Tell the requester:

- whether the CLI, `.agents/`, and project marker look healthy
- that missing hooks are expected for Grok Bot
- any conflict paths and which work items are shared
- what the engineering bot can do itself: resume, plan, recall, and journal through the registered skills, always passing `--target <project-root>`

The hub does not write semantic journal entries during a checkup unless the user asks for a normal journal task. Hook-style reminders are not available; the skills are the compliance path.
