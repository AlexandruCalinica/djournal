# djournal Workflow

This repository uses the journal root resolved by `.agents/rules/STATE.md` as
durable project memory and `.agents/` as the journal's rules and skills.
Markdown is the source of truth. If `.djournal.json` exists, the canonical
journal root is the configured global store, not the local `.journal/` scaffold.

For every request:

1. Honor an explicit `journal: off` instruction for that request.
2. Classify the work using `.agents/rules/AUTOMATION.md`.
3. Use `.agents/skills/journal-workflow/SKILL.md` for meaningful mutations,
   durable research, decisions, documentation, or material status changes.
4. Do not force a plan or journal entry for read-only or trivial work.
5. Before the final response, close meaningful changed state through the
   existing journal skills. Hooks never write entries.

End every final response with exactly one hidden status marker:

- `<!-- journal-status: closed <relative-entry-path> -->`
- `<!-- journal-status: not-needed -->`
- `<!-- journal-status: off -->`

Use `closed` only after verifying that the referenced spine entry exists. Keep
the marker as the final line so optional harness hooks can validate closure.
