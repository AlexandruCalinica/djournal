"use strict";

const BEGIN = "<!-- djournal:begin -->";
const END = "<!-- djournal:end -->";
const LEGACY_BEGIN = "<!-- filesystem-journal:begin -->";
const LEGACY_END = "<!-- filesystem-journal:end -->";
const MARKERS = [
  { begin: BEGIN, end: END },
  { begin: LEGACY_BEGIN, end: LEGACY_END },
];

function managedBlock(body) {
  return `${BEGIN}\n${body.trim()}\n${END}`;
}

function blockRange(text) {
  const ranges = [];
  for (const marker of MARKERS) {
    const starts = [];
    const ends = [];
    let cursor = 0;
    while ((cursor = text.indexOf(marker.begin, cursor)) !== -1) {
      starts.push(cursor);
      cursor += marker.begin.length;
    }
    cursor = 0;
    while ((cursor = text.indexOf(marker.end, cursor)) !== -1) {
      ends.push(cursor);
      cursor += marker.end.length;
    }
    if (starts.length > 1 || ends.length > 1) throw new Error("duplicate djournal blocks");
    if (starts.length !== ends.length || (starts.length === 1 && ends[0] < starts[0])) {
      throw new Error("unterminated djournal block");
    }
    if (starts.length === 1) ranges.push({ start: starts[0], end: ends[0] + marker.end.length });
  }
  if (ranges.length > 1) throw new Error("duplicate djournal blocks");
  return ranges[0] || null;
}

function hasManagedBlock(text) {
  return blockRange(text) !== null;
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

function appendUnique(target, values) {
  const injected = [];
  for (const value of values || []) {
    if (!target.some((candidate) => equal(candidate, value))) {
      const copy = structuredClone(value);
      target.push(copy);
      injected.push(copy);
    }
  }
  return injected;
}

function mergePermissionsConfig(current, fragment) {
  const next = structuredClone(current);
  const permissions = fragment.permissions || {};
  const injected = {};
  if (Array.isArray(permissions.additionalDirectories)) {
    next.permissions ||= {};
    next.permissions.additionalDirectories ||= [];
    const additions = appendUnique(next.permissions.additionalDirectories, permissions.additionalDirectories);
    if (additions.length) injected.additionalDirectories = additions;
  }
  if (Array.isArray(permissions.allow)) {
    next.permissions ||= {};
    next.permissions.allow ||= [];
    const additions = appendUnique(next.permissions.allow, permissions.allow);
    if (additions.length) injected.allow = additions;
  }
  return { value: next, injected };
}

function mergeConfigFragment(current, fragment) {
  const hook = mergeHookConfig(current, fragment);
  const permissions = mergePermissionsConfig(hook.value, fragment);
  return {
    value: permissions.value,
    injected: hook.injected,
    injectedPermissions: permissions.injected,
  };
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

function removePermissionsConfig(current, injected) {
  const next = structuredClone(current);
  const conflicts = [];
  for (const [key, values] of Object.entries(injected || {})) {
    const existing = next.permissions?.[key];
    if (!Array.isArray(existing)) {
      conflicts.push(`permissions.${key}`);
      continue;
    }
    for (const value of values) {
      const index = existing.findIndex((candidate) => equal(candidate, value));
      if (index === -1) conflicts.push(`permissions.${key}`);
      else existing.splice(index, 1);
    }
    if (existing.length === 0) delete next.permissions[key];
  }
  if (next.permissions && Object.keys(next.permissions).length === 0) delete next.permissions;
  return { value: next, conflicts };
}

function removeConfigFragment(current, injected, injectedPermissions) {
  const hook = removeHookConfig(current, injected);
  const permissions = removePermissionsConfig(hook.value, injectedPermissions);
  return {
    value: permissions.value,
    conflicts: [...hook.conflicts, ...permissions.conflicts],
  };
}

module.exports = {
  BEGIN,
  END,
  LEGACY_BEGIN,
  LEGACY_END,
  equal,
  hasManagedBlock,
  managedBlock,
  mergeConfigFragment,
  mergeHookConfig,
  mergePermissionsConfig,
  removeConfigFragment,
  removeHookConfig,
  removePermissionsConfig,
  removeManagedBlock,
  upsertManagedBlock,
};
