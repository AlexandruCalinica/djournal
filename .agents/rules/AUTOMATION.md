# Ambient Journal Automation Rules

These rules coordinate existing journal skills. They do not replace the file,
metadata, link, state, or safety rules those skills own.

## Task classification

Classify each request before acting:

| Class | Examples | Default behavior |
| --- | --- | --- |
| Read-only | explain, inspect, review, answer status | Recall or resume only when history matters; do not write a closing entry |
| Trivial mutation | typo, tiny formatting or config correction | Resume only when context matters; validate; journal only if durable project state changed |
| Meaningful mutation | feature, fix, migration, behavioral change | Resume; plan when warranted; implement; validate; journal |
| Durable knowledge | research, decision, canonical documentation | Resume; use the matching supporting skill; journal when work state changed |

Classification requires semantic judgment. File changes alone do not establish
that a task was meaningful.

## Start checkpoint

- If the user says `journal: off`, skip ambient journal reads and writes for the
  request unless another explicit instruction requires them.
- If the resolved journal root's `state.json` selects active work, use `resume`
  when historical context can affect the result.
- If no active work exists and the request clearly starts a new durable work
  stream, use `init-work`. Ask only when its identity or scope is materially
  ambiguous.
- Do not create a work item for a read-only question or incidental edit.

## Plan threshold

Use `plan` before implementation when the work has multiple dependent phases,
meaningful design choices, risky migration behavior, cross-component effects,
or a validation strategy that should survive the current conversation.

Skip a durable plan for changes that are local, obvious, reversible, and easy to
validate. Existing user-approved plans do not need another plan.

## Work checkpoint

- Use `research-codebase` or `research-web` only when the findings should remain
  durable evidence.
- Use `decision` when an accepted choice and its rationale constrain later work.
- Use `document` for a durable synthesized reference.
- Never copy semantic write logic into an orchestration hook or adapter.

## Closure checkpoint

Before the final response:

1. Decide whether meaningful journal state changed.
2. If it did, use `journal` once after validation and reference supporting
   entries actually used.
3. Check the latest spine entry before writing. Update or skip when a new entry
   would describe the same completed outcome.
4. If validation failed, record the accurate partial or blocked state rather
   than claiming completion.
5. End the response with one status marker defined in root `AGENTS.md`.

`closed` requires a repository-relative path to an existing spine entry.
`not-needed` means the task was read-only or too small to change durable state.
`off` means the user explicitly opted out for the request.

## Hook boundary

Harness hooks may:

- inject these workflow reminders;
- report active-work metadata;
- validate the final status marker and referenced entry;
- request at most one additional closure pass.

Hooks must not create work items, plans, research, decisions, documents, or
journal entries. They must safely no-op when the journal is absent and must not
read unstable transcript formats to infer work.

## Failure behavior

- A hook failure warns but does not replace journal safety or state rules.
- A missing or invalid active state uses the bounded error from `STATE.md` when
  a semantic write is required.
- An unsupported, disabled, or untrusted hook falls back to these instructions.
- The hook-provided `stop_hook_active` guard permits only one continuation pass.
