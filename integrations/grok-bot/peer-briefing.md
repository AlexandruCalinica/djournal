# Peer briefing

Send this message to each engineering bot named during setup. Replace the two placeholders. Do not add agent ids, owner names, or a machine-specific path beyond the confirmed project root.

```text
<hub-name> installed djournal for Grok Bot in <project-root>.

You own your journal work. Use the registered journal skills, or the CLI:

  journal status --target <project-root>
  journal doctor --target <project-root>

Read <project-root>/AGENTS.md and <project-root>/.agents/rules/STATE.md before writing. Resolve the journal root from the project marker. There are no session hooks; finish meaningful work with the journal skill and its status marker.

Keep local_only work unpublished. Ask <hub-name> for Checkup with Journal Hub when you want share, sync, or conflict review. The hub reconciles asynchronously and will not publish private work for you.
```
