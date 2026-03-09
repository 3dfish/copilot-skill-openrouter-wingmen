# Regression Checklist

Use this checklist after changing relay behavior, command parsing, output rendering, credential handling, or security controls.

## Core Flow

- [ ] Mode B first turn asks first relay message via chat/text input.
- [ ] Mode B first turn asks alias or uses default alias.
- [ ] First OpenRouter response prints immediately in chat.
- [ ] Later turns use plain user messages as relay content.

## Alias Credential Set

- [ ] Missing profile set triggers interactive 4-step prompt: `apikey -> modelid -> alias -> note(optional)`.
- [ ] At least one profile is required.
- [ ] Invalid alias format is rejected with clear error.
- [ ] Legacy `alias:key:model` profile format is rejected with clear error.
- [ ] `--list-aliases` prints aliases and bound model ids.
- [ ] `--alias` selects correct profile for request.
- [ ] Missing `--alias` falls back to default alias (with interactive default option in TTY).

## Delimiter Behavior (`--`)

- [ ] No delimiter: full message relayed.
- [ ] `left -- right`: only `left` relayed, `right` handled locally.
- [ ] `-- only local`: no OpenRouter call.
- [ ] Multiple delimiters: split at first delimiter only.

## Output Timing

- [ ] Each OpenRouter call is followed by immediate standalone reply output.
- [ ] No delayed batched rendering at loop end.
- [ ] Each call writes one `*-dialogue.md` containing question and answer sections.
- [ ] Dialogue markdown records attachment paths only for input/output attachment sections.
- [ ] Input attachments are materialized as `*-input-attachment-<n>.<ext>` files when attachment input is provided.

## Security

- [ ] API key never appears in chat logs.
- [ ] Script can run without passing key in command arguments when profile set exists.
- [ ] `.env` stores profile set and default alias, not single key/model pair.

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
