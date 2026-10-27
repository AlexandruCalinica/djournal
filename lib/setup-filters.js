"use strict";

const { createPrompt, useState, useKeypress, usePagination } = require("@inquirer/core");

function filterFields(workItems = []) {
  const values = (items) => [[undefined, "Any"], ...items.map((value) => [value, value.replaceAll("_", " ")])];
  return [
    { key: "work", label: "Work", values: [[undefined, "All work"], ...workItems.map((work) => [work.slug, work.title])], help: "Restrict results to a work item." },
    { key: "kind", label: "Kind", values: values(["work", "entry"]), help: "Search work descriptions, entries, or both." },
    { key: "type", label: "Entry type", values: values(["plan", "implementation", "status", "manual", "research", "doc", "decision"]), help: "Applies to entries; work descriptions have no entry type." },
    { key: "status", label: "Work status", values: values(["draft", "active", "paused", "completed", "archived"]), help: "Include work items with this status." },
    { key: "visibility", label: "Visibility", values: values(["local_only", "private_synced", "team_shared"]), help: "Restrict results by work visibility." },
    { key: "limit", label: "Result limit", help: "Type a number from 1 to 100, or use Left/Right. Limit is per result kind." },
  ];
}

function filterSummary(filters) {
  const labels = { work: "Work", kind: "Kind", type: "Type", status: "Status", visibility: "Visibility" };
  const scope = Object.entries(labels).filter(([key]) => filters[key])
    .map(([key, label]) => `${label}: ${filters[key]}`);
  return [...(scope.length ? scope : ["All work / all types"]), `Limit: ${filters.limit}`].join(" | ");
}

const filterPrompt = createPrompt((config, done) => {
  const [draft, setDraft] = useState({ ...config.filters });
  const [active, setActive] = useState(0);
  const [digits, setDigits] = useState(null);
  const [error, setError] = useState("");
  const { fields, theme } = config;
  const field = fields[active];
  const validLimit = digits === null || (Number(digits) >= 1 && Number(digits) <= 100);
  useKeypress((key, rl) => {
    rl.clearLine(0);
    if (key.ctrl && key.name === "r") {
      setDraft({ limit: 10 }); setDigits(null); setError("");
    } else if (key.name === "up" || key.name === "down") {
      if (!validLimit) { setError("Enter a limit from 1 to 100."); return; }
      setActive((active + (key.name === "up" ? -1 : 1) + fields.length) % fields.length);
      setDigits(null); setError("");
    } else if (key.name === "left" || key.name === "right") {
      const offset = key.name === "left" ? -1 : 1;
      const next = { ...draft };
      if (field.key === "limit") next.limit = Math.max(1, Math.min(100, draft.limit + offset));
      else {
        const index = Math.max(0, field.values.findIndex(([value]) => value === draft[field.key]));
        const [value] = field.values[(index + offset + field.values.length) % field.values.length];
        if (value === undefined) delete next[field.key]; else next[field.key] = value;
      }
      setDraft(next); setDigits(null); setError("");
    } else if (field.key === "limit" && (/^[0-9]$/.test(key.sequence) || key.name === "backspace")) {
      const text = key.name === "backspace" ? (digits ?? String(draft.limit)).slice(0, -1) : (digits ?? "") + key.sequence;
      setDigits(text); setError(Number(text) < 1 || Number(text) > 100 ? "Limit must be between 1 and 100." : "");
      if (Number(text) >= 1 && Number(text) <= 100) setDraft({ ...draft, limit: Number(text) });
    } else if (key.name === "enter" || key.name === "return") {
      if (!validLimit) setError("Enter a limit from 1 to 100.");
      else done(draft);
    }
  });
  const valueOf = (item) => item.key === "limit" ? (digits ?? String(draft.limit))
    : item.values.find(([value]) => value === draft[item.key])?.[1] || draft[item.key] || "Any";
  const page = usePagination({
    items: fields, active, pageSize: Math.min(fields.length, config.pageSize), loop: true,
    renderItem: ({ item, isActive }) => {
      const text = theme.style.line(`${isActive ? ">" : " "} ${item.label.padEnd(12)} ${isActive ? "< " : "  "}${valueOf(item)}${isActive ? " >" : ""}`);
      return isActive ? theme.style.highlight(text) : text;
    },
  });
  return [theme.style.message(config.message).trimEnd(), [page,
    error ? theme.style.detail(`Error: ${error}`) : theme.style.detail(`${valueOf(field)} — ${field.help}`)].join("\n")];
});

module.exports = { filterFields, filterSummary, filterPrompt };
