# Register journal skills in Grok Bot

Grok Bot loads shared workflows. It does not load `.agents/skills` by itself
and it has no session hooks. After `djournal install --harness grok-bot`,
register each installed skill with the harness **UpdateSkill** action.

Keep the upstream skill files generic. Rewrite a copy for the payload. Do not
edit the installed `SKILL.md` files in place, and do not embed a workspace
path, owner name, or agent id.

## Suggested workflow ids

| Installed skill directory | Suggested workflow id |
| --- | --- |
| `journal-workflow` | `journal-workflow` |
| `resume` | `journal-resume` |
| `init-work` | `journal-init-work` |
| `switch` | `journal-switch` |
| `journal` | `journal-entry` |
| `plan` | `journal-plan` |
| `recall` | `journal-recall` |
| `decision` | `journal-decision` |
| `document` | `journal-document` |
| `research-codebase` | `journal-research-codebase` |
| `research-web` | `journal-research-web` |
| `reinforce` | `journal-reinforce` |
| `audit` | `journal-audit` |
| `reconcile` | `journal-reconcile` |

Hub-only prose in this recipe is not an upstream skill:

| Recipe file | Suggested workflow id | Title |
| --- | --- | --- |
| `getting-started.md` | `journal-hub-getting-started` | Journal Hub getting started |
| `checkup.md` | `journal-hub-checkup` | Checkup with Journal Hub |

## Build an UpdateSkill payload

1. Set `<project-root>` to the install target (the directory that contains
   `.djournal.json` and `.agents/`).
2. Read `<project-root>/.agents/skills/<directory>/SKILL.md`.
3. Take `name` and `description` from the YAML frontmatter. Use the suggested
   workflow id from the table. Do not invent a project-specific id.
4. Rewrite the body into the UpdateSkill payload:
   - Point rule reads at `<project-root>/.agents/rules/...`. Journal root
     resolution stays the procedure in `<project-root>/.agents/rules/STATE.md`:
     use `.djournal.json` in the project root when it exists, otherwise the
     project-local `.journal`.
   - Write CLI examples as `djournal <command> --target <project-root>` or
     `journal <command> --target <project-root>`. Replace `<project-root>` with
     the confirmed install target at registration time.
   - When one skill should point at another, use a Grok sibling link:
     `[Journal workflow](sand-workflow:journal-workflow)`. Use the suggested id
     after `sand-workflow:`.
5. Register that id, name, description, and rewritten body with UpdateSkill.
6. Repeat for every row, then register the two hub workflows from this
   directory the same way.

Re-run this mapping after `djournal upgrade` when skill text changes. The
portable package files remain the source. The registered workflows are a
projection for Grok Bot.
