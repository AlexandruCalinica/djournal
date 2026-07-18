"use strict";

const { handle } = require("../shared/journal-hook.js");

function contextFrom(output) {
  return output?.hookSpecificOutput?.additionalContext || "";
}

function assistantText(message) {
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return null;
  const parts = message.content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text);
  return parts.length ? parts.join("\n") : null;
}

function registerPiAdapter(pi, options = {}) {
  const checker = options.handle || handle;
  const state = {
    sessionContext: "",
    closureRetryActive: false,
  };

  function warn(ctx, error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx?.ui?.notify?.(`djournal hook skipped: ${message}`, "warning");
  }

  function check(payload, ctx) {
    try {
      return checker(payload) || {};
    } catch (error) {
      warn(ctx, error);
      return {};
    }
  }

  pi.on("session_start", (_event, ctx) => {
    state.sessionContext = contextFrom(check({
      cwd: ctx.cwd,
      hook_event_name: "SessionStart",
    }, ctx));
    state.closureRetryActive = false;
  });

  pi.on("before_agent_start", (event, ctx) => {
    const promptContext = contextFrom(check({
      cwd: ctx.cwd,
      hook_event_name: "UserPromptSubmit",
      prompt: event.prompt,
    }, ctx));
    const additionalContext = [state.sessionContext, promptContext].filter(Boolean).join("\n\n");
    if (!additionalContext) return undefined;
    return { systemPrompt: `${event.systemPrompt}\n\n${additionalContext}` };
  });

  pi.on("turn_end", (event, ctx) => {
    if (event.message?.role !== "assistant" || event.message.stopReason !== "stop") return;
    const lastAssistantMessage = assistantText(event.message);
    if (lastAssistantMessage === null) return;
    const retryWasActive = state.closureRetryActive;
    const output = check({
      cwd: ctx.cwd,
      hook_event_name: "Stop",
      last_assistant_message: lastAssistantMessage,
      stop_hook_active: retryWasActive,
    }, ctx);

    if (retryWasActive) {
      state.closureRetryActive = false;
      return;
    }
    if (output.decision !== "block" || typeof output.reason !== "string" || !output.reason) return;

    state.closureRetryActive = true;
    try {
      pi.sendUserMessage(output.reason, { deliverAs: "followUp" });
    } catch (error) {
      state.closureRetryActive = false;
      warn(ctx, error);
    }
  });

  return state;
}

module.exports = registerPiAdapter;
module.exports.assistantText = assistantText;
module.exports.registerPiAdapter = registerPiAdapter;
