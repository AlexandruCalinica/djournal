---
name: plan
description: Design a concrete unit of work and write a canonical plan entry before implementation. Use for features, fixes, migrations, or improvements that need a durable phased plan.
---

# Plan work

This skill produces a plan entry only. Do not implement source changes while
using it.

## Load context

1. Read completely:
   - `.agents/rules/JOURNAL.md`
   - `.agents/rules/METADATA.md`
   - `.agents/rules/LINKS.md`
   - `.agents/rules/SAFETY.md`
   - `.agents/rules/STATE.md`
2. Read `.journal/state.json`, then the active work item's `work.md`. Stop with
   the `STATE.md` error if active work is unavailable.
3. Read the latest spine entry when present. Its timeline is the primary index.
4. List `_research/`, `docs/`, and `decisions/`; read only files relevant to the requested plan.
5. If essential codebase context is absent, invoke `research-codebase` first.
   Use sub-agents only when the current collaboration policy and user allow it.

## Analyze

Establish:

- problem and concrete outcomes
- goals and non-goals
- current code and conventions
- components and integration points
- data structures and non-obvious logic
- failure modes and edge cases
- validation and rollout checkpoints
- unresolved decisions

Use file and line references that were actually inspected. Do not claim planned
work already exists.

## Create the entry

1. Select the next daily filename sequence in `journal/`.
2. Select the next best-effort spine `entryNumber`. Preserve existing gaps,
   forks, and duplicates; never renumber history.
3. Generate an `ent_` UUIDv7, resolve identity, and capture one UTC timestamp.
4. Write `journal/YYYY-MM-DD-NN-plan-<topic>.md` with:
   - exact entry frontmatter from `METADATA.md`
   - `entryType: plan`
   - `source: manual`
   - a useful one- or two-sentence `summary`
   - identical `createdAt` and `updatedAt`
5. Add outgoing `references` links for research/docs actually used. Each link
   must satisfy `LINKS.md`; do not link merely because a file exists.
6. Use this body:

   ```markdown
   # Entry <N>: Plan - <Title>

   ## Project Timeline
   <Previous timeline plus this plan.>

   ## Feature Overview
   ### Problem Statement
   ### Goals
   ### Non-Goals

   ## Current State Analysis
   ### Relevant Existing Code
   ### Patterns to Follow
   ### Integration Points

   ## Proposed Design
   ### Architecture
   ### New Components
   ### Modified Components
   ### Data Structures
   ### Key Algorithms / Logic

   ## Implementation Plan
   <Phased checklists with verifiable checkpoints.>

   ## Testing Strategy
   ## Edge Cases and Error Handling
   ## Open Questions
   ## Next Steps
   ```

7. Keep the entry within the journal compactness rules. Apply timeline
   compaction when needed without modifying earlier entries.
8. Re-read the file and verify frontmatter, links, safety, and that the plan does
   not contain implementation claims.

## Output

Return a concise plan summary and the created path. Ask for approval before
implementation unless the user already authorized implementation.
