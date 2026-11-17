# djournal Workflow

This repository uses the journal root resolved by `.agents/rules/STATE.md` as
durable project memory and `.agents/` as the journal's rules and skills.
Markdown is the source of truth. If `.djournal.json` exists, the canonical
journal root is the configured global store, not the local `.journal/` scaffold.

For every request:

1. Honor an explicit `journal: off` instruction for that request.
2. Classify the work using `.agents/rules/AUTOMATION.md`.
3. Load `journal-workflow` for meaningful mutations, durable research,
   decisions, documentation, or material status changes. Invoke the exact skill
   name through the harness skill tool when available; otherwise read
   `.agents/skills/journal-workflow/SKILL.md` and follow it.
4. Do not force a plan or journal entry for read-only or trivial work.
5. Before the final response, close meaningful changed state through the
   existing journal skills. Hooks never write entries.

Journal skills use the `journal-*` namespace. Route project continuity to
`journal-resume`, past decisions/history to `journal-recall`, and work meeting
the planning threshold to `journal-plan`. Load the selected skill before its
work; native conversation resume, auto memory, and plan mode do not perform
these journal procedures. Use native tools alongside the journal as useful.
After compaction or a work switch, reload journal context only as needed.

End every final response with exactly one hidden status marker:

- `<!-- journal-status: closed .journal/work/<slug>/journal/<entry>.md -->`
- `<!-- journal-status: not-needed -->`
- `<!-- journal-status: off -->`

Closed marker paths are always repository-relative logical `.journal/...`
paths. In global-store projects, hooks resolve that prefix through
`.djournal.json`. Use `closed` only after verifying that the referenced spine
entry exists. Keep the marker as the final line so optional harness hooks can
validate closure.
