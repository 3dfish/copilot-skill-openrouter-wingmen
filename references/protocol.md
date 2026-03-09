# Relay Protocol (`--`) 

This file defines the authoritative parsing and execution protocol for Mode B.

## Purpose

- Keep relay behavior deterministic.
- Separate user-to-OpenRouter content from user-to-assistant control content.
- Avoid accidental forwarding of assistant-side instructions.

## Delimiter Rule

- Delimiter token: `--`
- Split rule: split user message at the first `--` only.
- Left segment: relay segment (eligible to send to OpenRouter).
- Right segment: assistant segment (never sent to OpenRouter).

## Parsing Algorithm

1. Read raw user message as a string.
2. If no `--` exists:
   - Entire message is relay segment.
   - Assistant segment is empty.
3. If `--` exists:
   - Relay segment = text before first `--`.
   - Assistant segment = text after first `--`.
4. Trim both segments.

## Execution Rules

1. If relay segment is non-empty:
   - Send it to OpenRouter using current resolved model id.
2. If relay segment is empty:
   - Do not call OpenRouter for this turn.
3. If assistant segment is non-empty:
   - Treat it as instructions for the assistant only.
   - Never include it in OpenRouter prompt.

## State Updates

- Keep `last_model_id` in session state.
- Model resolution order:
  - explicit model request from assistant segment
  - existing `last_model_id`
  - `openrouter/auto`

## Examples

- Input: `今天北京天气怎么样`
  - Relay: `今天北京天气怎么样`
  - Assistant: empty
  - Action: call OpenRouter

- Input: `今天北京天气怎么样 -- 原样转述`
  - Relay: `今天北京天气怎么样`
  - Assistant: `原样转述`
  - Action: call OpenRouter with relay segment only

- Input: `-- 切换模型到 openrouter/auto`
  - Relay: empty
  - Assistant: `切换模型到 openrouter/auto`
  - Action: update state only, no OpenRouter call

- Input: `你好 -- 切到模型 a/b -- 其他备注`
  - Relay: `你好`
  - Assistant: `切到模型 a/b -- 其他备注`
  - Action: split at first delimiter only

## Non-Goals

- No escaping mechanism for delimiter inside plain relay text.
- If user needs literal `--` in relay content, they should avoid delimiter syntax for that turn.
