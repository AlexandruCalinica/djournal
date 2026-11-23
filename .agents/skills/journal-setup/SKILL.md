---
name: journal-setup
description: Install djournal into the current project with the user's own coding agent, and maintain it afterwards. Use to install djournal or add an agent integration, change sync, sharing, or update settings, share or sync work items, check for or install a newer djournal CLI, upgrade project assets, diagnose an installation, or uninstall.
---

# Set up and maintain djournal

Drive the `djournal` CLI on the user's behalf. The CLI owns every installed
file, the project store, and the configuration; this skill only chooses and
runs its non-interactive commands. Never hand-edit `.djournal.json`,
`.agents/`, managed instruction blocks, hook configuration, or the store's
`config.json`.

This skill also works before djournal is installed: a user may point their
agent at this file's published copy and ask it to "install djournal". In that
case the rest of `.agents/` does not exist yet; follow this file alone until
installation finishes.

## Ground rules

- Run commands from the project root, or pass `--target <project-root>`.
- Never run bare `djournal`, `journal`, or `djournal setup`: they open an
  interactive terminal wizard an agent cannot drive. Pass `--yes` to `install`
  so it never waits for a prompt.
- Preview every mutating command with `--dry-run` when it supports it, show the
  user the result, and run it for real only after they agree.
- Ask before global or outward-facing actions: `npm install -g`, a `sync` that
  commits and pushes, enabling sharing, and uninstall.
- Prefer `--json` for commands you need to parse. Report failures with the
  command and a short excerpt; do not retry destructively or work around an
  `ASSET_CONFLICT` by deleting or overwriting the user's files.
- Do not create, switch, or edit work items or entries here. Hand off to
  `journal-init-work`, `journal-switch`, or `journal-entry`.

## 1. Inspect

1. Resolve the project root: `git rev-parse --show-toplevel`, or the current
   directory outside Git. Confirm with the user when the agent runs from a
   workspace above several repositories (see standalone mode below).
2. Check the CLI: `djournal update check --json` (or `npx djournal update check
   --json` when `djournal` is not on PATH). Node.js 18 or newer is required.
3. When `.djournal.json` exists in the project root, the project is installed.
   Run `djournal status --json` and `djournal doctor --json` and use their
   output to choose the route below.

## 2. Route the request

| Request | Section |
| --- | --- |
| Install djournal, add or remove an agent integration | Install |
| Change sync, sharing, or update-notification settings | Configure |
| Share work items with the team, pull or push shared history | Share and sync |
| Check for a new version, update the CLI, refresh project files | Update and upgrade |
| Hooks or skills not loading, doctor failures | Diagnose |
| Remove djournal | Uninstall |

## Install

1. If the CLI is missing, ask whether to install it globally
   (`npm install -g djournal`) or run once through `npx djournal ...`.
2. Select integrations for the agents the user actually runs in this project.
   Default to the agent you are running in:

   | Agent | `--harness` value |
   | --- | --- |
   | Claude Code | `claude-code` |
   | Codex | `codex` |
   | Pi | `pi` |
   | Grok Bot | `grok-bot` |
   | Any other agent | `--instructions-only` (portable `AGENTS.md` and skills, no hooks) |

   Combine several with commas, or use `--all`.
3. Preview, then install:

   ```bash
   djournal install --harness <list> --yes --dry-run
   djournal install --harness <list> --yes
   ```

   Reinstalling an installed project keeps existing integrations and adds the
   new ones. Existing `AGENTS.md`/`CLAUDE.md` text is preserved; djournal adds
   only its marked block.
4. Run `djournal doctor`. Then tell the user what must happen outside the CLI:
   - **Claude Code, Codex:** restart the agent in the project so hooks and
     skills load.
   - **Pi:** trust the project (`/trust`) and restart, or pass `--approve` for
     non-interactive runs.
   - **Grok Bot:** register the skills from
     `integrations/grok-bot/skill-registration.md`; no hooks are used.
   - **Codex sandbox:** make the global store path from `.djournal.json`
     readable and writable to the session.
5. Offer the Configure step. Work stays local until the user chooses sharing.
6. Suggest committing the installed files (`.agents/`, `.djournal.json`,
   harness config, instruction files) so collaborators get the same setup.
   Do not commit unless asked.
7. After the restart, the user can start work with `journal-init-work`.

## Configure

Read the current values with `djournal config --json`. Set one key at a time:

```bash
djournal config <key> <value> --dry-run
djournal config <key> <value>
```

| Key | Values | Meaning |
| --- | --- | --- |
| `sync.enabled` | `true`, `false` | Share selected work through Git |
| `sync.mode` | `colocated`, `standalone` | Same repository as the code, or a separate journal repository |
| `sync.path` | path | Root of the Git projection, usually `.` |
| `sync.auto` | `true`, `false` | Standalone only: hooks sync shared work after each closed journal entry |
| `updates.enabled` | `true`, `false` | Session notices about newer releases |
| `updates.intervalHours` | number | How often the release check refreshes |

Ask which sharing model the user wants before enabling sync:

- **Local only** (default): leave `sync.enabled` `false`.
- **Colocated:** shared work is copied into `./.journal/work/...` and travels
  with normal product commits. `sync.mode colocated`, `sync.path .`.
- **Standalone:** one journal repository serves several code repositories.
  Run the install from that journal repository, then `sync.mode standalone`,
  `sync.path .`. Sync commits and pushes there.

Do not change any other key unless the user names it. Unknown keys are stored
as given, so check spelling against the table.

## Share and sync

Sharing marks a work item for projection; it does not change its visibility or
publish anything by itself. Sync is what copies (colocated) or commits and
pushes (standalone).

1. Confirm sync is enabled (`djournal config sync --json`); otherwise offer
   Configure first.
2. List candidates with `djournal work list --json` and let the user choose.
   Never share every item (`--all`) unless the user asks for all of them.
3. Preview and apply:

   ```bash
   djournal share --work <slug> --dry-run
   djournal share --work <slug>
   djournal sync --work <slug> --dry-run
   djournal sync --work <slug>
   ```

4. Report any `.gitignore` warning from `share`; the user decides whether to
   change ignore rules.
5. To receive teammates' shared work, run `djournal pull` (add `--work <slug>`
   to limit it). Stop and report any conflict; never resolve journal conflicts
   by discarding either side.
6. In colocated mode, remind the user that the projected files are committed
   with their normal Git workflow.

## Update and upgrade

djournal has two layers that update separately:

1. **CLI.** `djournal update check --json` reports the running and latest
   versions. With the user's approval, run `npm install -g djournal@latest`
   (for `npx` users, the next `npx djournal@latest` run picks it up).
2. **Project assets.** After a CLI update, or when a session notice says the
   project assets are older than the CLI, run in each installed project:

   ```bash
   djournal upgrade --dry-run
   djournal upgrade
   ```

   Upgrade replaces only unchanged managed files and migrates renamed skills.
   A locally modified managed file produces an `ASSET_CONFLICT` and stays
   intact: show the file to the user and let them choose between keeping their
   edits and restoring the managed copy before rerunning.
3. Restart the agent so the new hooks and skills load, then run `djournal
   doctor`. Grok Bot users re-register changed skills.

## Diagnose

Run `djournal doctor --json` and `djournal status --json`, then explain each
failing check in plain terms with its fix:

- Missing `.agents` rules or skills, or stale assets: `djournal upgrade`.
- Missing instruction block in `AGENTS.md` or `CLAUDE.md`: reinstall or
  upgrade restores it. Broken or duplicate markers need manual repair first.
- `require is not defined in ES module scope` from a hook: update the CLI, then
  `djournal upgrade`.
- Skills not offered by the agent: restart it in the project root; for Claude
  Code confirm `.claude/skills/` exists, for Pi confirm project trust.

## Uninstall

Confirm the scope first: one integration (`--harness <name>`) or everything
(`--all`).

```bash
djournal uninstall --harness <name>
djournal uninstall --all
```

Journal history in the global store is kept. Modified installed files are
preserved and reported; leave them for the user to review.

## Closure

Installation, configuration, sharing, and upgrades are operational changes.
They do not need a journal entry by themselves. When an active work item exists
and the change matters to that work (for example, enabling team sharing for
it), record it with `journal-entry`. Before djournal is installed there is no
journal and no status marker requirement.
