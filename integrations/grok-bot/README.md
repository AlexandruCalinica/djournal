# Journal Hub recipe for Grok Bot

This directory is the open-source recipe for a Grok Bot that installs djournal and helps peer engineering bots use it. It is documentation and skill prose. It does not publish a Team Bot or a public template.

Some teams cannot create a bot from a public template. Copy this recipe into the bot you already have: register the skills, then follow [getting-started.md](getting-started.md).

The architecture write-up is `docs/grok-bot.md` in the djournal package: [Grok Bot](https://github.com/AlexandruCalinica/djournal/blob/main/docs/grok-bot.md). `djournal install --harness grok-bot` copies this directory into the target project and tags those files as Grok-owned. The package doc is not copied, so this link stays valid after install.

## Role

The Journal Hub is an async reconciler.

- Engineering bots install nothing for each other. They use the `journal` / `djournal` CLI and the journal skills in the project.
- The hub installs the CLI and the `grok-bot` harness, registers skills, and briefs peers.
- The hub reviews share state, sync results, and conflicts when asked.
- The hub does not publish `local_only` work and does not take over another bot's session.

## Setup sequence

1. Install the CLI (`npm install -g djournal`, or use `npx djournal`).
2. From the confirmed project root, run `djournal install --harness grok-bot`.
3. Register each upstream skill and the two hub skills in [skill-registration.md](skill-registration.md) with UpdateSkill.
4. Register [checkup.md](checkup.md) as **Checkup with Journal Hub**.
5. Send [peer-briefing.md](peer-briefing.md) to the engineering bots named during setup.

Grok Bot has no SessionStart or Stop hooks. Do not add `.codex/hooks.json`, `.claude/settings.json`, or `.pi/extensions` for this harness. Compliance is the registered skills plus Shell calls to the CLI.

## Files

| File | Use |
| --- | --- |
| [getting-started.md](getting-started.md) | First-run interview. One question at a time. |
| [skill-registration.md](skill-registration.md) | Map installed `.agents/skills/*/SKILL.md` files to Grok workflows. |
| [checkup.md](checkup.md) | Checkup with Journal Hub skill body. |
| [peer-briefing.md](peer-briefing.md) | Short message for peer engineering bots. |
