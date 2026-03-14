# Regression Checklist

Use this checklist after changing relay behavior, command parsing, output rendering, credential handling, or security controls.

## Core Flow

- [ ] Alias resolution remains explicit alias first, then default alias.
- [ ] Model response prints immediately after each call.

## Alias Credential Set

- [ ] Missing profile set triggers required interactive prompt: `alias -> apikey -> baseURL -> modelid` (`note` optional, `baseURL` defaults to `https://api.openai.com/v1`).
- [ ] First profile entry does not auto-fill alias/modelid from template defaults; fields are entered step-by-step.
- [ ] At least one profile is required.
- [ ] Invalid alias format is rejected with clear error.
- [ ] Legacy `alias:key:model` profile format is rejected with clear error.
- [ ] `--list-aliases` prints aliases, bound model ids, and baseURLs.
- [ ] `--alias` selects correct profile for request.
- [ ] Missing `--alias` falls back to default alias (with interactive default option in TTY).

## Output Timing

- [ ] Each model call is followed by immediate standalone reply output.
- [ ] No delayed batched rendering at loop end.
- [ ] Each call writes one `*-dialogue.md` containing question and answer sections.
- [ ] Dialogue markdown records attachment paths only for input/output attachment sections.
- [ ] Input attachments are materialized as `*-input-attachment-<n>.<ext>` files when attachment input is provided.

## Security

- [ ] API key never appears in chat logs.
- [ ] Script can run without passing key in command arguments when profile set exists.
- [ ] `.3rd.env` stores profile set and default alias, not single key/model pair.

## Large File Authorization

- [ ] Files > 50KB trigger user consent request via chat before reading.
- [ ] Refuse/skip path reports only file path + size.
- [ ] <= 50KB files can be read without extra consent.

## Multimodal Input

- [ ] `--attachment` with local path works.
- [ ] `--attachment` with URL works.
- [ ] Multiple `--attachment` arguments work.
- [ ] Legacy `--image` remains compatible as alias.

## Prompt Input Robustness

- [ ] `--prompt-file <path>` loads multi-line text correctly.
- [ ] `--prompt-file` + multiple `--attachment` arguments work together.
- [ ] Missing/empty `--prompt-file` yields clear error message.

## Agent Profile Compatibility

- [ ] `--agent github-copilot` and `--agent claude-code` behave consistently for interaction/output markers.
- [ ] All profiles emit `[ROUTE]`, `[TEXT_FILE]`, and `[TEXT_CONTENT_BEGIN]/[TEXT_CONTENT_END]`.
- [ ] Unknown `--agent` gracefully falls back to `generic` profile with same behavior.
- [ ] `--check-agent-consistency` returns `ok=true` for current profile config.
- [ ] `github-copilot/claude-code/cursor/codex-cli/generic` all keep `inlineTextPreview=true` and `emitRouteMarker=true`.

## OpenAI-Compatible API Support

- [ ] Default baseURL (`https://api.openai.com/v1`) is used when not specified.
- [ ] Custom baseURL is correctly passed to OpenAI client.
- [ ] OpenRouter (`https://openrouter.ai/api/v1`) works as alternative baseURL.
- [ ] Local models (e.g., Ollama at `http://localhost:11434/v1`) work as baseURL.
- [ ] Profile set includes baseURL in each entry.
- [ ] `[ROUTE]` marker includes baseURL for debugging.