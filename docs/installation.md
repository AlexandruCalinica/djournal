# Installation and Repository Layouts

djournal can be installed globally and then added to each project that should
carry journal memory. The installed project gets harness integration plus a
`.djournal.json` marker. The canonical journal content lives under
`~/.djournal/projects/<project-key>/`.

## Recommended install

```bash
npm install -g djournal
```

Then open the interactive journal from your repository or journal workspace:

```bash
djournal
```

The package exposes both `djournal` and `journal` commands. They point to the
same CLI.

## Interactive journal

Run `djournal` or `journal` without arguments in an interactive terminal.
`djournal setup` remains supported; use `djournal setup --target /path/to/project`
to open another project. Use the arrow keys and Enter to choose an option.

Each new question or menu replaces the previous screen. The project header stays
visible, and new results, errors, and confirmation details appear above the next
prompt until you continue. Returning from an editor redraws the entry picker.
A mark of two offset journal pages and a bookmark heads the wizard, beside the
djournal wordmark. Search, filters, and smaller terminals use a small document
symbol and the wordmark.
`TERM=dumb` uses an ASCII version of the mark.
Menus show short labels and details for the highlighted item; long paths wrap
instead of widening the menu. The list height adapts to the terminal size.
Color is optional: `NO_COLOR=1 djournal` uses plain text, and selection and
checkbox markers remain visible without color.

- **List:** choose a work item, then open an entry in your editor, share, pull, sync, or bind an active item to
  an agent session. Sharing marks the item; Sync copies it to the Git projection.
  If synchronization is disabled, the wizard offers configuration first.
- **Recall:** search journal knowledge across work items and open matching
  entries or work descriptions in your editor. Press Tab to adjust filters, or refresh/rebuild the search index from the Recall menu.
- **Status:** inspect the project's installation, integrations, and versions.
- **Install:** select Codex, Claude Code, Pi, Grok Bot, a custom combination, all
  supported integrations, or instructions only. After installation, configure the project.
  Existing integrations are retained on an already installed project.
- **Configure:** keep work local, share through the project repository, or use
  a separate existing journal Git repository. Set automatic sync for standalone
  mode and choose update notifications and their frequency. Current values are
  defaults; review the proposed changes before saving.
- **Upgrade:** refresh installed project assets with the installed CLI version.
- **Update:** run the existing `update check` operation. If a newer CLI is
  available, show the npm update command; the wizard does not install packages.
- **Doctor:** run the existing project health checks.
- **Uninstall:** remove one integration or all installed assets after confirmation.
  Journal history is kept; modified installed files are preserved and reported.

Press **Escape** to go back to the parent menu from any prompt. From a work's
actions it returns to the work picker; from the entry picker it returns to that
work's actions. In an unfinished install, configuration, or work action, Escape
discards the pending answers and returns to the menu that launched it. At the
main menu, Escape stays there. Completed operations remain applied.

Menus also have Back and Exit choices. Use Space to toggle integrations in the
checkbox list; detected integrations start selected. Enter accepts the current
selection or displayed default. Ctrl-C, Ctrl-D, or end-of-input cancels. Completed operations remain applied, while
configuration answers are saved only after confirmation. A failed operation
returns to the main menu with an error; the process exits with code 2 if an
operation failed, or 130 on cancellation.

The wizard requires terminal input and output. An argument-free invocation in a
pipe or script returns an interactive-terminal error instead of waiting for input.
The explicit `setup` command accepts only `--target` and `--help`.
All existing commands continue to work directly, including JSON and dry runs.
Use `djournal --help` for the command list.
For example, `djournal install --all` installs directly without the wizard.

### Recall from the wizard

Choose **Recall → Search journal** and start typing. Results update in place
after a 250 ms pause; you do not need to submit the query. Use Up/Down to select
a result and Enter to open its canonical Markdown file in your editor. Close
the editor to return to the same query and refreshed results. Both entries and
work descriptions are searched, including completed work; the current session binding does not silently restrict the search.

Keep typing to change the query. Press **Tab** at any time to open the filter
panel, including while results load. All filters appear together: work item,
result kind, entry type, work status, visibility, and maximum results per kind.
Use **Up/Down** to choose a field and **Left/Right** to adjust it. On the result
limit row, you can also type a number from 1 to 100. **Enter** applies the draft
and returns to the same query; **Escape** discards it. **Ctrl-R** resets the draft
to defaults, which you can apply or discard.

The search screen shows the current scope and a compact, paged list of matches.
Filter controls are separate from matches. Previous matches remain dimmed while
updating and cannot be opened until the new search finishes. Blank queries skip
searching; Tab still opens filters and Escape returns to Recall.

**Refresh index** updates the cache from the journal. **Rebuild index** recreates
it after confirmation. These use the same services as `djournal recall index`
and `djournal recall index --rebuild`; they do not rewrite journal entries.

### Open journal entries in your editor

Choose **List → a work item → Open entry in editor**. The picker lists journal,
research, documentation, and decision entries, newest first, with their dates,
types, titles, and filenames. It reads the canonical journal store configured by
`.djournal.json`, with support for legacy local journals. Sharing does not need
to be enabled.

The editor is selected from `$VISUAL`, then `$EDITOR`, falling back to `vi`
(`notepad` on Windows). For example:

```bash
export EDITOR='nano'
export VISUAL='vim -R'
djournal
```

Quoted executable paths and arguments are supported, such as
`VISUAL='"/path with spaces/editor" --wait'`. Commands run directly; shell aliases,
pipes, variable expansion, and other shell expressions are not evaluated. Use a
waiting mode such as `code --wait` for an editor that otherwise returns immediately.

Close the editor to return to the entry picker. The canonical Markdown file is
opened directly, so saving edits changes the journal; use your editor's read-only
flag if desired. The wizard does not rewrite entry metadata. If an editor cannot
start or exits unsuccessfully, the picker remains available for retry or Escape.

## No global install

Use `npx` when you want a one-off install without adding a global command:

```bash
npx djournal install
```

## Single-repository setup

Use this when one product repository owns the work:

```bash
cd my-product
djournal install
```

This installs:

- shared journal rules and skills under `.agents/`
- harness-specific hook config when a hook harness is selected
- a managed `.pi/extensions/djournal.ts` extension when Pi is selected
- a skill-only Journal Hub recipe and `.grokbot/` marker when Grok Bot is selected, with no hook config
- managed instruction blocks in `AGENTS.md` and/or `CLAUDE.md`
- `.djournal.json`, which points to the global project store
- for Claude Code installs, a narrow permission grant that lets the agent read
  and write this project's global journal store and run safe `journal`/`djournal`
  workflow commands

The durable journal entries live under
`~/.djournal/projects/<project-key>/.journal/work/...`.

## Harness permissions

Claude Code stores project permissions in `.claude/settings.json`, so
`djournal install --harness claude-code` and `djournal install --all` add this
project's exact global store path to `permissions.additionalDirectories` and
allow the safe `journal`/`djournal` commands used by the workflow. Uninstall
removes only the permission entries that djournal injected.

Codex sandbox permissions are controlled by the Codex runtime launch/config
rather than `.codex/hooks.json`. The installed Codex hook resolves the global
store through `.djournal.json`; if the Codex session is sandboxed, launch it
with the generated journal store path available as a readable/writable root.

Pi loads project `.agents/skills` and `.pi/extensions/` only after project
trust. In interactive Pi, use `/trust` and restart the session. For print, JSON,
or RPC runs without a stored trust decision, pass `--approve`. djournal does not
edit Pi's trust file. Pi itself is not a filesystem sandbox; external containers
or sandboxes must expose the global store referenced by `.djournal.json`.

Grok Bot cannot run SessionStart or Stop hooks. `djournal install --harness
grok-bot` installs the portable skills, `AGENTS.md`, the project marker, and
the recipe at `integrations/grok-bot/`. It does not write `.codex/hooks.json`,
`.claude/settings.json`, or `.pi/extensions`. Register the skills in Grok from
that recipe. `djournal doctor` reports the CLI, `.agents/`, and the marker for
this harness and does not fail because hooks are absent. See
[Grok Bot](grok-bot.md).

To share selected work through the product repository, enable colocated
projection:

```bash
djournal config sync.enabled true
djournal config sync.mode colocated
djournal config sync.path .
djournal share --work 2026-07-03-01-example
djournal pull --work 2026-07-03-01-example
djournal sync --work 2026-07-03-01-example
```

Pull hydrates canonical storage from the current product checkout. Sync pulls
again, then copies the shared work item into `./.journal/work/...` so normal
product repository commits can carry it.

## Multi-repository setup

Use standalone projection when one work stream spans several code repositories:

```bash
mkdir my-product-journal
cd my-product-journal
git init
djournal install --all
djournal config sync.enabled true
djournal config sync.mode standalone
djournal config sync.path .
```

Keep the journal repository as a sibling of the product repositories:

```text
workspace/
  product-api/
  product-web/
  product-mobile/
  my-product-journal/
    .djournal.json
    .journal/          # shared projection after djournal sync
    .agents/
```

Agents can run from the workspace or journal repository as long as they resolve
the installed project marker. Journal entries can still reference paths and
commits in sibling code repositories.

## Harness selection

Install for one harness:

```bash
djournal install --harness codex
djournal install --harness claude-code
djournal install --harness pi
djournal install --harness grok-bot
```

`grok` and `grokbot` are aliases for `grok-bot`.

Install for multiple harnesses:

```bash
djournal install --harness codex,claude-code,pi,grok-bot
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
djournal update check
```

`status` reports installed files, cleanliness, the executing CLI version, the
project asset version, and cached npm release availability. `doctor` checks the
local environment and harness configuration. For Pi it reports extension
presence and reminds you that project trust is required; it does not inspect or
change Pi's private trust state. For Grok Bot it reports the CLI, `.agents/`
skills and rules, the project marker, and recipe files, and points at skill
registration. Missing Grok hooks are expected and are not a failure.

## Update notifications

djournal checks npm release metadata without delaying session startup. A
session reads `update-check.json` under `DJOURNAL_HOME` (default:
`~/.djournal/update-check.json`) and, when that cache is older than 24 hours,
starts a bounded background refresh for a later session. Registry failures are
silent in this passive path.

When a cached release is newer than the executing CLI, every new session shows
an update notice until the newer package is installed. When the CLI is newer
than a project's installed hooks and rules, every new session instead—or
additionally—reminds you to upgrade those project assets.

Check immediately:

```bash
djournal update check
djournal update check --json
```

For a global installation, update both layers:

```bash
npm install -g djournal@latest
djournal upgrade
```

Passive checks are enabled by default. Configure the interval or disable them
for a project:

```bash
djournal config updates.intervalHours 24
djournal config updates.enabled false
```

Set `NO_UPDATE_NOTIFIER=1` to disable passive checks and notices for the current
environment. CI and test environments skip them automatically. Explicit
`djournal update check` commands still perform a foreground check and report
errors.

## Related docs

- [Grok Bot](grok-bot.md)
- [Remote Git sync setup](remote-sync.md)
- [Read-only team journal access](read-only-team-journal.md)
- [Uninstalling and reinstalling](uninstalling.md)
