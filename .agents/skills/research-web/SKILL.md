---
name: research-web
description: Research a current external topic on the internet and write a sourced canonical supporting entry. Use for official documentation, standards, libraries, best practices, examples, or other temporally unstable external knowledge relevant to active work.
---

# Research the web

Every factual finding must be traceable to a fetched source. Do not substitute
memory for browsing and do not fabricate URLs.

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
4. Search current sources. For technical topics, prioritize official
   documentation, specifications, primary research, and original repositories.
5. Cover only relevant areas such as:
   - core concepts and current behavior
   - official APIs or standards
   - production examples
   - recommended patterns and documented pitfalls
6. Record the actual queries and direct source URLs. Cross-check consequential
   claims. Respect source quotation limits and summarize instead of copying.
7. Use sub-agents only when explicitly allowed by the current user and
   collaboration policy.

## Create the supporting entry

1. Select the next daily sequence in `_research/`.
2. Generate an `ent_` UUIDv7, resolve identity, and capture one UTC timestamp.
3. Write `_research/YYYY-MM-DD-NN-web-<topic>.md` with:
   - exact entry frontmatter from `METADATA.md`
   - `entryType: research`
   - no `entryNumber`
   - `source: manual`
   - sourced one- or two-sentence `summary`
   - identical `createdAt` and `updatedAt`
4. Add outgoing links only when this research explicitly depends on another
   journal artifact.
5. Use this body:

   ```markdown
   # Web Research: <Topic>

   ## Research Question
   ## Summary
   ## Key Resources
   | Resource | Type | URL | Relevance |

   ## Detailed Findings
   ### <Area>

   ## Code Examples
   ## Best Practices
   ## Common Pitfalls
   ## Official Documentation
   ## Sources
   ## Search Queries Used
   ## Open Questions
   ```

6. Put citations next to the claims they support and retain a deduplicated source
   table. Re-read every URL and frontmatter field before presenting the result.

Return a concise findings summary and the created path.
