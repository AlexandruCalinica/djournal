# Remote Git Sync Setup

Git-backed sharing lets a team move journal history through the same reviewable
transport they use for code. The current sync behavior is intentionally
conservative: local-only work is skipped, shared work is synchronized through
Git, and unresolved conflicts stop the operation.

## Colocated repository

Use colocated mode when the product repository should carry `.journal/` beside
the code:

```bash
cd my-product
djournal install --all
git add .agents .codex .claude AGENTS.md CLAUDE.md spec.md .journal
git commit -m "chore: install djournal"
git push origin main
```

Only share journal work that is safe for the team to see. Do not commit
local-only work items unless they are intentionally promoted.

## Standalone journal repository

Use a standalone journal repository when work spans multiple code repositories:

```bash
mkdir my-product-journal
cd my-product-journal
git init
djournal install --all
git remote add origin git@github.com:example/my-product-journal.git
git add .
git commit -m "chore: bootstrap journal"
git push -u origin main
```

Keep the repository next to the code repositories and let agents run from the
journal repository when they need durable memory across the whole product.

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

Sharing is a visibility escalation. Treat it as durable: once content has been
pushed to a team remote, moving it back to local-only does not remove it from
Git history or teammates' clones.

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

- local-only work is skipped
- shared work requires `.journal/` to be inside a Git work tree
- unresolved journal conflicts stop sync
- sync uses conservative Git operations to pull, add, commit, and push journal
  changes

Hook-triggered sync uses the same command path with `--auto` after a valid
closed journal marker for team-shared work.

## Keep local state local

Do not use Git as a blind mirror of every operational file. Treat these as
local operational state unless a future workflow explicitly says otherwise:

- `.journal/state.json`
- `.journal/.install/`
- local harness cache or runtime files

The durable team memory is the work item content: `work.md`, `journal/`,
`decisions/`, `docs/`, and `_research/`.

## Related docs

- [Visibility and sharing](visibility-and-sharing.md)
- [Architecture and data model](architecture.md)
