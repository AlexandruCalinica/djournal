"use strict";

const { stripVTControlCharacters } = require("node:util");

// Two offset journal pages, with a bookmark on the front page.
const JOURNAL_MARK = [
  "   ┌────┬─┐",
  "┌──┤    │ │",
  "│  │    ▾ │",
  "│  └──────┘",
  "└──────┘",
];
const ASCII_MARK = [
  "   +----+-+",
  "+--|    | |",
  "|  |    v |",
  "|  +------+",
  "+------+",
];

function wrap(text, width) {
  return String(text).split("\n").flatMap((line) => {
    const lines = [];
    let chars = Array.from(line);
    while (chars.length > width) {
      let end = chars.slice(0, width + 1).lastIndexOf(" ");
      if (end < width / 2) end = width;
      lines.push(chars.slice(0, end).join(""));
      chars = chars.slice(end);
      if (chars[0] === " ") chars.shift();
    }
    return [...lines, chars.join("")];
  }).join("\n");
}

function presentation(output, env = process.env) {
  const color = env.NO_COLOR === undefined && env.TERM !== "dumb" && env.FORCE_COLOR !== "0" &&
    (Boolean(env.FORCE_COLOR) || (output.getColorDepth?.() || 1) >= 4);
  const paint = (code) => (text) => color ? `\x1b[${code}m${text}\x1b[0m` : String(text);
  const accent = paint("36"), bold = paint("1"), muted = paint("2");
  const plainTerminal = env.TERM === "dumb";
  const width = () => Math.max(12, (output.columns || 80) - 4);
  const rows = () => output.rows || 24;
  const indent = (text) => String(text).split("\n").map((line) => `  ${line}`).join("\n");
  const fit = (text) => wrap(stripVTControlCharacters(String(text)), width());

  const clipped = (text, count) => {
    const lines = fit(text).split("\n");
    if (lines.length > count) lines[count - 1] = lines[count - 1].slice(0, Math.max(0, width() - 3)) + "...";
    return indent(lines.slice(0, count).join("\n"));
  };

  function banner(compact) {
    if (compact) return `${accent(plainTerminal ? "[=]" : "▤")} ${bold("djournal")}`;
    return (plainTerminal ? ASCII_MARK : JOURNAL_MARK).map((line, index) => accent(line) +
      (index === 2 ? `   ${bold("djournal")}` : "")).join("\n");
  }

  function frame(header, messages, type, question = "", choices = []) {
    const context = messages.join("\n").trim();
    const contextLines = context ? fit(context).split("\n").length + 1 : 0;
    const lines = [];
    if (typeof header === "object" && header) {
      const compact = type === "search" || type === "filters" || width() < 32 || rows() < 24 || contextLines >= 4;
      lines.push(indent(banner(compact)));
      lines.push(type === "search" || type === "filters" ? clipped(`Project: ${header.project}`, 1) : indent(fit(`Project: ${header.project}`)));
    } else if (header) lines.push(indent(fit(header)));
    lines.push(indent(muted("-".repeat(Math.min(60, width())))));
    const controls = type === "checkbox"
      ? "Up/Down move   Space toggle   Enter continue"
      : type === "search" ? "Up/Down select   Enter open   Tab filters"
        : type === "filters" ? "Up/Down field   Left/Right change"
        : type === "select" ? "Up/Down move   Enter select" : "Enter accept";
    const navigation = type === "search"
      ? "Up/Down select   Enter open\nTab filters   Esc back   Ctrl-C exit"
      : type === "filters"
      ? `${controls}\nEnter apply   Esc discard\nCtrl-R reset   Ctrl-C exit`
      : `${controls}   Esc back   Ctrl-C exit`;
    const hints = type === "search" || type === "filters" || navigation.length <= width() ? navigation : `${controls}\nEsc back   Ctrl-C exit`;
    lines.push(indent(muted(fit(hints))), "");
    if (context) {
      for (const line of fit(context).split("\n")) {
        const style = /^(?:[A-Z_]+:|fail\b)/.test(line) ? paint("31") : /^ok\b|^Configuration saved/.test(line) ? paint("32") : (text) => text;
        lines.push(indent(style(line)));
      }
      lines.push("");
    }
    const text = lines.join("\n") + "\n";
    const used = text.split("\n").length + fit(question).split("\n").length;
    const descriptionLines = Math.max(1, ...choices.map((choice) => choice.description ? fit(choice.description).split("\n").length : 0));
    if (type === "search" || type === "filters") return { text, pageSize: Math.max(1, Math.min(8, rows() - used - (type === "search" ? 6 : 4))) };
    return { text, pageSize: Math.max(3, Math.min(10, rows() - used - descriptionLines - 3)) };
  }

  function choices(items) {
    return items.map(([value, label, detail]) => {
      const full = stripVTControlCharacters(String(label));
      const limit = width() - 2;
      const long = Array.from(full).length > limit;
      return {
        value,
        name: long ? Array.from(full).slice(0, limit - 3).join("") + "..." : full,
        description: [long ? full : "", detail].filter(Boolean).join("\n") || undefined,
      };
    });
  }

  const theme = {
    prefix: { idle: "", done: "" },
    icon: { cursor: ">", checked: "[x]", unchecked: "[ ]" },
    helpMode: "never",
    style: {
      message: (text) => indent(bold(fit(text))) + "\n",
      highlight: (text) => accent(bold(text)),
      answer: accent,
      description: (text) => indent(muted(fit(text))),
      line: (text) => clipped(text, 1),
      detail: (text) => muted(clipped(text, 2)),
      error: (text) => indent(paint("31")(fit(`Error: ${text}`))),
      defaultAnswer: (text) => muted(`(${text})`),
      help: muted,
      key: bold,
      disabled: muted,
      disabledChoice: muted,
      keysHelpTip: () => "",
    },
  };
  return {
    frame, choices,
    theme: (type) => ({
      ...theme,
      style: {
        ...theme.style,
        message: (text) => type === "input" || type === "confirm"
          ? ` ${bold(fit(text))}\n  >`
          : theme.style.message(text),
      },
    }),
  };
}

module.exports = { presentation };
