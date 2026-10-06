# Installation and Repository Layouts

djournal can be installed globally and then added to each project that should
carry journal memory. The installed project gets harness integration plus a
`.djournal.json` marker. The canonical journal content lives under
`~/.djournal/projects/<project-key>/`.

## Recommended install

```bash
npm install -g djournal
```

Then run the installer from the repository or journal workspace you want to
equip:

```bash
djournal install
```

The package exposes both `djournal` and `journal` commands. They point to the
same CLI.

## No global install

Use `npx` when you want a one-off install without adding a global command:

```bash
npx djournal install
```

## Single-repository setup

Use this when one product repository owns the work:

```bash
cd my-product
djournal install
```

This installs:

- shared journal rules and skills under `.agents/`
- harness-specific hook config when Codex, Claude Code, or Pi is selected
- a managed `.pi/extensions/djournal.ts` extension when Pi is selected
- the Journal Hub recipe under `integrations/grok-bot/` when Grok Bot is selected
- managed instruction blocks in `AGENTS.md` and/or `CLAUDE.md`
- `.djournal.json`, which points to the global project store
- for Claude Code installs, a narrow permission grant that lets the agent read
  and write this project's global journal store and run safe `journal`/`djournal`
  workflow commands

The durable journal entries live under
`~/.djournal/projects/<project-key>/.journal/work/...`.

## Harness permissions

Claude Code stores project permissions in `.claude/settings.json`, so
`djournal install --harness claude-code` and `djournal install --all` add this
project's exact global store path to `permissions.additionalDirectories` and
allow the safe `journal`/`djournal` commands used by the workflow. Uninstall
removes only the permission entries that djournal injected.

Codex sandbox permissions are controlled by the Codex runtime launch/config
rather than `.codex/hooks.json`. The installed Codex hook resolves the global
store through `.djournal.json`; if the Codex session is sandboxed, launch it
with the generated journal store path available as a readable/writable root.

Pi loads project `.agents/skills` and `.pi/extensions/` only after project
trust. In interactive Pi, use `/trust` and restart the session. For print, JSON,
or RPC runs without a stored trust decision, pass `--approve`. djournal does not
edit Pi's trust file. Pi itself is not a filesystem sandbox; external containers
or sandboxes must expose the global store referenced by `.djournal.json`.

Grok Bot has no SessionStart or Stop hooks. `djournal install --harness grok-bot`
installs the shared instruction baseline and copies `integrations/grok-bot/`.
It does not write `.codex/hooks.json`, `.claude/settings.json`, or
`.pi/extensions`. Register skills in Grok using
[Grok Bot](grok-bot.md). `djournal doctor` reports the CLI, `.agents/`, and the
project marker, and stays healthy when hook files are absent.

To share selected work through the product repository, enable colocated
projection:

```bash
djournal config sync.enabled true
djournal config sync.mode colocated
djournal config sync.path .
djournal share --work 2026-07-03-01-example
djournal pull --work 2026-07-03-01-example
djournal sync --work 2026-07-03-01-example
```

Pull hydrates canonical storage from the current product checkout. Sync pulls
again, then copies the shared work item into `./.journal/work/...` so normal
product repository commits can carry it.

## Multi-repository setup

Use standalone projection when one work stream spans several code repositories:

```bash
mkdir my-product-journal
cd my-product-journal
git init
djournal install --all
djournal config sync.enabled true
djournal config sync.mode standalone
djournal config sync.path .
```

Keep the journal repository as a sibling of the product repositories:

```text
workspace/
  product-api/
  product-web/
  product-mobile/
  my-product-journal/
    .djournal.json
    .journal/          # shared projection after djournal sync
    .agents/
```

Agents can run from the workspace or journal repository as long as they resolve
the installed project marker. Journal entries can still reference paths and
commits in sibling code repositories.

## Harness selection

Install for one harness:

```bash
djournal install --harness codex
djournal install --harness claude-code
djournal install --harness pi
djournal install --harness grok-bot
```

`grok` and `grokbot` are aliases for `grok-bot`. A `.grokbot/` directory is
optional detection evidence. A `grok` executable is not.

Install for multiple harnesses:

```bash
djournal install --harness codex,claude-code,pi,grok-bot
```

Install every supported harness:

```bash
djournal install --all
```

Install only the portable instructions and journal skills:

```bash
djournal install --instructions-only
```

## Useful checks

```bash
djournal status
djournal doctor
djournal update check
```

`status` reports installed files, cleanliness, the executing CLI version, the
project asset version, and cached npm release availability. `doctor` checks the
local environment and harness configuration. For Pi it reports extension
presence and reminds you that project trust is required; it does not inspect or
change Pi's private trust state. For Grok Bot it reports whether `.agents/` and
the project marker are present, notes that hooks are not required, and points
to [Grok Bot](grok-bot.md) for skill registration. A missing `journal` binary
on `PATH` is reported and does not fail that check.

## Update notifications

djournal checks npm release metadata without delaying session startup. A
session reads `update-check.json` under `DJOURNAL_HOME` (default:
`~/.djournal/update-check.json`) and, when that cache is older than 24 hours,
starts a bounded background refresh for a later session. Registry failures are
silent in this passive path.

When a cached release is newer than the executing CLI, every new session shows
an update notice until the newer package is installed. When the CLI is newer
than a project's installed hooks and rules, every new session instead—or
additionally—reminds you to upgrade those project assets.

Check immediately:

```bash
djournal update check
djournal update check --json
```

For a global installation, update both layers:

```bash
npm install -g djournal@latest
djournal upgrade
```

Passive checks are enabled by default. Configure the interval or disable them
for a project:

```bash
djournal config updates.intervalHours 24
djournal config updates.enabled false
```

Set `NO_UPDATE_NOTIFIER=1` to disable passive checks and notices for the current
environment. CI and test environments skip them automatically. Explicit
`djournal update check` commands still perform a foreground check and report
errors.

## Related docs

- [Grok Bot](grok-bot.md)
- [Remote Git sync setup](remote-sync.md)
- [Read-only team journal access](read-only-team-journal.md)
- [Uninstalling and reinstalling](uninstalling.md)
