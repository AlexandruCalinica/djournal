# Read-Only Team Journal Access

This guide is for people who need to read, recall, and research team journal
history without publishing their own journal entries back to the shared remote.
Typical users include PMs, designers, support leads, and executives who want to
ask an agent about prior decisions without learning the full synchronization
workflow.

## Current Model

djournal does not yet have a single `connect --read-only` command. Today, a
read-only setup is achieved by combining three controls:

- Git credentials that can clone and pull the team journal repository but cannot
  push to it.
- djournal sync config that enables `pull` but does not enable automatic
  publication.
- Agent prompts that ask for read-only skills such as `recall`, `research`, and
  `document`, not implementation or journal closure.

This still writes local files under the user's djournal home. "Read-only" means
read-only with respect to the organization remote, not a filesystem mode that
prevents local cache or canonical-store hydration.

Recall also writes a private derived index under
`~/.djournal/projects/<project-key>/cache/recall/`. It is not placed in the Git
projection and is never published. Every CLI invocation loads the serialized
index, checks source-file metadata, and incrementally refreshes only stale
documents before searching; it does not keep a daemon or a process permanently
in memory. If the local store is not writable, recall builds the index in memory
for that invocation and returns results without attempting a remote write.

## Setup for a Non-Technical Reader

Ask the organization admin for the team journal repository URL and read-only Git
access. Then use this script-like sequence in a terminal from a working folder:

```bash
npm install -g djournal
git clone <team-journal-repository-url> team-journal
cd team-journal
djournal install --instructions-only
djournal config sync.enabled true
djournal config sync.mode standalone
djournal config sync.path .
djournal config sync.auto false
djournal pull
djournal recall index
djournal recall search "onboarding decisions"
djournal status
```

Use `--instructions-only` when the person only needs portable journal skills and
does not need editor-specific hooks. Use a harness install instead when they
will use the journal from Codex, Claude Code, or Pi:

```bash
djournal install --harness codex
djournal install --harness claude-code
djournal install --harness pi
```

Do not run these commands in a read-only consumer setup:

```bash
djournal share
djournal sync
```

If read-only Git permissions are configured correctly, accidental pushes should
fail at the remote even if someone runs a publication command.

To avoid persistent local cache writes as well, add `--no-cache` to a recall
search. To clear a persistent cache, delete only the project store's
`cache/recall/` directory or run `djournal recall index --rebuild`; canonical
journal history is unaffected. A malformed or incompatible cache is ignored and
rebuilt automatically.

## Copy/Paste Agent Prompt

Use this prompt after installation when asking an LLM agent to connect the local
checkout to the remote journal in read-only mode:

```text
Set up djournal for read-only team journal access.

The team journal repository is: <paste repository URL>
I only need to recall and research existing decisions. Do not publish, share,
sync, push, or create journal entries unless I explicitly ask later.

Please:
1. Verify Node.js and npm are available.
2. Install or update djournal with `npm install -g djournal`.
3. Clone the team journal repository if it is not already cloned.
4. Run `djournal install --instructions-only` in the cloned journal repository.
5. Configure standalone pull access with:
   - `djournal config sync.enabled true`
   - `djournal config sync.mode standalone`
   - `djournal config sync.path .`
   - `djournal config sync.auto false`
6. Run `djournal pull` and `djournal status`.
7. Report whether recall is ready and show the active work item if one exists.

Keep this setup read-only for the organization remote. If a command would write
to the remote, stop and explain why.
```

## Reader Prompts

Good prompts for read-only users:

```text
Recall why we chose the current billing webhook retry strategy.
```

```text
Find product decisions about onboarding and summarize the evidence.
```

```text
Research the journal history for risks in changing the checkout flow. Do not
edit files or write a journal entry.
```

```text
Show the timeline for the mobile launch work item and list unresolved decisions.
```

Avoid prompts that imply write behavior unless the user really intends to
contribute:

- "Implement this"
- "Record a decision"
- "Share this work"
- "Sync my journal"

## Organization Admin Checklist

For a reader-friendly remote:

- Put shared journal projection content in a standalone Git repository.
- Grant readers clone/pull access only.
- Keep sensitive or local-only work out of the shared projection.
- Publish only reviewed work items with `djournal share` and `djournal sync`
  from a maintainer machine or CI account.
- Provide the repository URL and the copy/paste setup prompt above.

## Product Gaps

The current workflow is usable but too manual for non-technical people. A better
first-class experience would add:

- `djournal connect <repo-url> --read-only`, which clones or opens the remote,
  installs instructions, configures standalone pull, disables auto-sync, and
  runs status.
- `djournal recall-ready`, or an expanded `status`, that explains in plain
  language whether the local reader can use recall.
- A config flag such as `sync.readOnly: true` that causes `share` and `sync` to
  fail before attempting Git publication.
- Documentation or generated prompts tailored per harness.

## Related docs

- [Installation and repository layouts](installation.md)
- [Remote Git sync setup](remote-sync.md)
- [Visibility and sharing](visibility-and-sharing.md)
