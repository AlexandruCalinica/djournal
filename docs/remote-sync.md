# Remote Git Sync Setup

Git-backed sharing lets a team move journal history through the same reviewable
transport they use for code. There are two different modes:

- colocated `.journal/` in a product repository
- standalone journal repository for multi-repo or team-wide memory

The `djournal sync` command is opt-in and intended for standalone journal
repositories or colocated projections. The canonical journal stays in
`~/.djournal/projects/<project-key>/`; sync copies explicitly shared work into
the configured Git-backed projection.

## Colocated repository

Use colocated mode when the product repository should carry `.journal/` beside
the code:

```bash
cd my-product
djournal install --all
djournal config sync.enabled true
djournal config sync.mode colocated
djournal config sync.path .
djournal share --work 2026-07-03-01-example
djournal sync --work 2026-07-03-01-example
git add .agents .codex .claude AGENTS.md CLAUDE.md .djournal.json .journal
git commit -m "chore: install djournal"
git push origin main
```

Only share journal work that is safe for the team to see. In colocated mode,
`djournal share` updates the global sharing index and `djournal sync` projects
that work into the repository `.journal/`. Git publication then happens through
normal product commits.

If `.journal/` or `.journal/work/...` is ignored, projection can still create
files locally, but Git will not include them unless you update `.gitignore` or
force-add the intended path:

```bash
git add -f .journal/work/2026-07-03-01-example
```

## Standalone journal repository

Use a standalone journal repository when work spans multiple code repositories:

```bash
mkdir my-product-journal
cd my-product-journal
git init
djournal install --all
djournal config sync.enabled true
djournal config sync.mode standalone
djournal config sync.path .
djournal config sync.auto true
git remote add origin git@github.com:example/my-product-journal.git
git add .
git commit -m "chore: bootstrap journal"
git push -u origin main
```

Keep the repository next to the code repositories and point `sync.path` at it
from the workspace/project that owns the global journal store.

## Bootstrapping from an existing remote

When the journal remote already exists:

```bash
git clone git@github.com:example/my-product-journal.git
cd my-product-journal
djournal install --all
djournal status
```

If `.journal/` is already present after clone, the install step refreshes local
harness integration without replacing durable journal history.

If the remote was created for standalone journal sync, verify config with
`djournal config` before expecting hooks to synchronize automatically.

## Sharing a work item

By default, work is local-only. Promote a work item before publishing its
journal history:

```bash
djournal share
```

Select a specific work item:

```bash
djournal share --work 2026-07-03-01-git-backed-journal-collaboration
```

Sharing is a publication intent recorded in the global config. Treat it as
durable: once projected content has been pushed to a team remote, removing it
from the sharing index does not remove it from Git history or teammates' clones.

## Synchronizing shared work

Run sync manually:

```bash
djournal sync
```

Or select a work item:

```bash
djournal sync --work 2026-07-03-01-git-backed-journal-collaboration
```

Current behavior:

- sync is skipped unless global `config.json` opts in
- unshared work is skipped
- colocated mode copies shared work into the configured product repo projection
- standalone mode copies shared work and then uses conservative Git operations
- unresolved journal conflicts stop sync

Hook-triggered sync uses the same command path with `--auto` only when
global config enables standalone automatic sync and the closed work is shared.
The hook derives the work item from the validated closed marker path, so a
response that closes `.journal/work/<slug>/journal/...` synchronizes that
`<slug>` even if `state.json` currently selects a different active work item.

## Keep local state local

Do not use Git as a blind mirror of every operational file. Treat these as
local operational state unless a future workflow explicitly says otherwise:

- `.journal/state.json`
- `.journal/.install/`
- `.djournal.json` when the team does not want to share the local store pointer
- local harness cache or runtime files

The durable team memory is the work item content: `work.md`, `journal/`,
`decisions/`, `docs/`, and `_research/`.

## Related docs

- [Visibility and sharing](visibility-and-sharing.md)
- [Architecture and data model](architecture.md)
