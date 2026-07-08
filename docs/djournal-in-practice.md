# Djournal in Practice

djournal works best when it records meaningful work as the work happens. It is
not a transcript archive and not a replacement for code review. It is the
reasoning layer that helps future people and agents resume from the right
state.

## Start or resume work

At session start, the active work item gives the agent a compact context pack:

- latest timeline
- current state
- linked decisions and research
- next steps
- recovery warnings from Git status

This lets future sessions start from shaped history rather than broad
exploration.

## Plan before risky work

Use a plan entry when the work has multiple phases, cross-component effects, or
non-obvious validation:

```text
Plan the migration before changing code.
```

Plans should explain goals, non-goals, current state, design, phased steps,
tests, edge cases, and open questions.

## Capture evidence

Use research entries when findings should survive the session:

- how a subsystem works
- type or schema discovery
- integration maps
- current external docs or standards
- alternatives and tradeoffs

Research should cite files, commands, links, and concrete observations. It
should not paste entire source files or transcripts.

## Record decisions

Use decision entries when a choice constrains future work:

- chosen architecture
- rejected option and rationale
- product behavior
- migration policy
- supersession of an older decision

Good decisions make future debates shorter because they preserve the original
constraints and evidence.

## Close meaningful work

After implementation or material status changes, write a spine entry that
records:

- what changed
- why it changed
- files touched
- validation results
- current state
- next steps

The latest spine entry becomes the primary resume index.

## Keep entries bounded

Store durable facts, not raw session noise:

- file paths, commands, test results, PRs, commits
- concise rationale and summaries
- links to supporting entries
- short failure excerpts only when useful

Avoid storing secrets, environment dumps, full transcripts, full diffs, or
unbounded logs.

## Use with multiple agents

Because the journal is Markdown, different harnesses can read the same memory:

- Codex can start the work.
- Claude Code can continue from the same spine and decisions.
- A future harness can inspect the same files and links.

The journal keeps continuity outside any one model context.

## Related docs

- [Architecture and data model](architecture.md)
- [Visibility and sharing](visibility-and-sharing.md)
