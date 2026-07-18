"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { assistantText, registerPiAdapter } = require("../.agents/adapters/pi/journal-hook.js");

function fixture(checker) {
  const handlers = new Map();
  const sent = [];
  const notifications = [];
  const pi = {
    on(event, handler) { handlers.set(event, handler); },
    sendUserMessage(message, options) { sent.push({ message, options }); },
  };
  const state = registerPiAdapter(pi, { handle: checker });
  const ctx = { cwd: "/tmp/project", ui: { notify: (...args) => notifications.push(args) } };
  return { ctx, handlers, notifications, sent, state };
}

function assistant(...content) {
  return { role: "assistant", content, stopReason: "stop" };
}

test("extracts finalized assistant text without transcript parsing", () => {
  assert.equal(assistantText(assistant(
    { type: "text", text: "First" },
    { type: "thinking", thinking: "private" },
    { type: "toolCall", name: "read" },
    { type: "text", text: "Second" },
  )), "First\nSecond");
  assert.equal(assistantText({ role: "user", content: "hello" }), null);
  assert.equal(assistantText(assistant({ type: "toolCall", name: "read" })), null);
});

test("registers Pi lifecycle events and injects shared context", () => {
  const payloads = [];
  const { ctx, handlers } = fixture((payload) => {
    payloads.push(payload);
    return { hookSpecificOutput: { additionalContext: `context:${payload.hook_event_name}` } };
  });

  assert.deepEqual([...handlers.keys()], ["session_start", "before_agent_start", "turn_end"]);
  handlers.get("session_start")({ type: "session_start" }, ctx);
  const result = handlers.get("before_agent_start")({
    type: "before_agent_start",
    prompt: "implement pi",
    systemPrompt: "base prompt",
  }, ctx);

  assert.match(result.systemPrompt, /^base prompt/);
  assert.match(result.systemPrompt, /context:SessionStart/);
  assert.match(result.systemPrompt, /context:UserPromptSubmit/);
  assert.deepEqual(payloads, [
    { cwd: ctx.cwd, hook_event_name: "SessionStart" },
    { cwd: ctx.cwd, hook_event_name: "UserPromptSubmit", prompt: "implement pi" },
  ]);
});

test("checks the finalized turn response and accepts valid closure", () => {
  const payloads = [];
  const { ctx, handlers, sent } = fixture((payload) => {
    payloads.push(payload);
    return {};
  });

  handlers.get("before_agent_start")({ prompt: "work", systemPrompt: "base" }, ctx);
  handlers.get("turn_end")({ message: assistant({ type: "text", text: "done" }) }, ctx);

  assert.deepEqual(sent, []);
  assert.deepEqual(payloads.at(-1), {
    cwd: ctx.cwd,
    hook_event_name: "Stop",
    last_assistant_message: "done",
    stop_hook_active: false,
  });
});

test("does not check closure on intermediate tool-use turns", () => {
  const payloads = [];
  const { ctx, handlers, sent } = fixture((payload) => {
    payloads.push(payload);
    return {};
  });
  const toolTurn = { ...assistant({ type: "text", text: "working" }), stopReason: "toolUse" };

  handlers.get("turn_end")({ message: toolTurn }, ctx);
  assert.equal(payloads.length, 0);

  const finalTurn = assistant({ type: "text", text: "done" });
  handlers.get("turn_end")({ message: finalTurn }, ctx);
  assert.equal(payloads.length, 1);
  assert.deepEqual(sent, []);
});

test("sends exactly one guarded closure follow-up per user turn", () => {
  const stopPayloads = [];
  const { ctx, handlers, sent } = fixture((payload) => {
    if (payload.hook_event_name !== "Stop") return {};
    stopPayloads.push(payload);
    return payload.stop_hook_active ? {} : { decision: "block", reason: "close the journal" };
  });

  handlers.get("before_agent_start")({ prompt: "work", systemPrompt: "base" }, ctx);
  handlers.get("turn_end")({ message: assistant({ type: "text", text: "done" }) }, ctx);
  assert.deepEqual(sent, [{ message: "close the journal", options: { deliverAs: "followUp" } }]);

  handlers.get("before_agent_start")({ prompt: "close the journal", systemPrompt: "base" }, ctx);
  handlers.get("turn_end")({ message: assistant({ type: "text", text: "still invalid" }) }, ctx);
  assert.equal(sent.length, 1);
  assert.deepEqual(stopPayloads.map((payload) => payload.stop_hook_active), [false, true]);

  handlers.get("before_agent_start")({ prompt: "next request", systemPrompt: "base" }, ctx);
  handlers.get("turn_end")({ message: assistant({ type: "text", text: "invalid again" }) }, ctx);
  assert.equal(sent.length, 2);
});

test("fails open with a bounded Pi warning", () => {
  const { ctx, handlers, notifications, sent } = fixture(() => { throw new Error("broken checker"); });
  handlers.get("session_start")({}, ctx);
  handlers.get("turn_end")({ message: assistant({ type: "text", text: "done" }) }, ctx);
  assert.deepEqual(sent, []);
  assert.deepEqual(notifications, [
    ["djournal hook skipped: broken checker", "warning"],
    ["djournal hook skipped: broken checker", "warning"],
  ]);
});
