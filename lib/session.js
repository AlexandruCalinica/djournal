"use strict";

// Resolution order is the contract agents follow. `--session` is applied by
// the caller before this list. DJOURNAL_SESSION_ID is the explicit per-agent
// override. AGENT_SESSION_ID is the generic name any runtime can set.
// CURSOR_CONVERSATION_ID is set by Cursor agent sessions and stays stable for
// that conversation.
const SESSION_ENV_VARS = Object.freeze([
  "DJOURNAL_SESSION_ID",
  "AGENT_SESSION_ID",
  "CURSOR_CONVERSATION_ID",
]);

function cleanSessionId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function resolveSessionId(options = {}, env = process.env) {
  const explicit = cleanSessionId(options.session);
  if (explicit) return { id: explicit, source: "session" };
  for (const name of SESSION_ENV_VARS) {
    const value = cleanSessionId(env[name]);
    if (value) return { id: value, source: name };
  }
  return { id: "", source: "" };
}

function sessionRequiredMessage() {
  return [
    "a session id is required.",
    `Pass --session, or set one of: ${SESSION_ENV_VARS.join(", ")}.`,
    "On a machine shared by several agents, set DJOURNAL_SESSION_ID to a stable id for this agent.",
    "state.json is the global fallback and is shared by every agent under this user account.",
    "Pass --work <slug> when this agent has no session id, and do not switch that shared fallback.",
  ].join(" ");
}

module.exports = {
  SESSION_ENV_VARS,
  cleanSessionId,
  resolveSessionId,
  sessionRequiredMessage,
};
