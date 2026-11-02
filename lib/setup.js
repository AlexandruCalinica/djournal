"use strict";

const path = require("node:path");
const installer = require("./installer/index.js");
const entries = require("./setup-entries.js");
const recall = require("./recall/index.js");
const { filterFields, filterSummary } = require("./setup-filters.js");
const { presentation } = require("./setup-style.js");

class Cancelled extends Error {}
class Back extends Error {}

// Keep the flow independent of the prompt library so operations remain testable.
function terminal(input = process.stdin, output = process.stdout, env = process.env) {
  if (!input.isTTY || !output.isTTY) {
    throw new installer.InstallerError("The wizard requires an interactive terminal; use djournal --help for commands, or djournal status --json for automation", "INTERACTIVE_REQUIRED");
  }
  const prompts = { ...require("@inquirer/prompts"), search: require("./setup-search.js").searchPrompt, filters: require("./setup-filters.js").filterPrompt };
  const style = presentation(output, env);
  const clearScreen = "\x1b[2J\x1b[H";
  let header = "";
  let messages = [];
  function frame(type, question, choices) {
    output.write(clearScreen);
    const layout = style.frame(header, messages, type, question, choices);
    output.write(layout.text);
    messages = [];
    return layout;
  }
  const controller = new AbortController();
  let activePrompt;
  const cancel = () => controller.abort();
  const onKey = (_value, key) => {
    if (key?.ctrl && key.name === "d") cancel();
    else if (key?.name === "escape") activePrompt?.abort(new Back());
  };
  input.on("end", cancel);
  input.on("close", cancel);
  input.on("keypress", onKey);
  if (input.readableEnded || input.destroyed) cancel();
  async function prompt(type, config) {
    if (controller.signal.aborted) throw new Cancelled();
    const layout = frame(type, config.message, config.choices);
    const current = new AbortController();
    activePrompt = current;
    const abort = () => current.abort();
    controller.signal.addEventListener("abort", abort, { once: true });
    try { return await prompts[type]({ ...config, pageSize: layout.pageSize, theme: style.theme(type) }, {
      input, output, signal: current.signal, clearPromptOnDone: true,
    }); }
    catch (error) {
      if (current.signal.reason instanceof Back && !controller.signal.aborted) throw current.signal.reason;
      if (["ExitPromptError", "AbortPromptError"].includes(error.name) || controller.signal.aborted) throw new Cancelled();
      throw error;
    } finally {
      controller.signal.removeEventListener("abort", abort);
      activePrompt = undefined;
    }
  }
  const choicesFor = style.choices;
  return {
    header: (message) => { header = message; },
    // Messages belong to the next frame, so clearing never hides a new result.
    write: (message) => { messages.push(message); },
    choose: (message, choices, defaultValue) => prompt("select", {
      message, choices: choicesFor(choices), default: defaultValue, pageSize: 10, loop: false,
    }),
    search: (message, source, { query = "", scope = "All work / all types" } = {}) => prompt("search", {
      message, query, scope,
      source: async (term, context) => {
        const result = await source(term, context);
        return { ...result, choices: choicesFor(result.choices) };
      },
    }),
    filters: (filters, fields) => prompt("filters", { message: "Search filters", filters, fields }),
    multiple: (message, choices, defaults = []) => prompt("checkbox", {
      message,
      choices: choicesFor(choices).map((choice) => ({ ...choice, checked: defaults.includes(choice.value) })),
      pageSize: 10, loop: false,
    }),
    text: async (message, defaultValue = "", validate = () => true) => {
      const answer = await prompt("input", {
        message, default: defaultValue,
        validate: (value) => (value.trim() && validate(value.trim())) || "Enter a valid value.",
      });
      return answer.trim();
    },
    confirm: (message, defaultValue = false) => prompt("confirm", { message, default: defaultValue }),
    external: async (operation) => {
      output.write(clearScreen);
      const raw = input.isRaw;
      const flowing = input.readableFlowing;
      input.removeListener("keypress", onKey);
      input.pause();
      if (input.isTTY && input.setRawMode) input.setRawMode(false);
      try { return await operation(); }
      finally {
        if (input.isTTY && input.setRawMode) input.setRawMode(!!raw);
        input.on("keypress", onKey);
        if (flowing) input.resume();
      }
    },
    close: () => {
      cancel();
      input.removeListener("end", cancel);
      input.removeListener("close", cancel);
      input.removeListener("keypress", onKey);
      output.write(clearScreen);
      if (messages.length) output.write(`${messages.join("\n")}\n`);
      messages = [];
    },
  };
}

async function setup(options, dependencies = {}) {
  const ui = dependencies.ui || terminal();
  const api = { ...installer, ...entries, ...recall, ...dependencies.api };
  const print = dependencies.print || ((result) => ui.write(JSON.stringify(result, null, 2)));
  const base = { target: path.resolve(options.target || process.cwd()), sourceRoot: options.sourceRoot, interactive: false };
  let failed = false;
  async function menu(message, choices) {
    try { return await ui.choose(message, choices); }
    catch (error) { if (error instanceof Back) return "back"; throw error; }
  }
  async function backToMenu(operation) {
    try { return await operation(); }
    catch (error) { if (error instanceof Back) return false; throw error; }
  }
  async function run(name, extra = {}) {
    const result = await api[name]({ ...base, ...extra });
    print(result, false, { write: (text) => ui.write(text.replace(/\n$/, "")) });
    if (result.ok === false || result.clean === false || result.installed === false || result.conflicts?.length) failed = true;
    return result;
  }

  const configuration = () => backToMenu(configureProject);
  async function configureProject() {
    const { config } = await api.configure(base);
    const changes = [];
    ui.write("\nConfigure this project. Enter keeps the displayed setting; nothing is saved until you confirm.");
    const mode = await ui.choose("Where should selected work items be shared?", [
      ["local", "Keep work local", "Disable synchronization for this project."],
      ["colocated", "Use this project's Git repository", "Share selected work through this project's journal projection."],
      ["standalone", "Use a separate Git repository", "Keep shared journal history in an existing journal repository."],
      ["back", "Back"],
    ], config.sync?.enabled ? config.sync.mode : "local");
    if (mode === "back") return false;
    if (mode === "local") changes.push(["sync.enabled", "false"]);
    else {
      changes.push(["sync.mode", mode]);
      const location = mode === "colocated" ? base.target : path.resolve(base.target, await ui.text(
        "Path to the existing journal Git repository",
        config.sync?.mode === "standalone" ? config.sync.path : "",
      ));
      changes.push(["sync.path", location]);
      const auto = mode === "standalone" && await ui.confirm(
        "Automatically sync shared work after journal closure (may commit and push)?",
        config.sync?.mode === "standalone" && !!config.sync.auto,
      );
      changes.push(["sync.auto", String(auto)], ["sync.enabled", "true"]);
      ui.write("Sharing is opt-in per work item. Use List to select work to share.");
    }
    const updates = await ui.confirm("Check periodically for djournal updates?", config.updates?.enabled !== false);
    changes.push(["updates.enabled", String(updates)]);
    if (updates) {
      const interval = await ui.text("Hours between update checks", String(config.updates?.intervalHours || 24),
        (value) => Number.isFinite(Number(value)) && Number(value) > 0);
      changes.push(["updates.intervalHours", String(Number(interval))]);
    }
    const pending = changes.filter(([key, value]) => {
      const current = key.split(".").reduce((object, part) => object?.[part], config);
      return String(current) !== value;
    });
    if (!pending.length) { ui.write("Configuration is already up to date."); return true; }
    ui.write(`\nConfiguration changes for ${base.target}:`);
    for (const [key, value] of pending) ui.write(`  ${key}: ${value}`);
    if (!await ui.confirm("Save these settings?")) return false;
    for (const [key, value] of pending) await api.configure({ ...base, key, value });
    ui.write("Configuration saved.");
    return true;
  }

  async function installation() {
    const detected = api.detectHarnesses(base.target);
    ui.write(`\nDetected integrations: ${detected.supported.join(", ") || "none"}.`);
    const choice = await ui.choose("Which coding-agent integrations should be installed?", [
      ...installer.SUPPORTED_HARNESSES.map((name) => [name, name]),
      ["all", "All supported integrations"],
      ["custom", "Choose multiple integrations"],
      ["instructions", "Instructions only (no hooks)"],
      ["back", "Back"],
    ]);
    if (choice === "back") return;
    let harnesses = [];
    if (choice === "custom") {
      harnesses = await ui.multiple("Choose integrations (Space to toggle, Enter to continue)",
        installer.SUPPORTED_HARNESSES.map((name) => [name, name]), detected.supported);
    } else if (choice === "all") harnesses = [...installer.SUPPORTED_HARNESSES];
    else if (choice !== "instructions") harnesses = [choice];
    ui.write("Existing integrations are retained when installing into an installed project.");
    if (!await ui.confirm(`Install ${harnesses.join(", ") || "instructions only"} in ${base.target}?`)) return;
    await run("install", { harnesses, instructionsOnly: !harnesses.length });
    await configuration();
  }

  async function workItems() {
    while (true) {
      let result;
      try { result = await api.listWork(base); }
      catch (error) {
        if (error.code !== "NO_ACTIVE_WORK") throw error;
        ui.write("No work items yet. Ask your coding agent to start a new work item with init-work.");
        return;
      }
      const selected = await menu("Choose a work item", [
        ...result.workItems.map((item) => [item.slug, `${item.title} [${item.status}]${item.selected ? " *" : ""}`,
          `${item.slug}\nVisibility: ${item.visibility || "unknown"}${item.selected ? " | Selected work" : ""}`]),
        ["back", "Back"],
      ]);
      if (selected === "back") return;
      const item = result.workItems.find((candidate) => candidate.slug === selected);
      while (true) {
        ui.write(`\n${item.title}\n${item.slug}\nStatus: ${item.status}; visibility: ${item.visibility}`);
        const action = await menu("What would you like to do with this work item?", [
          ["entries", "Open entry in editor", "Browse this work's journal, research, docs, and decisions."],
          ["share", "Share", "Mark this work for Git synchronization."],
          ["pull", "Pull", "Import changes from the journal projection."],
          ["sync", "Sync", "Import and export shared work."],
          ...(item.status === "active" ? [["bindWork", "Bind to a session", "Select this work for an agent session."]] : []),
          ["back", "Back to work items"],
        ]);
        if (action === "back") break;
        if (action === "entries") { await browseEntries(item); continue; }
        await backToMenu(async () => {
          if (action === "bindWork") {
            const session = await ui.text("Agent session ID", process.env.DJOURNAL_SESSION_ID || "");
            if (await ui.confirm(`Bind ${item.slug} to this session?`)) await run(action, { work: item.slug, session });
            return;
          }
          const { config } = await api.configure(base);
          if (!config.sync?.enabled) {
            ui.write("Synchronization is disabled for this project.");
            if (!await ui.confirm("Configure synchronization now?")) return;
            await configuration();
            const updated = await api.configure(base);
            if (!updated.config.sync?.enabled) return;
          }
          const warning = action === "sync" ? " This may commit and push in standalone mode." : "";
          if (!await ui.confirm(`${action} ${item.slug}?${warning}`)) return;
          await run(action, { work: item.slug });
          if (action === "share") ui.write("Work marked for sharing. Use Sync to copy it to the Git projection.");
        });
      }
    }
  }

  async function browseEntries(item) {
    while (true) {
      const records = await api.listEntries({ ...base, work: item.slug });
      if (!records.length) { ui.write("No journal entries yet for this work item."); return; }
      const selected = await menu("Open an entry (close the editor to return)", [
        ...records.map((entry) => [entry.relative, entry.title,
          `${entry.date?.slice(0, 10) || "Undated"} | ${entry.entryType}\n${entry.relative.split("/").slice(2).join("/")}`]),
        ["back", "Back to work item"],
      ]);
      if (selected === "back") return;
      const entry = records.find((record) => record.relative === selected);
      await openInEditor(() => entry);
    }
  }

  async function openInEditor(resolveEntry) {
    try {
      const entry = await resolveEntry();
      const open = () => api.openEntry(entry, { cwd: base.target });
      if (ui.external) await ui.external(open);
      else await open();
    } catch (error) {
      if (error instanceof Cancelled) throw error;
      failed = true;
      ui.write(`${error.code || "EDITOR_ERROR"}: ${error.message}`);
    }
  }

  async function recallMenu() {
    let filters = { limit: 10 };
    async function editFilters() {
      let workItems = [];
      try { ({ workItems } = await api.listWork(base)); }
      catch (error) { if (error.code !== "NO_ACTIVE_WORK") throw error; }
      filters = await ui.filters(filters, filterFields(workItems));
    }
    async function search() {
      let query = "";
      while (true) {
        const selected = await ui.search("Search journal", async (term, { signal }) => {
          let result;
          try { result = await api.searchRecall(term, { ...base, ...filters }); }
          catch (error) { if (!signal.aborted) failed = true; throw error; }
          const matches = [...result.workItems, ...result.entries].sort((a, b) => b.score - a.score);
          const message = [matches.length ? `${matches.length} results (up to ${filters.limit} per kind).` : "No matches. Edit query or Tab for filters."];
          for (const warning of (result.warnings || []).slice(0, 3)) message.push(`Warning: ${warning.code}${warning.path ? ` - ${warning.path}` : ""}`);
          if (result.warnings?.length > 3) message.push(`${result.warnings.length - 3} more warnings; use djournal recall index --json for details.`);
          return {
            choices: matches.map((item) => [item, item.title, [item.entryType, item.summary, item.path].filter(Boolean).join("\n")]),
            message: message.filter(Boolean).join("\n"),
          };
        }, { query, scope: filterSummary(filters) });
        query = selected.query;
        if (selected.value === "back") return;
        if (selected.value === "filters") await backToMenu(editFilters);
        else await openInEditor(() => api.recallEntry(selected.value, base));
      }
    }

    while (true) {
      const action = await menu("Recall", [
        ["search", "Search journal", "Find entries and work items, then open their canonical Markdown."],
        ["index", "Refresh index", "Update the search cache from the current journal."],
        ["rebuild", "Rebuild index", "Recreate the disposable search cache. Journal entries are kept."],
        ["back", "Back"],
      ]);
      if (action === "back") return;
      await backToMenu(async () => {
        if (action === "search") await search();
        else if (action === "index" || await ui.confirm("Rebuild the recall index?")) {
          await run("buildRecallIndex", { rebuild: action === "rebuild" });
        }
      });
    }
  }

  async function uninstallation() {
    const manifest = await api.loadManifest(base.target);
    if (!manifest) throw new installer.InstallerError("djournal is not installed in this project", "NOT_INSTALLED");
    const choice = await menu("Remove which integrations?", [
      ["all", "All integrations and installed assets"],
      ...manifest.harnesses.map((name) => [name, name]), ["back", "Back"],
    ]);
    if (choice === "back") return;
    ui.write("Journal entries are kept. Modified installed files are preserved and reported as conflicts.");
    if (await ui.confirm(`Uninstall ${choice === "all" ? "all integrations" : choice} from ${base.target}?`)) {
      await run("uninstall", choice === "all" ? { all: true } : { harnesses: [choice] });
    }
  }

  try {
    const heading = `djournal\nProject: ${base.target}\nUse ↑/↓ to navigate and Enter to select. Esc goes back; Ctrl-C exits. Completed actions are kept.`;
    if (ui.header) ui.header({ project: base.target });
    else ui.write(heading);
    while (true) {
      const action = await menu("What would you like to do?", [
        ["list", "List", "Browse work items, open entries, and manage sharing."],
        ["recall", "Recall", "Search journal knowledge and manage its search index."],
        ["status", "Status", "View installation, integration, and version status."],
        ["install", "Install", "Add djournal integrations and configure this project."],
        ["configure", "Configure", "Set sharing and update preferences."],
        ["upgrade", "Upgrade", "Refresh this project's installed journal assets."],
        ["update", "Update", "Check for a newer CLI release."],
        ["doctor", "Doctor", "Check this project's journal installation."],
        ["uninstall", "Uninstall", "Remove installed integrations while keeping journal history."],
        ["exit", "Exit", "Return to your shell. Completed actions are kept."],
      ]);
      if (action === "exit") return { failed };
      if (action === "back") continue;
      try {
        if (action === "list") await workItems();
        else if (action === "recall") await recallMenu();
        else if (action === "status") await run("status");
        else if (action === "uninstall") await uninstallation();
        else if (action === "install") await installation();
        else if (action === "configure") await configuration();
        else if (action === "upgrade") {
          if (await ui.confirm(`Upgrade installed assets in ${base.target}?`)) await run("upgrade");
        } else if (action === "update") {
          const result = await run("checkUpdates");
          if (result.updateAvailable) ui.write("To update the CLI, run: npm install -g djournal@latest\nThen use Upgrade to refresh this project's assets.");
        } else if (action === "doctor") await run("doctor");
      } catch (error) {
        if (error instanceof Back) continue;
        if (error instanceof Cancelled) throw error;
        failed = true;
        ui.write(`${error.code || "ERROR"}: ${error.message}`);
        if (error.code === "NOT_INSTALLED") ui.write("Choose Install from the main menu to initialize this project.");
      }
    }
  } catch (error) {
    if (!(error instanceof Cancelled)) throw error;
    ui.write("\nWizard cancelled. Completed actions have been kept.");
    return { cancelled: true, failed };
  } finally {
    ui.close();
  }
}

module.exports = { Back, Cancelled, setup, terminal };
