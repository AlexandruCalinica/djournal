# Skill registration

Register djournal skills into Grok with UpdateSkill after `djournal install --harness grok-bot`. Grok has no hook API. Shared workflows plus Shell calls to `journal` are the whole integration.

Public bot templates may be unavailable. This file is the distribution path: read the installed skill files and register them yourself.

## Workflow ids

Read `<project-root>/.agents/skills/<directory>/SKILL.md`. Ignore `agents/openai.yaml` sidecars; those are not Grok workflows.

| Skill directory | UpdateSkill id | Title |
| --- | --- | --- |
| `journal-workflow` | `journal-workflow` | Journal workflow |
| `resume` | `journal-resume` | Journal resume |
| `init-work` | `journal-init-work` | Journal init work |
| `switch` | `journal-switch` | Journal switch |
| `journal` | `journal-entry` | Journal entry |
| `plan` | `journal-plan` | Journal plan |
| `recall` | `journal-recall` | Journal recall |
| `decision` | `journal-decision` | Journal decision |
| `document` | `journal-document` | Journal document |
| `research-codebase` | `journal-research-codebase` | Journal research codebase |
| `research-web` | `journal-research-web` | Journal research web |
| `reinforce` | `journal-reinforce` | Journal reinforce |
| `audit` | `journal-audit` | Journal audit |
| `reconcile` | `journal-reconcile` | Journal reconcile |

The upstream skill named `journal` uses id `journal-entry` so it does not collide with the CLI.

Register these hub files as well. They are not upstream `.agents/skills` entries.

| Source | UpdateSkill id | Title |
| --- | --- | --- |
| `integrations/grok-bot/getting-started.md` | `journal-hub-setup` | Journal Hub setup |
| `integrations/grok-bot/checkup.md` | `journal-hub-checkup` | Checkup with Journal Hub |

## UpdateSkill payload

For each row, call UpdateSkill with the tool's current fields for:

- **id:** the id column
- **name:** the title column
- **description:** the `description` field from the skill frontmatter; for the hub files, use the first paragraph
- **body:** the rewritten Markdown below the frontmatter

Do not paste a team checkout path, owner, or agent id into the payload.

## Rewrite the body

Start from the Markdown after the closing frontmatter delimiter.

1. **Project root.** Replace bare CLI calls with an explicit target. `djournal pull` and `journal pull` become `journal pull --target <project-root>`. Do the same for every subcommand (`status`, `doctor`, `recall search`, `work bind`, `share`, `sync`, and the rest). When you register the workflow, replace `<project-root>` with the directory confirmed during setup. Keep that value only as the install target, not as a path copied from another bot.
2. **Rules.** Keep rule references relative to the install target: `<project-root>/.agents/rules/STATE.md` and the other files the skill already names. Resolve the journal root the way `STATE.md` describes (`.djournal.json` when it exists, otherwise `<project-root>/.journal`). Do not rewrite those paths to a home directory or a global store path.
3. **Sibling skills.** Grok links shared workflows with the `sand-workflow:` scheme. When the body tells the agent to use another journal skill, link that workflow:

   ```markdown
   [Journal resume](sand-workflow:journal-resume)
   [Journal entry](sand-workflow:journal-entry)
   [Journal plan](sand-workflow:journal-plan)
   ```

   Use the id table above. A relative link to another `SKILL.md` becomes one of these links.
4. **Leave the procedure intact.** Do not summarize away the skill's load list, safety rules, or status-marker contract. Grok will not inject a stop hook to check the marker; the workflow text has to say it.

## Example

Installed instruction:

```markdown
Run `djournal pull` from the project root.
Read `.agents/rules/STATE.md`.
Use resume before planning.
```

Payload body:

```markdown
Run `journal pull --target <project-root>`.
Read `<project-root>/.agents/rules/STATE.md` and resolve the journal root from that file.
Use [Journal resume](sand-workflow:journal-resume) before [Journal plan](sand-workflow:journal-plan).
```

Register that body only after substituting the confirmed project root.
