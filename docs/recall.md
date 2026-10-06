# Fast Recall

Recall finds the journal files most likely to answer a question before anyone
spends time opening and summarizing them. It can be used directly as a small
search CLI, or indirectly through an agent that has djournal's `recall` skill.
Both paths use the same local index and keep Markdown as the source of truth.

## Use it as a standalone CLI

From an installed project, search in plain-text mode:

```bash
djournal recall search "why did we choose webhook retries"
```

The output ranks matching work items and entries by score and prints their
canonical `.journal/...` paths. Use JSON when another script or tool will consume
the results:

```bash
djournal recall search "webhook retries" --type decision,research --limit 5 --json
```

Available filters narrow results without changing the journal:

```bash
djournal recall search "checkout" \
  --work 2026-08-14-01-checkout \
  --kind entry \
  --status active \
  --visibility team_shared
```

The first search builds the private index automatically. Prebuilding is useful
after importing a large journal, and rebuilding is available for diagnostics:

```bash
djournal recall index
djournal recall index --rebuild
```

For a strictly no-write invocation, use an ephemeral index:

```bash
djournal recall search "onboarding decisions" --no-cache --json
```

CLI recall returns evidence candidates, not a generated answer. A human or
calling program decides which returned Markdown files to read next.

## Use it through an agent

Install djournal for the agent harness you use:

```bash
djournal install --harness codex
# or: --harness claude-code
# or: --harness pi
# or: --harness grok-bot
```

Then ask naturally:

```text
Recall why we chose the current billing webhook retry strategy.
```

The `recall` skill classifies the question, calls the same CLI with `--json`,
uses the ranked paths to select a small evidence set, and reads those canonical
Markdown files before answering. It follows relevant entry links and starts
from the latest spine entry when the question needs chronology or current
status. Its final response includes the journal sources that support the answer.

If the CLI is unavailable or the cache cannot produce candidates, the skill
falls back to filesystem discovery. Recall remains read-only in either path: it
does not create entries, share work, sync, commit, or push.

## What happens on each call

There is no daemon. Each invocation loads the serialized MiniSearch snapshot,
checks source-file metadata, refreshes changed documents, searches in memory,
and exits. Warm calls avoid reparsing unchanged Markdown; additions, edits,
renames, and deletions are reconciled before results are returned.

The persistent snapshot lives at:

```text
~/.djournal/projects/<project-key>/cache/recall/snapshot.json
```

It sits outside `.journal/`, so it is not canonical history and is never shared.
If it is missing, incompatible, malformed, or unwritable, recall rebuilds it or
continues in memory for the current call. Removing `cache/recall/` is safe.

Inspect cache health with:

```bash
djournal status
djournal doctor
```

For the storage and freshness model, see [Architecture and data model](architecture.md).
For remote readers, see [Read-only team journal access](read-only-team-journal.md).
