"use strict";

const { createPrompt, useState, useRef, useEffect, useKeypress, usePagination } = require("@inquirer/core");

const DEBOUNCE_MS = 250;

// Own the query and result lifecycle so returning from filters or an editor can
// restore the input, and Enter can never select results for an earlier query.
const searchPrompt = createPrompt((config, done) => {
  const [query, setQuery] = useState(config.query || "");
  const [result, setResult] = useState({ choices: [], message: "" });
  const [status, setStatus] = useState(query.trim() ? "waiting" : "idle");
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const request = useRef();
  const { theme } = config;

  useEffect((rl) => { if (config.query) rl.write(config.query); }, []);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    if (!query.trim()) return () => controller.abort();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const next = await config.source(query.trim(), { signal: controller.signal });
        if (controller.signal.aborted) return;
        setResult(next);
        setActive(0);
        setStatus("idle");
      } catch (failure) {
        if (controller.signal.aborted) return;
        setResult({ choices: [], message: "" });
        setError(failure.message || String(failure));
        setStatus("idle");
      }
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const ready = status === "idle";
  const choices = result.choices;
  const selected = ready ? choices[active] : undefined;
  useKeypress((key, rl) => {
    if (key.name === "tab") {
      request.current?.abort();
      done({ value: "filters", query });
    } else if (key.name === "enter" || key.name === "return") {
      if (ready && selected) done({ value: selected.value, query });
      else rl.write(query); // Readline clears its input on Enter.
    } else if (key.name === "up" || key.name === "down") {
      // Readline history navigation must not replace the editable query.
      rl.line = query;
      rl.cursor = query.length;
      if (ready) setActive(Math.max(0, Math.min(choices.length - 1, active + (key.name === "up" ? -1 : 1))));
    } else if (rl.line !== query) {
      // Invalidate synchronously, before a promise or another key can complete.
      request.current?.abort();
      if (!rl.line.trim()) setResult({ choices: [], message: "" });
      setError("");
      setActive(0);
      setStatus(rl.line.trim() ? "waiting" : "idle");
      setQuery(rl.line);
    }
  });

  const page = usePagination({
    items: choices, active, pageSize: config.pageSize, loop: false,
    renderItem: ({ item, isActive }) => {
      const text = `  ${isActive ? theme.icon.cursor : " "} ${item.name}`;
      return !ready ? theme.style.disabled(text) : isActive ? theme.style.highlight(text) : text;
    },
  });
  const message = !ready ? "Updating results..."
    : result.message || "Type to search the journal.";
  const padded = (text, lines) => [...text.split("\n"), ...Array(lines).fill(" ")].slice(0, lines).join("\n");
  const position = ready && choices.length ? `${active + 1}/${choices.length}  ` : "";
  return [
    `${theme.style.message(config.message)}  > ${theme.style.answer(query)}`,
    [theme.style.line(config.scope),
      padded(theme.style.detail(error ? `Error: ${error}` : position + message), 2),
      padded(page, config.pageSize),
      padded(selected?.description ? theme.style.detail(selected.description) : " ", 2)].join("\n"),
  ];
});

module.exports = { searchPrompt, DEBOUNCE_MS };
