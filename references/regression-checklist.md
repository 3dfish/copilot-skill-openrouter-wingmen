# Regression Checklist

Use this checklist after changing relay behavior, command parsing, output rendering, credential handling, or security controls.

## Core Flow

- [ ] Mode B first turn asks first relay message popup.
- [ ] Mode B first turn asks alias or uses default alias.
- [ ] First OpenRouter response prints immediately in chat.
- [ ] Later turns use plain user messages as relay content.

## Alias Credential Set

- [ ] Missing profile set triggers interactive prompt for `<alias>:<apikey>:<modelid>`.
- [ ] At least one profile is required.
- [ ] Invalid alias format is rejected with clear error.
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

## Security

- [ ] API key never appears in chat logs.
- [ ] Script can run without passing key in command arguments when profile set exists.
- [ ] `.env` stores profile set and default alias, not single key/model pair.

## Large File Authorization

- [ ] Files > 50KB trigger user consent popup before reading.
- [ ] Refuse/skip path reports only file path + size.
- [ ] <= 50KB files can be read without extra consent.

## Multimodal Input

- [ ] `--image` with local path works.
- [ ] `--image` with URL works.
- [ ] Multiple `--image` arguments work.

## Prompt Input Robustness

- [ ] `--prompt-file <path>` loads multi-line text correctly.
- [ ] `--prompt-file` + multiple `--image` arguments work together.
- [ ] Missing/empty `--prompt-file` yields clear error message.

## Agent Profile Compatibility

- [ ] `--agent github-copilot` keeps inline preview behavior.
- [ ] `--agent claude-code` emits `[TEXT_PREVIEW_SKIPPED]` and still writes `[TEXT_FILE]`.
- [ ] Unknown `--agent` gracefully falls back to `generic` profile.
