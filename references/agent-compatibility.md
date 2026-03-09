# Agent Compatibility

This skill can be used from multiple agent runtimes via `openrouter_capture.mjs --agent <profile>`.

Interaction policy:

- All agents use the same chat/text input flow.
- Do not rely on card-style or popup-specific UI.
- Agent profiles are kept for runtime identification and diagnostics.

## Supported Profiles

- `github-copilot`
  - Default profile.
- `claude-code`
  - Same interaction/output behavior as other profiles.
- `cursor`
  - Same interaction/output behavior as other profiles.
- `codex-cli`
  - Same interaction/output behavior as other profiles.
- `generic`
  - Fallback profile for unknown agents, with same behavior.

## Usage Examples

```bash
node ./scripts/openrouter_capture.mjs \
  --agent github-copilot \
  --alias default \
  --prompt "Summarize this spec"
```

```bash
node ./scripts/openrouter_capture.mjs \
  --agent claude-code \
  --alias work \
  --prompt-file ./tmp/prompt.txt
```

## Output Markers

- `[ROUTE] { ... }` call metadata for diagnostics
- `[TEXT_FILE] <path>` canonical markdown output
- `[TEXT_CONTENT_BEGIN] ... [TEXT_CONTENT_END]` inline preview (all profiles)
- `[ATTACHMENT_FILE] <path>` saved attachment outputs when the model returns attachments
