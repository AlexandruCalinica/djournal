# Uninstalling and Reinstalling

Uninstall removes djournal tooling from selected harnesses while preserving
durable journal history.

## Uninstall everything

```bash
djournal uninstall --all
```

or:

```bash
djournal uninstall
```

Full uninstall removes managed instruction blocks, copied rules/skills, hook
configuration owned by djournal, and installer metadata when it is safe to do
so.

## Uninstall one harness

```bash
djournal uninstall --harness codex
djournal uninstall --harness claude-code
```

## Uninstall multiple harnesses

```bash
djournal uninstall --harness codex,claude-code
```

Partial uninstall removes only the selected harness integration and keeps the
remaining harnesses installed.

## What remains durable

Uninstall preserves `.journal/` so work history can be revived later:

```text
.journal/
  state.json
  work/<work-item>/
```

That means plans, decisions, docs, research, implementation notes, and status
entries remain available for future recall.

## Reinstall later

```bash
djournal install --all
```

or select a harness:

```bash
djournal install --harness codex
```

Reinstalling restores local harness integration around the existing journal
history.

## Conflict behavior

djournal preserves user edits. If a managed file has been modified outside the
expected managed block or copied assets no longer match their installed hash,
upgrade or uninstall may refuse to rewrite that file automatically.

Use `djournal status` and `djournal doctor` to inspect the installation before
and after uninstalling.

## Related docs

- [Installation and repository layouts](installation.md)
- [Remote Git sync setup](remote-sync.md)
