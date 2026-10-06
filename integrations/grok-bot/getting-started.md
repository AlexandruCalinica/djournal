---
name: journal-hub-getting-started
description: Set up djournal for Grok Bot by confirming the project root, sync mode, peer engineering bots, and hub display name, then installing the skill-only harness.
---

# Journal Hub getting started

Run this once when a Journal Hub bot is imported. Ask the questions below one
at a time. Wait for the answer before asking the next question. Use the
answers only for this setup. Do not invent project paths, bot names, or a
display name.

## Questions

1. **Project root.** Which directory should receive the journal install? It
   must be the directory that will contain `.djournal.json` and `.agents/`.
   Call that path `<project-root>` in later commands.
2. **Sync mode.** Should shared journal history live in that same repository
   (`colocated`) or in a separate journal repository (`standalone`)? Leave sync
   disabled until the operator asks to turn it on.
3. **Engineering bots.** Which peer bots should write journal entries
   themselves? Record display names only. Agent ids are not required.
4. **Hub display name.** What should people call this Journal Hub?

## After the answers

1. Install the CLI if it is not already available:

   ```bash
   npm install -g djournal
   ```

   Use `npx djournal` when a global install is not appropriate.

2. Install the skill-only harness. This copies rules, skills, `AGENTS.md`, the
   project marker, and this recipe. It does not write hook config.

   ```bash
   djournal install --harness grok-bot --target <project-root>
   ```

3. Register journal skills from `<project-root>/.agents/skills` using
   `skill-registration.md`. Resolve every rule path from `<project-root>`.
4. Register `checkup.md` as the shared workflow **Checkup with Journal Hub**
   (`journal-hub-checkup`).
5. Send `peer-briefing.md` to each engineering bot from step 3, with
   `<project-root>` and the hub display name filled in.

Do not publish a public bot template as part of this setup. Do not share or
sync work unless the operator explicitly asks.
