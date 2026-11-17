---
name: journal-workflow
description: Coordinate djournal project memory for meaningful implementation, investigation, decisions, and status changes. Select and load the required journal-* skills for context, evidence, planning, and closure even when the user does not mention journaling.
---

# Coordinate the journal workflow

Use this skill as an orchestrator. Do not duplicate the writing rules owned by
the underlying journal skills.

## Load policy

1. Read `.agents/rules/AUTOMATION.md` completely.
2. Read `.agents/rules/STATE.md` before any write.
3. Load other journal rules only through the selected underlying skill.

## Select and load skills

Follow the intent routes and invocation contract in `AUTOMATION.md`. Invoke the
exact `journal-*` skill through the harness skill tool when available; otherwise
read `.agents/skills/<skill-name>/SKILL.md`. Do this before the selected work,
not merely by mentioning the skill or doing a CLI search.

- Continue or recover active work: `journal-resume` when journal context is
  needed and is not already loaded.
- Answer from past project decisions or history: `journal-recall` and its
  canonical evidence, even when native memory suggests an answer.
- Plan a multi-phase or risky change: `journal-plan` before implementation,
  unless an applicable accepted plan already exists.

Prompt hooks may append a `Recall glance`: up to five lexical journal candidates
for the current prompt. Scan it; read a listed entry only when its title or
summary bears on the request, and ignore the list otherwise. It does not replace
`journal-recall` for history questions, nor the code-change evidence checkpoint.

Native conversation resume, auto memory, and plan mode remain useful but do not
complete these journal steps. Preserve read-only restrictions and the existing
opt-out, trivial-work, and plan-threshold rules. No repeated invocation is needed
for unchanged skill instructions already loaded in this context.

## Classify

- Honor `journal: off` and finish with `<!-- journal-status: off -->`.
- For read-only work, use `journal-recall` or `journal-resume` only when history matters. Do not
  write an entry; finish with `<!-- journal-status: not-needed -->` unless
  recalled evidence materially affects current or closed work as described
  below.
- For trivial mutations, validate directly. Journal only when durable project
  state changed.
- For meaningful mutations or durable knowledge work, follow the checkpoints.

## Recall reinforcement

Keep `journal-recall` itself read-only. After a recall/resume answer, decide whether the
retrieved evidence materially affects current journal work before finalizing:

- Immaterial recall: answer from sources and finish `not-needed`.
- Current closure in progress: pass the recalled source entries to `journal-entry` so
  the new spine entry links them with `references`, `relates_to`, or
  `supersedes` as appropriate.
- Explicit current/closed target: use `journal-reinforce` to add conservative links or a
  follow-up spine entry.
- Accepted contradiction or replacement: use `journal-decision` or `journal-entry` to record
  the correction and link the recalled evidence.

Material evidence includes recalled sources that confirm a claim being recorded,
contradict or supersede an existing entry, change status or next steps, or are
explicitly requested by the user as evidence for current work.

Do not guess the owning target when several entries could apply. Ask for the
target or create a follow-up entry that states the ambiguity.

## Code-change evidence checkpoint

For meaningful code changes, once intended paths are known, batch them through
`djournal recall files <path>... --json` before editing. Read relevant canonical
entries and decisions; distinguish exact references, directory scope, linked
context, unscoped repositories, and superseded evidence. Completed work may still
supply governing decisions. Do not treat a missing match as approval.

After editing, query newly affected paths and compare the actual diff with the
retrieved constraints. Avoid repeated calls for unchanged path sets within the
same journal state, and do not add this ceremony to every file read or trivial
edit. If the command is unavailable, use text recall/canonical reads and state
the coverage limitation. Follow the existing decision workflow for an accepted
intentional replacement; hooks do not decide contradictions or write entries.
Pass materially used entries to the closing journal skill for typed citations.

## Run checkpoints

1. **Start:** use `journal-resume` when active-work history can affect the task. Use
   `journal-init-work` only for an unambiguous new durable work stream.
2. **Plan:** use `journal-plan` for multi-phase, risky, cross-component, or
   decision-heavy implementation. Do not plan again when an accepted plan exists.
3. **Support:** route durable evidence to `journal-research-codebase`, `journal-research-web`,
   `journal-decision`, `journal-document`, or `journal-reinforce` as appropriate.
4. **Implement and validate:** make the requested changes and gather bounded,
   deterministic evidence.
5. **Close:** check the latest spine entry for duplication, then use `journal-entry`
   once when meaningful state changed.

## Finish

- After a successful close, verify the new spine path and end the response with
  `<!-- journal-status: closed .journal/work/<slug>/journal/<entry>.md -->`.
- Always emit the logical repository-relative `.journal/...` path, including
  when `STATE.md` resolves the actual journal root through `.djournal.json`.
- If no close was warranted, end with `<!-- journal-status: not-needed -->`.
- Never claim closure when the referenced file does not exist.
- Do not expose the marker as explanatory prose; leave it as the final line.
