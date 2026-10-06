# Journal Hub setup

Use this as the body of the hub's setup workflow. Ask one question at a time. Wait for the answer before asking the next question. Do not invent a project path, a peer list, or a display name.

## Questions

1. **Project root.** Ask for the absolute path of the repository or journal workspace to equip. Stop if the path is missing or is not a directory.
2. **Sync mode.** Ask whether shared journal history should be colocated in that project (`colocated`) or kept in a separate journal repository (`standalone`). Leave sync disabled when the user does not want sharing yet.
3. **Engineering peers.** Ask which peer bots do engineering work and should receive the briefing. Record the display names the user gives. Do not require agent ids.
4. **Hub display name.** Ask what this hub should call itself in messages to those peers.

## After the answers

Run these steps for the confirmed project root. Substitute that path for `<project-root>`. Do not hardcode a machine path, owner, or agent id.

1. Check Node.js 18 or newer.
2. Install the CLI if `journal` or `djournal` is not on `PATH`:

   ```bash
   npm install -g djournal
   ```

3. Install the instruction-only harness:

   ```bash
   journal install --harness grok-bot --target <project-root> --yes
   ```

   This writes `.agents/`, a managed `AGENTS.md` block, `.djournal.json`, and `integrations/grok-bot/`. It does not write hook configs.

4. When the user chose a sync mode, point the store at the project and leave publication explicit:

   ```bash
   journal config sync.enabled true --target <project-root>
   journal config sync.mode colocated --target <project-root>
   journal config sync.path <project-root> --target <project-root>
   ```

   Use `standalone` instead of `colocated` when that was the answer. For standalone mode, `sync.path` is the journal repository the user named, which may be `<project-root>` itself. Do not run `journal share` or `journal sync` during setup.

5. Register skills by following [skill-registration.md](skill-registration.md). Read the installed `.agents/skills/*/SKILL.md` files under `<project-root>` and send UpdateSkill payloads. Also register this file as the setup workflow and [checkup.md](checkup.md) as **Checkup with Journal Hub**.
6. Send [peer-briefing.md](peer-briefing.md) to each engineering peer named above, with `<project-root>` and the hub display name filled in.

## Done when

- `journal doctor --target <project-root>` reports the Grok check healthy.
- The doctor detail says hooks are not required.
- Peers have the briefing and can run `journal status --target <project-root>` themselves.
