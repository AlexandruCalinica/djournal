---
name: journal-entry
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
   unavailable. The root must be the canonical store. If the current directory
   is a sync checkout, follow the projection marker back to the store and do
   not write there.
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
3. Create the file with the CLI so the id, date sequence, and directory are
   chosen in the canonical store:

   ```bash
   djournal entry new --work <slug> --type <entryType> --title "<title>" --summary "<summary>" --name <kebab-focus>
   ```

   The command writes `journal/YYYY-MM-DD-NN-<name>.md` under the store from
   `.djournal.json`, allocates the next free daily sequence, and sets an
   `ent_` UUIDv7. Edit that file only. Do not create a second copy by hand,
   and do not write under a sync checkout or a project-local `.journal` when
   `STATE.md` says the store lives elsewhere. Pass `--work` when this agent
   has no session binding.
4. Keep the command's frontmatter. When known, add `metadata.codeReferences`
   for meaningful changed files using `relation: changes`, or `mentions` for
   context-only references. Follow the optional code-reference contract in
   `METADATA.md`; do not invent repository labels or assert constraints from a
   changed-file list.
5. Add outgoing `references` links only to entries actually used, including
   recalled spine or supporting entries that materially affected the session.
   Add `relates_to` or `supersedes` only when their semantics are explicit.
6. Use this body, omitting empty optional sections:

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
- Do not create standalone decision entries implicitly; use `journal-decision` when the
  rationale deserves durable supporting context.
- Keep the entry concise and evidence-backed.
