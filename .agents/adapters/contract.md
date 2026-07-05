# Journal Harness Adapter Contract

Harness adapters improve compliance with the journal workflow. They are not a
second workflow engine and do not own durable state.

## Semantic events

| Event | Adapter behavior |
| --- | --- |
| `session_start` | Inject the active work name and tell the agent to follow `AGENTS.md` |
| `prompt_submit` | Remind the agent to classify the request; preserve explicit opt-out |
| `mutation_observed` | Optional ephemeral reminder only; never write state |
| `before_compact` | Optional reminder to preserve material state before context loss |
| `stop` | Validate the final journal status marker and request one closure pass |

An adapter may omit events its harness cannot support reliably. Instruction-only
behavior remains the compatibility baseline.

## Input

The shared checker accepts one JSON object on stdin. It uses only stable fields:

- `cwd`
- `hook_event_name`
- `prompt`
- `last_assistant_message`
- `stop_hook_active`

It does not parse conversation transcripts. Harness wrappers may normalize
native payloads to these names.

## Output

- Start and prompt events return `hookSpecificOutput.additionalContext`.
- Stop returns `{}` when closure is valid or no journal is installed.
- Stop returns `{ "decision": "block", "reason": "..." }` for one retry when
  the final status marker is missing or invalid.
- Malformed input and absent journal roots fail open with a bounded stderr
  diagnostic and exit code zero.

## Invariants

- Hooks are read-only.
- `stop_hook_active: true` always permits stopping.
- `closed` markers must resolve inside `.journal/work/` to an existing Markdown
  spine entry.
- Adapters do not infer task meaning from file changes or unstable transcripts.
- Adding a harness must not change `AUTOMATION.md` semantics.
