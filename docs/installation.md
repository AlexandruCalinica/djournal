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
- harness-specific hook config when selected
- a managed `.pi/extensions/djournal.ts` extension when Pi is selected
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

To share selected work through the product repository, enable colocated
projection:

```bash
djournal config sync.enabled true
djournal config sync.mode colocated
djournal config sync.path .
djournal share --work 2026-07-03-01-example
djournal sync --work 2026-07-03-01-example
```

That copies the shared work item into `./.journal/work/...` so normal product
repository commits can carry it.

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
```

Install for multiple harnesses:

```bash
djournal install --harness codex,claude-code,pi
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
```

`status` reports installed files and cleanliness. `doctor` checks the local
environment and harness configuration. For Pi it reports extension presence
and reminds you that project trust is required; it does not inspect or change
Pi's private trust state.

## Related docs

- [Remote Git sync setup](remote-sync.md)
- [Uninstalling and reinstalling](uninstalling.md)
