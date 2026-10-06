# Grok Bot

Grok Bot uses the same journal workflow as Codex, Claude Code, and Pi. It has no SessionStart or Stop hooks, so compliance is registered skills plus the `journal` CLI. The installer does not invent hook files for this harness.

The shareable bot recipe lives in [integrations/grok-bot/](../integrations/grok-bot/README.md). Some teams cannot publish a public bot template. That recipe is the open-source distribution path. It does not create a live Team Bot.

## Hub and peers

Use one Journal Hub bot and any number of engineering bots.

| Role | Responsibility |
| --- | --- |
| Journal Hub | Install the CLI, run `djournal install --harness grok-bot`, register skills, brief peers, and review share, sync, and conflicts when asked |
| Engineering bot | Resume, plan, research, decide, and journal its own work through skills and `journal --target <project-root>` |

The hub is an async reconciler. It does not own peer sessions. Engineering bots self-serve the CLI and skills. The hub does not publish `local_only` work and does not change visibility unless the user asks.

## Install

```bash
djournal install --harness grok-bot
```

Aliases `grok` and `grokbot` normalize to `grok-bot`. `--all` includes this harness.

The install writes the shared baseline:

- `.agents/rules`, `.agents/skills`, and `.agents/adapters`
- a managed block in `AGENTS.md`
- `.djournal.json` and the global project store

It also copies the recipe to `integrations/grok-bot/` and tags those files as Grok-owned. Uninstalling the harness removes those recipe files and leaves other harnesses and the shared baseline in place.

It does not write:

- `.codex/hooks.json`
- `.claude/settings.json`
- `.pi/extensions/djournal.ts`

Detection does not treat a `grok` executable as evidence. A `.grokbot/` directory in the target is optional evidence. Pass `--harness grok-bot` when you want the harness.

## No hooks

Grok omits every adapter event it cannot support: session start, prompt submit, mutation reminders, compact, and stop. That matches the adapter contract. An omitted event is not a failed hook.

Agents read `AGENTS.md` and the registered skills, run `journal` from the shell, and emit the journal status marker themselves. Hooks never write semantic journal entries; this harness has no hook process that could.

`djournal doctor` still checks Node, `.agents/`, and the project marker. A missing hook file does not fail the Grok check. The check points here for skill registration. The CLI may be absent from `PATH` when you use `npx` or `node bin/journal.js`; that is reported and does not by itself fail the check.

## Register skills

Follow [integrations/grok-bot/skill-registration.md](../integrations/grok-bot/skill-registration.md).

Map each installed `.agents/skills/*/SKILL.md` to a Grok shared workflow. Suggested ids include `journal-workflow`, `journal-resume`, `journal-init-work`, `journal-switch`, `journal-entry` (the upstream `journal` skill), `journal-plan`, `journal-recall`, `journal-decision`, `journal-document`, `journal-research-codebase`, `journal-research-web`, `journal-reinforce`, `journal-audit`, and `journal-reconcile`.

Rewrite bodies so commands are `journal <cmd> --target <project-root>` and rule paths stay under the install target, resolved through `STATE.md`. Link sibling workflows as `[Journal resume](sand-workflow:journal-resume)`. Do not hardcode a team path, owner, or agent id.

Also register:

- Journal Hub setup, from [getting-started.md](../integrations/grok-bot/getting-started.md), which asks for the project root, sync mode, engineering peers, and hub display name, one question at a time
- Checkup with Journal Hub, from [checkup.md](../integrations/grok-bot/checkup.md)

## Peer briefing

After setup, the hub sends the short message in [peer-briefing.md](../integrations/grok-bot/peer-briefing.md). Peers learn the project root, that they run the CLI themselves, and that they can ask the hub for a checkup. The message does not include agent ids.

## Reconcile posture

Checkup reads status, doctor, and conflict output. Share and sync stay opt-in. `local_only` work stays unpublished. Conflict review reports both sides; it does not drop journal history to force a clean sync.

## Related docs

- [Installation and repository layouts](installation.md)
- [Journal harness adapter contract](../.agents/adapters/contract.md)
- [Uninstalling and reinstalling](uninstalling.md)
