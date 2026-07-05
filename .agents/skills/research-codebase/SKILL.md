---
name: research-codebase
description: Research and document how a topic currently works in the codebase, producing a canonical supporting entry. Use for implementation maps, integration analysis, type discovery, usage patterns, tests, and dependencies before planning or changing code.
---

# Research the codebase

Document what exists. Do not propose improvements, diagnose causes, or implement
changes unless the user separately requests those actions.

## Procedure

1. Require a concrete topic.
2. Read completely:
   - `.agents/rules/JOURNAL.md`
   - `.agents/rules/METADATA.md`
   - `.agents/rules/LINKS.md`
   - `.agents/rules/SAFETY.md`
   - `.agents/rules/STATE.md`
3. Resolve active work and read `work.md`. Stop according to `STATE.md` when no
   active work exists.
4. Break the topic into relevant areas:
   - core implementation
   - types and schemas
   - callers and usage patterns
   - tests and fixtures
   - internal and external dependencies
5. Search with `rg`/`rg --files`, then read the smallest relevant file sections.
   Use sub-agents only when explicitly allowed by the current user and
   collaboration policy.
6. Record exact paths and line numbers. Distinguish verified facts from unclear
   areas. Do not include secrets or large source excerpts.

## Create the supporting entry

1. Select the next daily sequence in `_research/`.
2. Generate an `ent_` UUIDv7, resolve identity, and capture one UTC timestamp.
3. Write `_research/YYYY-MM-DD-NN-codebase-<topic>.md` with:
   - exact entry frontmatter from `METADATA.md`
   - `entryType: research`
   - no `entryNumber`
   - `source: manual`
   - accurate one- or two-sentence `summary`
   - identical `createdAt` and `updatedAt`
4. Add outgoing links only when this research explicitly relies on another
   journal artifact. The future plan/implementation entry that uses this
   research should link to it; do not invent that incoming link early.
5. Use this body:

   ```markdown
   # Codebase Research: <Topic>

   ## Research Question
   ## Summary
   ## Key Files
   | File | Purpose | Lines |

   ## Detailed Findings
   ### <Area>

   ## Type Definitions
   ## Usage Patterns
   ## Tests
   ## Dependencies
   ## Architecture Notes
   ## Open Questions
   ```

6. Re-read the file. Verify frontmatter, paths, line references, safety, and that
   findings describe current reality rather than recommendations.

Return a concise summary and the created path.
