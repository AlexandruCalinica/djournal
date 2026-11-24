---
name: journal-document
description: Synthesize existing journal, codebase research, and web research into a concise canonical supporting document. Use when the user asks for a durable technical decision aid, how-to, walkthrough, tutorial, or architecture reference.
---

# Synthesize a document

Distill and connect evidence; do not concatenate source material.

## Load sources

1. Require a topic and infer the document form: decision aid, how-to,
   walkthrough, tutorial, or architecture reference.
2. Read completely:
   - `.agents/rules/JOURNAL.md`
   - `.agents/rules/METADATA.md`
   - `.agents/rules/LINKS.md`
   - `.agents/rules/SAFETY.md`
   - `.agents/rules/STATE.md`
3. Resolve active work and read `work.md`.
4. List `_research/`, `docs/`, `decisions/`, and recent spine entries. Read all
   sources directly relevant to the topic, within a bounded context budget.
5. If no adequate research exists, state the gap. Continue only when journal
   context is sufficient; otherwise recommend the appropriate research skill.

## Synthesize

- Reconcile codebase reality with external findings.
- Retain source attribution and note unresolved contradictions.
- Produce a standalone reference shorter than its inputs.
- Do not turn a decision aid into a recorded decision; use `journal-decision` after an
  option is actually chosen.

## Create the supporting entry

1. Create the file with `djournal entry new --work <slug> --type doc --title "<title>" --summary "<summary>" --name <topic>`.
   Edit that store path only. Do not write into a sync checkout.
2. Confirm the created frontmatter has:
   - exact entry frontmatter from `METADATA.md`
   - `entryType: doc`
   - no `entryNumber`
   - `source: manual`
   - useful one- or two-sentence `summary`
   - identical `createdAt` and `updatedAt`
4. Add outgoing `references` links to every journal artifact materially used,
   following `LINKS.md`. Do not add links for files only skimmed.
5. Use only sections appropriate to the inferred document form:

   ```markdown
   # <Title>

   ## Overview
   ## Context
   ## Findings
   ### From the Codebase
   ### From External Research
   ### Gap Analysis

   ## <Type-specific main content>
   ## FAQ
   ## Sources
   ## Open Questions
   ```

6. Re-read the document. Verify that every important claim is supported, links
   resolve, frontmatter is valid, and sensitive content is absent.

Return the document type, concise summary, and created path.
