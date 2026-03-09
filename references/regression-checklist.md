# Regression Checklist

Use this checklist after changing relay behavior, command parsing, output rendering, or security controls.

## Core Flow

- [ ] Mode B first turn asks first relay message popup.
- [ ] Mode B first turn asks initial model popup.
- [ ] First OpenRouter response prints immediately in chat.
- [ ] Later turns use plain user messages as relay content.

## Delimiter Behavior (`--`)

- [ ] No delimiter: full message relayed.
- [ ] `left -- right`: only `left` relayed, `right` handled locally.
- [ ] `-- only local`: no OpenRouter call.
- [ ] Multiple delimiters: split at first delimiter only.

## Model Behavior

- [ ] Fallback order works: explicit -> `last_model_id` -> `openrouter/auto`.
- [ ] Assistant-side model switch updates `last_model_id`.
- [ ] Model switch turn does not accidentally send assistant-side text to OpenRouter.

## Output Timing

- [ ] Each OpenRouter call is followed by immediate standalone reply output.
- [ ] No delayed batched rendering at loop end.

## Security

- [ ] API key never appears in command arguments.
- [ ] API key never appears in chat logs.
- [ ] Script runs without `--api-key` in normal flow.

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

## Long Output Handling

- [ ] `[TEXT_FILE]` is always printed when text exists.
- [ ] Saved markdown file preserves complete assistant text for downstream reads.

## Routing Policy

- [ ] `--task` selects expected routing candidate model.
- [ ] `--region cn-mainland` blocks GPT/Claude/Gemini model families.
- [ ] Blocked explicit model raises clear error unless `--allow-blocked-models` is set.
- [ ] Blocked env model under `cn-mainland` falls back to task route candidate.
- [ ] `[ROUTE]` marker prints provider/region/task/model/source metadata.

## Agent Profile Compatibility

- [ ] `--agent github-copilot` keeps inline preview behavior.
- [ ] `--agent claude-code` emits `[TEXT_PREVIEW_SKIPPED]` and still writes `[TEXT_FILE]`.
- [ ] Unknown `--agent` gracefully falls back to `generic` profile.
