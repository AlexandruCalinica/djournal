# Journal Entry Rules

Read these rules together with:

- `.agents/rules/METADATA.md`
- `.agents/rules/LINKS.md`
- `.agents/rules/SAFETY.md`

Markdown remains the source of truth. Every new entry MUST contain valid
canonical frontmatter followed by a concise, human-readable body.

## Entry locations and roles

Role is derived from `entryType`; never store a separate `role` field.

| Directory | Entry types | Derived role |
| --- | --- | --- |
| `journal/` | `plan`, `implementation`, `status`, `manual` | spine |
| `_research/` | `research` | supporting |
| `docs/` | `doc` | supporting |
| `decisions/` | `decision` | supporting |

Supporting entries stand alone and are linked from spine or other supporting
entries. They do not add independent steps to the project timeline.

## Filenames

- Spine: `YYYY-MM-DD-NN-brief-description.md`
- Codebase research: `YYYY-MM-DD-NN-codebase-topic.md`
- Web research: `YYYY-MM-DD-NN-web-topic.md`
- Documents: `YYYY-MM-DD-NN-topic.md`
- Decisions: `YYYY-MM-DD-NN-decision-topic.md`

`NN` is the next sequence within the destination directory for that UTC date.
Filenames are descriptive, lowercase kebab-case. Entry identity comes from the
stable `ent_` UUIDv7, not the filename or entry number.

## Required spine body

Every spine entry MUST include these sections, adapted to its entry type:

### Project Timeline

A chronological index of the work item's spine. Supporting entries appear only
as links from the relevant spine entry.

### Current State

- components and their working/partial/broken status
- validation status with real counts when available
- key files and their current purpose

For a plan entry, this may be named `Current State Analysis`.

### Work Done This Session

- specific work performed
- problems resolved
- decisions made and why
- deterministic evidence such as paths, commits, and validation results

For a plan entry, replace this with the feature overview, proposed design, and
phased implementation plan. Do not claim planned work was implemented.

### Next Steps

- concrete actions in priority order
- known blockers and unresolved questions

Include architecture notes only when architecture changed or the plan proposes
an architectural change. Keep diagrams small and useful.

## Type-specific content

- `plan`: problem, goals, non-goals, current state, design, phases, tests, edge
  cases, open questions, and next steps
- `implementation`: changes, rationale, files, validation, commits, current state,
  and next steps
- `status`: current state, evidence, blockers, and next steps; no invented work
- `manual`: user-supplied or exceptional spine note following the core sections
- `research`: question, summary, sources/key files, findings, and open questions
- `doc`: standalone synthesized reference with source links
- `decision`: context, options, decision, rationale, consequences, and supersession

## Frontmatter and links

- Follow `METADATA.md` exactly.
- New output MUST have a useful one- or two-sentence `summary`.
- Skill-created files use `source: manual`.
- Entry `workItemId` MUST match the active work item's `work.md`.
- Store outgoing typed links according to `LINKS.md`.
- A human-readable body citation may accompany a structured link but does not
  replace it.
- On edits, preserve `id` and `createdAt`; update `updatedAt`.

## Project timeline and compaction

The latest spine entry is the primary retrieval index.

- Recent entries may be listed individually.
- Older entries may be summarized into chronological milestone ranges when the
  timeline threatens the 100-200 line target.
- Keep decisions, regressions, releases, and major architecture changes visible
  as individual milestones regardless of age.
- Preserve entry numbers as recorded, including historical forks or gaps.
- Never delete or rewrite original entries as part of compaction.
- The timeline must still let a reader locate detailed source entries.

## Evidence and safety

- Include real file paths, commit hashes, PRs, commands, and test counts when known.
- Do not fabricate line numbers, test results, commits, or links.
- Prefer summaries and diff statistics over full diffs.
- Truncate failure output to the smallest useful redacted excerpt.
- Follow `SAFETY.md` before every write.

## Legacy entries

Markdown without frontmatter remains valid historical input. Infer metadata
best-effort from its directory, filename, and first heading. Do not block resume
or recall. Audit reports missing metadata; reconcile may add it conservatively
without rewriting the body or renumbering the entry.

## Compactness

Target 100-200 lines for a spine entry. Supporting entries may be longer when
the topic requires it, but should synthesize rather than dump source material.
