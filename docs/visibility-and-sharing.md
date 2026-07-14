# Visibility and Sharing

Visibility answers who the work is intended for. Sharing answers whether a work
item should be projected out of the private global store into a Git-backed
location. They are related but no longer the same control.

## Visibility values

| Visibility | Meaning |
| --- | --- |
| `local_only` | Default. Keep the work on the local machine. |
| `private_synced` | Reserved compatibility state for private synchronized work. |
| `team_shared` | Eligible for team sharing and Git-backed sync. |

New work starts as `local_only` and unshared.

## Sharing a work item

Mark the active work item as shared:

```bash
djournal share
```

Mark a specific work item as shared:

```bash
djournal share --work 2026-07-03-01-git-backed-journal-collaboration
```

Dry run:

```bash
djournal share --dry-run --json
```

`share` updates `sharing.sharedWorkItems` in the global project config. It does
not edit `work.md` visibility and does not by itself guarantee remote
publication. Publication requires `djournal sync` plus the relevant Git commit
or push for the configured mode.

## Sync and visibility

Run sync:

```bash
djournal sync
```

If the selected work item has not been shared, sync skips it:

```json
{
  "action": "sync",
  "skipped": true,
  "reason": "work is not shared"
}
```

For shared work, sync is still opt-in through global config:

```bash
djournal config sync.enabled true
djournal config sync.mode colocated
djournal sync
```

In colocated mode, sync copies shared work into the product repository
projection. In standalone mode, sync copies shared work into the standalone
journal repository and performs conservative Git operations.

## Safety model

Treat sharing as a durable escalation. After projected journal content enters a
shared Git remote, it may remain in Git history and teammates' clones even if
local sharing metadata changes later.

Before sharing, check for:

- customer or private data
- secrets, credentials, tokens, and connection strings
- private implementation details not intended for the team
- accidental transcript dumps or unbounded logs

## Related docs

- [Remote Git sync setup](remote-sync.md)
- [Uninstalling and reinstalling](uninstalling.md)
