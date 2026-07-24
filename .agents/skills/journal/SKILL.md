---
name: journal
description: Write a canonical journal entry for meaningful work completed in the current session. Use at the end of implementation, investigation, or a material status update.
---

# Journal completed work

Record what actually happened. Do not use the entry to speculate or inflate
progress.

## Load context

1. Read completely:
   - `.agents/rules/JOURNAL.md`
   - `.agents/rules/METADATA.md`
   - `.agents/rules/LINKS.md`
   - `.agents/rules/SAFETY.md`
   - `.agents/rules/STATE.md`
2. Resolve the journal root according to `STATE.md`; read `<journal-root>/state.json`,
   then the active work item's `work.md`. Stop according to `STATE.md` if
   unavailable.
3. Read the latest spine entry and its project timeline when present.
4. Identify research, docs, and decisions actually used this session.
   Include recalled journal entries when recall materially affected the work
   being closed.

## Gather evidence

Gather only facts relevant to the current session:

- files changed and concise change summaries
- validation commands, results, counts, and short redacted failure excerpts
- recalled entry paths and IDs that materially confirmed, contradicted,
  clarified, or superseded this session's work
- decisions and rationale
- commits and branch when Git is available
- blockers, open questions, and concrete next steps

Handle non-Git directories gracefully. Follow `SAFETY.md`: do not capture full
diffs, transcripts, environment dumps, secrets, or unbounded command output.

## Classify and create

1. Use `entryType: implementation` when work changed artifacts or behavior.
2. Use `entryType: status` when recording state, validation, blockers, or an
   outcome without implementation changes.
3. Select the next daily filename sequence in `journal/` and next best-effort
   spine `entryNumber`. Never repair historical numbering here.
4. Generate an `ent_` UUIDv7, resolve identity, and capture one UTC timestamp.
5. Write `journal/YYYY-MM-DD-NN-<focus>.md` with the exact entry frontmatter:
   - active `workItemId`
   - inferred `entryType`
   - `source: manual`
   - accurate one- or two-sentence `summary`
   - identical `createdAt` and `updatedAt`
6. Add outgoing `references` links only to entries actually used, including
   recalled spine or supporting entries that materially affected the session.
   Add `relates_to` or `supersedes` only when their semantics are explicit.
7. Use this body, omitting empty optional sections:

   ```markdown
   # Entry <N>: <Title>

   ## Project Timeline
   <Previous timeline plus this entry.>

   ## Current State
   ### Components Status

   ## Work Done This Session
   ### <Area>

   ## Key Implementation Details

   ## Decisions

   ## Validation
   | Command | Result | Notes |

   ## Files Modified
   | File | Changes |

   ## Research and Docs Used

   ## Open Questions / Blockers

   ## Next Steps

   ## Commits This Session
   ```

8. Preserve the latest-entry index and compact its timeline according to
   `JOURNAL.md` when necessary.
9. Re-read and verify every factual claim, frontmatter field, link target, and
   redaction before presenting the path.

## Constraints

- Document only the current logical session.
- Do not claim tests passed unless they were run successfully.
- Do not create standalone decision entries implicitly; use `decision` when the
  rationale deserves durable supporting context.
- Keep the entry concise and evidence-backed.
