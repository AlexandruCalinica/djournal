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

You can ask explicitly:

```text
Plan the auth migration before changing code.
```

You can also describe the work without naming the skill:

```text
We need to migrate auth tokens from local storage to httpOnly cookies. Work out
the phases, risks, tests, and rollout before implementation.
```

The agent should infer that a durable plan is useful because the request has
multiple phases, security implications, rollout risk, and validation work. If
the task is small and obvious, the agent may skip a durable plan and implement
directly.

## Capture evidence

Use research entries when findings should survive the session:

- how a subsystem works
- type or schema discovery
- integration maps
- current external docs or standards
- alternatives and tradeoffs

Research should cite files, commands, links, and concrete observations. It
should not paste entire source files or transcripts.

You can ask explicitly:

```text
Research how billing webhooks are handled in this codebase.
```

Or:

```text
Before we change webhook retries, map the current webhook flow, tests, and
places where failures are handled.
```

The agent should infer codebase research when the request asks for an
implementation map, type discovery, integration analysis, dependency review,
or current behavior before planning or changing code.

## Record decisions

Use decision entries when a choice constrains future work:

- chosen architecture
- rejected option and rationale
- product behavior
- migration policy
- supersession of an older decision

Good decisions make future debates shorter because they preserve the original
constraints and evidence.

You do not have to say the word "decision", but it is often the clearest way to
ask:

```text
Decision: use a standalone journal repository for multi-repo product work.
Record the rationale and consequences.
```

The agent should also infer a decision when the request clearly states that an
option has been chosen:

```text
We are going with httpOnly cookies instead of local storage for auth tokens
because XSS risk matters more than the extra CSRF handling. Capture that so we
do not relitigate it later.
```

The agent should not create a decision entry for unresolved discussion:

```text
Compare local storage and httpOnly cookies for auth tokens.
```

That is research or a decision aid until a choice is actually made. A decision
entry needs the context, options considered, chosen option, rationale,
consequences, and follow-up. If those facts are missing, the agent should ask
or record only the known state.

## Write durable docs

Use doc entries for synthesized references that should stand on their own:

- architecture references
- walkthroughs
- how-to guides
- onboarding notes
- decision aids before a choice is made

Explicit request:

```text
Document how journal sync works for future contributors.
```

Inferred request:

```text
Create a durable guide that explains the webhook retry system, including the
current flow, operational concerns, and how to safely change it.
```

The agent should infer a doc entry when the requested output is a lasting
reference, not just an answer in chat.

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

Implementation and status entries are usually created at closure. You normally
do not need to ask for them directly if the project uses djournal automation.
When work changes code, docs, behavior, or material project state, the agent
should close with a spine entry after validation.

Examples:

```text
Add the webhook retry backoff and tests.
```

This should usually produce an implementation entry after the change is made
and validated.

```text
Check whether the release PR is open and record where things stand.
```

This should usually produce a status entry if it changes durable project state
or records a material checkpoint.

Read-only or trivial requests should not create journal noise:

```text
What does this function do?
Fix this typo.
```

Those may use recall or direct inspection, but they should not force a new
entry unless they materially affect durable work state.

## Skill names and inference

djournal supports both explicit and inferred skill use.

| User wording | Likely journal behavior |
| --- | --- |
| "Resume this work" | Read the active work item and latest spine entry. |
| "Plan this migration" | Create a plan entry before implementation. |
| "Research how auth works" | Create a codebase research entry. |
| "Look up the current API docs and record findings" | Create web research with sources. |
| "We chose option B; record why" | Create a decision entry. |
| "Write a durable guide for this subsystem" | Create a doc entry. |
| "Implement this feature" | Implement, validate, then create an implementation entry. |
| "Record current blockers/status" | Create a status entry. |

Explicit keywords make intent unambiguous, especially for decisions and docs.
They are not required when the meaning is clear. The agent should infer from
the request using the journal automation rules:

- meaningful implementation gets resumed, validated, and journaled
- durable research gets a research entry
- accepted choices get decision entries
- durable references get doc entries
- read-only and trivial work avoid unnecessary entries

If the request is ambiguous, the agent should ask a short clarifying question
or choose the least surprising durable artifact.

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
