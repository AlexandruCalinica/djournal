"use strict";

const BEGIN = "<!-- filesystem-journal:begin -->";
const END = "<!-- filesystem-journal:end -->";

function managedBlock(body) {
  return `${BEGIN}\n${body.trim()}\n${END}`;
}

function blockRange(text) {
  const starts = [];
  let cursor = 0;
  while ((cursor = text.indexOf(BEGIN, cursor)) !== -1) {
    starts.push(cursor);
    cursor += BEGIN.length;
  }
  if (starts.length > 1) throw new Error("duplicate filesystem journal blocks");
  if (starts.length === 0) return null;
  const end = text.indexOf(END, starts[0] + BEGIN.length);
  if (end === -1) throw new Error("unterminated filesystem journal block");
  if (text.indexOf(END, end + END.length) !== -1) {
    throw new Error("duplicate filesystem journal block endings");
  }
  return { start: starts[0], end: end + END.length };
}

function upsertManagedBlock(text, body) {
  const block = managedBlock(body);
  const range = blockRange(text);
  if (range) return `${text.slice(0, range.start)}${block}${text.slice(range.end)}`;
  if (!text) return `${block}\n`;
  const separator = text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${separator}${block}\n`;
}

function removeManagedBlock(text) {
  const range = blockRange(text);
  if (!range) return { text, removed: false };
  let before = text.slice(0, range.start);
  let after = text.slice(range.end);
  if (after.startsWith("\n")) after = after.slice(1);
  if (before.endsWith("\n\n")) before = before.slice(0, -1);
  return { text: `${before}${after}`, removed: true };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function mergeHookConfig(current, fragment) {
  const next = structuredClone(current);
  next.hooks ||= {};
  const injected = {};
  for (const [event, groups] of Object.entries(fragment.hooks || {})) {
    next.hooks[event] ||= [];
    for (const group of groups) {
      if (!next.hooks[event].some((candidate) => equal(candidate, group))) {
        const copy = structuredClone(group);
        next.hooks[event].push(copy);
        (injected[event] ||= []).push(copy);
      }
    }
  }
  return { value: next, injected };
}

function removeHookConfig(current, injected) {
  const next = structuredClone(current);
  const conflicts = [];
  for (const [event, groups] of Object.entries(injected || {})) {
    const existing = next.hooks?.[event];
    if (!Array.isArray(existing)) {
      conflicts.push(event);
      continue;
    }
    for (const group of groups) {
      const index = existing.findIndex((candidate) => equal(candidate, group));
      if (index === -1) conflicts.push(event);
      else existing.splice(index, 1);
    }
    if (existing.length === 0) delete next.hooks[event];
  }
  if (next.hooks && Object.keys(next.hooks).length === 0) delete next.hooks;
  return { value: next, conflicts };
}

module.exports = {
  BEGIN,
  END,
  equal,
  managedBlock,
  mergeHookConfig,
  removeHookConfig,
  removeManagedBlock,
  upsertManagedBlock,
};
