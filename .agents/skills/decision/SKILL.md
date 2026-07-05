---
name: decision
description: Record a clear technical or product decision as a standalone canonical supporting entry and link its evidence. Use when an option has been chosen, rationale must be preserved, or a prior decision is explicitly superseded.
---

# Record a decision

Record an actual choice, not an unresolved discussion. If the decision, selected
option, or rationale is unclear, ask for the missing information before writing.

## Load context

1. Read completely:
   - `.agents/rules/JOURNAL.md`
   - `.agents/rules/METADATA.md`
   - `.agents/rules/LINKS.md`
   - `.agents/rules/SAFETY.md`
   - `.agents/rules/STATE.md`
2. Resolve active work and read `work.md`.
3. Read only the relevant plan, implementation, research, docs, and earlier
   decisions. Identify the evidence and any decision being replaced.

## Create the decision

1. Confirm:
   - context and problem
   - options considered
   - chosen option
   - rationale and tradeoffs
   - consequences and follow-up
2. Select the next daily sequence in `decisions/`.
3. Generate an `ent_` UUIDv7, resolve identity, and capture one UTC timestamp.
4. Write `decisions/YYYY-MM-DD-NN-decision-<topic>.md` with:
   - exact entry frontmatter from `METADATA.md`
   - `entryType: decision`
   - no `entryNumber`
   - `source: manual`
   - useful one- or two-sentence `summary`
   - identical `createdAt` and `updatedAt`
5. Add outgoing links:
   - `references` for research/docs supporting the rationale
   - `supersedes` from this decision to an explicitly replaced decision
   - `relates_to` only for a genuine evolution without replacement
6. Use this body:

   ```markdown
   # Decision: <Title>

   ## Context
   ## Options Considered
   ## Decision
   ## Rationale
   ## Consequences
   ## Validation / Evidence
   ## Follow-Up
   ```

## Link from the spine

When an existing spine entry clearly owns this decision:

1. Add an outgoing `references` link from that spine entry to the new decision.
2. Preserve its `id` and `createdAt`; update its `updatedAt`.
3. Leave its body intact except for an optional concise pointer. Never rewrite
   the body wholesale.

If no unique owning spine entry exists, leave the decision temporarily orphaned
and report that audit/reconcile will flag it. Do not guess.

## Verify

Re-read all modified files. Validate IDs, timestamps, link direction, target
paths, visibility inheritance, and redaction. Return the decision path and links
created.
