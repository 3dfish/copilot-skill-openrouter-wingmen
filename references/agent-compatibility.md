# Agent Compatibility

This skill can be used from multiple agent runtimes via `openrouter_capture.mjs --agent <profile>`.

## Supported Profiles

- `github-copilot`
  - Default profile.
  - Prints route marker and inline response preview.
- `claude-code`
  - File-first output for long responses.
  - Prints route marker and skips inline text preview.
- `cursor`
  - Interactive profile with route marker and inline preview.
- `codex-cli`
  - Terminal-friendly profile with route marker and inline preview.
- `generic`
  - Fallback profile for unknown agents.

## Usage Examples

```bash
node ./scripts/openrouter_capture.mjs \
  --agent github-copilot \
  --prompt "Summarize this spec" \
  --task rewrite
```

```bash
node ./scripts/openrouter_capture.mjs \
  --agent claude-code \
  --prompt-file ./tmp/prompt.txt \
  --task analysis
```

## Output Markers

- `[ROUTE] { ... }` route metadata for diagnostics
- `[TEXT_FILE] <path>` canonical markdown output
- `[TEXT_CONTENT_BEGIN] ... [TEXT_CONTENT_END]` inline preview when enabled by profile
- `[TEXT_PREVIEW_SKIPPED] agent=<profile>` when profile disables inline preview
