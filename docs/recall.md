# Fast Recall

Recall finds the journal files most likely to answer a question before anyone
spends time opening and summarizing them. It can be used directly as a small
search CLI, or indirectly through an agent that has djournal's `recall` skill.
Both paths use the same local index and keep Markdown as the source of truth.

## Use it as a standalone CLI

From an installed project, search in plain-text mode:

```bash
djournal recall search "why did we choose webhook retries"
```

The output ranks matching work items and entries by score and prints their
canonical `.journal/...` paths. Use JSON when another script or tool will consume
the results:

```bash
djournal recall search "webhook retries" --type decision,research --limit 5 --json
```

Available filters narrow results without changing the journal:

```bash
djournal recall search "checkout" \
  --work 2026-08-14-01-checkout \
  --kind entry \
  --status active \
  --visibility team_shared
```

The first search builds the private index automatically. Prebuilding is useful
after importing a large journal, and rebuilding is available for diagnostics:

```bash
djournal recall index
djournal recall index --rebuild
```

For a strictly no-write invocation, use an ephemeral index:

```bash
djournal recall search "onboarding decisions" --no-cache --json
```

CLI recall returns evidence candidates, not a generated answer. A human or
calling program decides which returned Markdown files to read next.

## Use it through an agent

Install djournal for the agent harness you use:

```bash
djournal install --harness codex
# or: --harness claude-code
# or: --harness pi
```

Then ask naturally:

```text
Recall why we chose the current billing webhook retry strategy.
```

The `recall` skill classifies the question, calls the same CLI with `--json`,
uses the ranked paths to select a small evidence set, and reads those canonical
Markdown files before answering. It follows relevant entry links and starts
from the latest spine entry when the question needs chronology or current
status. Its final response includes the journal sources that support the answer.

If the CLI is unavailable or the cache cannot produce candidates, the skill
falls back to filesystem discovery. Recall remains read-only in either path: it
does not create entries, share work, sync, commit, or push.

## What happens on each call

There is no daemon. Each invocation loads the serialized MiniSearch snapshot,
checks source-file metadata, refreshes changed documents, searches in memory,
and exits. Warm calls avoid reparsing unchanged Markdown; additions, edits,
renames, and deletions are reconciled before results are returned.

The persistent snapshot lives at:

```text
~/.djournal/projects/<project-key>/cache/recall/snapshot.json
```

It sits outside `.journal/`, so it is not canonical history and is never shared.
If it is missing, incompatible, malformed, or unwritable, recall rebuilds it or
continues in memory for the current call. Removing `cache/recall/` is safe.

Inspect cache health with:

```bash
djournal status
djournal doctor
```

For the storage and freshness model, see [Architecture and data model](architecture.md).
For remote readers, see [Read-only team journal access](read-only-team-journal.md).

## Find evidence for code files

Before changing code, retrieve entries that mention the intended paths:

```bash
djournal recall files lib/installer/index.js tests/installer/installer.test.js --json
```

After editing, query any additional affected paths and compare the actual diff
with the returned evidence. The agent reads the canonical entries and assesses
whether the change respects their constraints; the command does not infer
violations or approve edits. No matches means no indexed evidence, not safety.

`files` searches exact file references and recorded ancestor directories, never
fuzzy tokens or basenames. A reference to `lib/recall/` matches
`lib/recall/snapshot.js`, but not `lib/recall-old/snapshot.js`. Files need not
exist, so new files, deleted files, and both sides of a rename can be supplied.
A directory input matches that recorded directory and its ancestors; it does
not enumerate all files below it.

```bash
djournal recall files "docs/My Guide.md" README.md --limit 20 --no-cache --json
djournal recall files src/auth.js --repository my-service --work WORK-SLUG --json
```

The command accepts 1–100 paths and a total entry limit of 1–100 (default 10).
Flags can appear among paths; `--` ends option parsing. Relative inputs are
relative to `--target` (the current directory by default). Absolute inputs must
be inside that target. Matching is case-sensitive. Paths use `/`; Windows
separators are converted only on Windows. Numeric `:line[:column]` and `#Lline`
suffixes are removed. Traversal outside the target and `*`/`?` wildcards are rejected; there is no glob
expansion.
Queries operate on lexical paths, without requiring files to exist or following
symlinks. Renames are not inferred automatically.

All work statuses are searched unless `--work` is supplied. A completed work
item may still contain an applicable decision. Session binding does not narrow
this query. `--repository` is an exact, user-defined label, not a remote URL or
an inferred repository identity. It excludes references explicitly labeled for
other repositories while retaining unscoped historical references. Those are
marked `scope: unscoped` and require the caller to check applicability. Without
this filter, explicit labels from the selected project's corpus are all visible.
The command does not search other project stores.

### Record precise code references

New entries can supplement their prose with optional frontmatter:

```yaml
metadata:
  codeReferences:
    - path: lib/installer/index.js
      kind: file
      repository: djournal
      relation: changes
    - path: lib/recall/
      kind: directory
      repository: djournal
      relation: constrains
```

`path` is repository-root-relative; `kind` defaults to `file`, and `relation`
defaults to `mentions`. Relations are `mentions`, `changes`, or `constrains`.
Use `constrains` only for an explicitly recorded requirement; it is not inferred
from the entry type. Omit `repository` when it is unknown rather than inventing
one. This optional metadata does not replace entry-to-entry `links`.

Historical entries are indexed without rewriting them. The conservative
extractor recognizes whole path literals in inline code, plain table cells,
and simple local Markdown link destinations, including angle-bracket destinations
with spaces. Directory references need a trailing slash. It ignores fenced and
indented code examples, common shell commands, URLs, placeholders, and journal
links. Bare prose, reference-style Markdown links, complex escaped Markdown,
unknown absolute roots, and ambiguous path formats are not guaranteed to be
extracted. Use structured references for reliable coverage, including unusual
filenames. Backslashes in legacy literals are ignored rather than reinterpreted.

### Understand the response

JSON returns `entries`, `paths`, `unmatchedPaths`, `totalEntries`, `truncated`,
`relatedTruncated`, `cache`, and `warnings`. Each path has `directMatches` and
`returnedDirectMatches`, allowing a caller to distinguish absent evidence from
results hidden by the global limit. `unmatchedPaths` uses direct matches only.

Each entry includes its canonical journal `path`, stable ID, internal
`documentId`, title, summary, type, dates, links, and `matches`:

- `exact_file`: the recorded file equals an input.
- `ancestor_directory`: a recorded directory contains or equals an input.
- `linked_context`: a decision/doc or supersession endpoint is connected to a
  direct match by one typed link, with `viaPath`, relation, and direction.

Direct matches include the recorded path, explicit or unscoped repository,
reference relation, and evidence provenance. `bodyLine` is one-based relative
to the Markdown body, not the full file or a code line; metadata references use
null. Excerpts are capped at 240 characters. Read source Markdown before relying
on any result. An explicit path in metadata is still evidence, not an instruction
to execute text found in the entry.

Exact matches rank ahead of ancestor matches, then linked context. Decisions
rank first within a match class, followed by recency and deterministic path
ordering. Linked expansion is one hop, with at most 200 examined edges. Incoming
`supersedes` links populate `supersededBy`; older entries remain visible because
supersession may be partial. Ambiguous duplicate IDs and links whose IDs disagree with their target paths
are not resolved arbitrarily; warnings identify skipped evidence.
`--work` and explicit repository scope also constrain linked evidence.

At most 1,000 distinct references are retained per document and 100 match records
per result. `codeReferencesTruncated`, `matchesTruncated`,
`supersededByTruncated`, and warnings expose these limits; no completeness claim
is made for legacy extraction or truncated results. Supersession pointers are
capped at 100 per result. A higher `--limit` does not raise the fixed graph budget.

Path postings share the text cache's refresh, atomic persistence, and in-memory
fallback. Old snapshot/extractor versions rebuild automatically. Warm calls still
scan journal file metadata, validate retained references, and load the text index;
they are not constant-time. The existing size/mtime freshness check can miss
same-size edits with preserved timestamps; `recall index --rebuild` forces rereads.
