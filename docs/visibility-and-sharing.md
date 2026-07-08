# Visibility and Sharing

Visibility answers who the work is intended to be shared with. It belongs to
the work item, not to individual entries.

## Visibility values

| Visibility | Meaning |
| --- | --- |
| `local_only` | Default. Keep the work on the local machine. |
| `private_synced` | Reserved compatibility state for private synchronized work. |
| `team_shared` | Eligible for team sharing and Git-backed sync. |

New work starts as `local_only`.

## Sharing a work item

Promote the active work item:

```bash
djournal share
```

Promote a specific work item:

```bash
djournal share --work 2026-07-03-01-git-backed-journal-collaboration
```

Dry run:

```bash
djournal share --dry-run --json
```

`share` changes visibility. It does not by itself guarantee remote publication.
In colocated repositories, Git publication is whatever normal commits include.
In standalone journal repositories, Git transport is handled by opt-in `sync`.

## Sync and visibility

Run sync:

```bash
djournal sync
```

If the selected work item is `local_only`, sync skips it:

```json
{
  "action": "sync",
  "skipped": true,
  "reason": "visibility is local_only"
}
```

For `team_shared` work, sync performs conservative Git operations only when
`.journal/config.json` explicitly enables standalone sync. In colocated mode,
sync is skipped because normal repository commits already carry the journal.

## Safety model

Treat sharing as a durable escalation. After journal content enters a shared
Git remote, it may remain in Git history and teammates' clones even if local
metadata changes later.

Before sharing, check for:

- customer or private data
- secrets, credentials, tokens, and connection strings
- private implementation details not intended for the team
- accidental transcript dumps or unbounded logs

## Related docs

- [Remote Git sync setup](remote-sync.md)
- [Uninstalling and reinstalling](uninstalling.md)
