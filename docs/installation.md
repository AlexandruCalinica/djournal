# Installation and Repository Layouts

djournal can be installed globally and then added to each project that should
carry journal memory.

## Recommended install

```bash
npm install -g djournal
```

Then run the installer from the repository or journal workspace you want to
equip:

```bash
djournal install
```

The package exposes both `djournal` and `journal` commands. They point to the
same CLI.

## No global install

Use `npx` when you want a one-off install without adding a global command:

```bash
npx djournal install
```

## Single-repository setup

Use this when one product repository owns the work and `.journal/` should live
beside the code:

```bash
cd my-product
djournal install
```

This installs:

- shared journal rules and skills under `.agents/`
- harness-specific hook config when selected
- managed instruction blocks in `AGENTS.md` and/or `CLAUDE.md`

The durable journal entries live under `.journal/work/...`.

## Multi-repository setup

Use a standalone journal repository when one work stream spans several code
repositories:

```bash
mkdir my-product-journal
cd my-product-journal
git init
djournal install --all
```

Keep the journal repository as a sibling of the product repositories:

```text
workspace/
  product-api/
  product-web/
  product-mobile/
  my-product-journal/
    .journal/
    .agents/
```

Agents should run from the journal repository when they need durable cross-repo
memory. Journal entries can still reference paths and commits in the sibling
code repositories.

## Harness selection

Install for one harness:

```bash
djournal install --harness codex
djournal install --harness claude-code
```

Install for multiple harnesses:

```bash
djournal install --harness codex,claude-code
```

Install every supported harness:

```bash
djournal install --all
```

Install only the portable instructions and journal skills:

```bash
djournal install --instructions-only
```

## Useful checks

```bash
djournal status
djournal doctor
```

`status` reports installed files and cleanliness. `doctor` checks the local
environment and harness configuration.

## Related docs

- [Remote Git sync setup](remote-sync.md)
- [Uninstalling and reinstalling](uninstalling.md)
