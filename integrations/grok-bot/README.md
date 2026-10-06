# Journal Hub recipe for Grok Bot

This directory is the shareable setup recipe for a Journal Hub bot. It is not
a published Team Bot or public template. Some teams cannot publish public bot
templates; this recipe is the open-source way to recreate the hub.

Install djournal into a project, register the portable journal skills, and
brief peer engineering bots. The hub does not replace those bots.

## Roles

**Journal Hub** installs and explains the journal, registers skills, and
reconciles shared history. Reconciliation is asynchronous: review `share`,
`sync`, and conflicts when asked. Do not block peer bots on that review.

**Engineering bots** write and resume their own journal entries. They use the
installed skills and the `djournal` / `journal` CLI against the project root.
They do not wait for the hub to take a turn before they can journal.

Local-only work stays unpublished until a person explicitly shares it. The hub
does not force publication.

## What the hub sets up

1. Confirm the project root, sync mode, peer engineering bots, and hub display
   name by running [getting-started.md](getting-started.md). Ask one question
   at a time.
2. Install the CLI (`npm install -g djournal`, or `npx djournal` for a one-off).
3. Run `djournal install --harness grok-bot --target <project-root>`.
4. Register each installed `.agents/skills/*/SKILL.md` as a Grok shared
   workflow. Follow [skill-registration.md](skill-registration.md). Rewrite
   paths from the install target. Do not hardcode a machine path, owner, or
   agent id.
5. Register [checkup.md](checkup.md) as **Checkup with Journal Hub**.
6. Send [peer-briefing.md](peer-briefing.md) to the engineering bots named
   during setup.

Grok Bot cannot emit SessionStart or Stop hooks. Do not invent hook files.
`AGENTS.md`, the skills, and the CLI are the harness.

## Files

| File | Use |
| --- | --- |
| `getting-started.md` | First-run questions and install steps |
| `skill-registration.md` | Map package skills to Grok workflow ids |
| `checkup.md` | Later share/sync/conflict review |
| `peer-briefing.md` | Short message for engineering bots |

Package docs: `docs/grok-bot.md`.
