---
name: journal-workflow
description: Coordinate the default-on filesystem journal workflow by classifying a request and composing existing resume, plan, research, decision, document, and journal skills. Use for meaningful implementation, durable research or documentation, accepted decisions, migrations, or material status changes that should preserve project context without requiring the user to invoke journal steps manually.
---

# Coordinate the journal workflow

Use this skill as an orchestrator. Do not duplicate the writing rules owned by
the underlying journal skills.

## Load policy

1. Read `.agents/rules/AUTOMATION.md` completely.
2. Read `.agents/rules/STATE.md` before any write.
3. Load other journal rules only through the selected underlying skill.

## Classify

- Honor `journal: off` and finish with `<!-- journal-status: off -->`.
- For read-only work, use `recall` or `resume` only when history matters. Do not
  write an entry; finish with `<!-- journal-status: not-needed -->`.
- For trivial mutations, validate directly. Journal only when durable project
  state changed.
- For meaningful mutations or durable knowledge work, follow the checkpoints.

## Run checkpoints

1. **Start:** use `resume` when active-work history can affect the task. Use
   `init-work` only for an unambiguous new durable work stream.
2. **Plan:** use `plan` for multi-phase, risky, cross-component, or
   decision-heavy implementation. Do not plan again when an accepted plan exists.
3. **Support:** route durable evidence to `research-codebase`, `research-web`,
   `decision`, or `document` as appropriate.
4. **Implement and validate:** make the requested changes and gather bounded,
   deterministic evidence.
5. **Close:** check the latest spine entry for duplication, then use `journal`
   once when meaningful state changed.

## Finish

- After a successful close, verify the new spine path and end the response with
  `<!-- journal-status: closed <relative-entry-path> -->`.
- If no close was warranted, end with `<!-- journal-status: not-needed -->`.
- Never claim closure when the referenced file does not exist.
- Do not expose the marker as explanatory prose; leave it as the final line.
