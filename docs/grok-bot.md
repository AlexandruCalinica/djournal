# Grok Bot

Grok Bot is a supported djournal harness. It uses the same rules, skills, and
Markdown journal as Codex, Claude Code, and Pi. It does not have SessionStart
or Stop hooks, so compliance is the installed skills plus the `djournal` /
`journal` CLI. Do not add hook files for this harness.

## Hub and peers

A **Journal Hub** bot installs djournal, registers skills, and reviews shared
history. **Engineering bots** journal their own work. The hub is an
asynchronous reconciler:

- peers self-serve skills and CLI commands
- the hub runs share, sync, and conflict review when asked
- `local_only` work is not published unless someone explicitly shares it

The hub does not take over a peer's session and does not need to be in the
turn path for the peer to write an entry.

The in-repo recipe is [`integrations/grok-bot/`](../integrations/grok-bot/README.md).
It is the open-source distribution path. Public bot templates are not part of
this package and may be unavailable on some teams. Publishing a live hub is a
follow-up, done from an account that can create the bot.

## Install

```bash
djournal install --harness grok-bot
```

Aliases `grok` and `grokbot` normalize to `grok-bot`. `--all` includes it.

That install:

- copies `.agents/rules`, `.agents/skills`, and `.agents/adapters`
- writes the managed `AGENTS.md` block and `.djournal.json` project marker
- copies the recipe to `integrations/grok-bot/` and a marker README to
  `.grokbot/`

It does not write `.codex/hooks.json`, `.claude/settings.json`, or
`.pi/extensions`. Uninstalling `grok-bot` removes only the djournal-owned
`.grokbot/` and `integrations/grok-bot/` files. Shared `.agents/` content stays
until a full uninstall, same as other harnesses.

Detection uses `--harness grok-bot` or an existing `.grokbot/` directory. A
`grok` executable is not treated as evidence.

`djournal doctor` reports the CLI, `.agents/` rules and skills, the project
marker, and the recipe files. Missing hooks are not a failure. The CLI check
stays informational when `djournal` is not on `PATH`, and the detail points at
`integrations/grok-bot/skill-registration.md`.

## Register skills

Grok Bot does not read `.agents/skills` automatically. Register each
`SKILL.md` with UpdateSkill using the ids in
[`integrations/grok-bot/skill-registration.md`](../integrations/grok-bot/skill-registration.md).

Rewrite command examples to `djournal <command> --target <project-root>` and
resolve rule paths from the install target and `STATE.md`. Sibling skill links
use `[Name](sand-workflow:<id>)`. Keep upstream skills free of machine-specific
paths.

Also register **Checkup with Journal Hub** from
[`integrations/grok-bot/checkup.md`](../integrations/grok-bot/checkup.md). The
getting-started prose asks for the project root, sync mode, which peers are
engineering bots, and the hub display name, one question at a time.

## Brief peers

Use [`integrations/grok-bot/peer-briefing.md`](../integrations/grok-bot/peer-briefing.md).
Peers should install or reuse the harness, run the journal skills, and call
the hub for checkup rather than for every journal write.

## Related docs

- [Installation and repository layouts](installation.md)
- [Harness adapter contract](../.agents/adapters/contract.md)
- [Uninstalling and reinstalling](uninstalling.md)
