---
name: openrouter-wingmen
description: "Use this skill whenever the user wants to talk to OpenRouter models through you, either as a relay (you pass messages back and forth) or as a wingman tool model (you ask OpenRouter first, then ask user consent before deeper internal use). Trigger on requests like '和 openrouter 聊聊', '帮我问问 openrouter', '你当传话员', '外援模型', '代问模型', and similar wording."
argument-hint: "Mode A or B, and the first message/model"
---

# OpenRouter Wingmen

This skill packages a repeatable OpenRouter conversation workflow with two modes.

## Modes

### Mode A: Wingman Tool Model

Use this when the user wants outside model input and then asks you to continue working with it.

Flow:

1. Ask/resolve model id for this call.
2. Call OpenRouter.
3. Print OpenRouter reply immediately.
4. Ask user authorization before feeding that reply into your own deeper reasoning.
5. If user refuses, do not reuse that reply internally.

### Mode B: Pure Relay

Use this when the user wants you to be a messenger only.

Flow:

1. First turn popup initialization:
   - Ask first relay message.
   - Ask initial model id (optional).
2. Later turns:
   - User message is relay content by default.
   - If message contains `--`, split at first `--`:
     - Left side: relay content (send if non-empty).
     - Right side: assistant-only instructions (never forward to OpenRouter).
   - If message starts with `--`, do not call OpenRouter for that turn.

Examples:

- `今天北京天气怎么样 -- 原样转述，不要扩写`
- `-- 把模型切换到 openrouter/auto`
- `-- 结束传话模式`

## Model Resolution

- Keep `last_model_id` in session state.
- Mode A: ask model id each call.
- Mode B: initialize model in first popup; later turns reuse `last_model_id` unless assistant-side instructions request a switch.
- Fallback order: explicit value -> `last_model_id` -> `openrouter/auto`.

## Output Contract

- Save outputs under `<workspace>/openrouter/`.
- Text outputs: `*.md`
- Image outputs: image files (`png/jpg/jpeg/webp/gif/bmp/svg`)
- Credentials file: `openrouter/.env`
- Always print OpenRouter reply immediately in chat.

Presentation format:

> [!IMPORTANT]
> OpenRouter (`<model_id>`) reply:
> <reply text>

If callout rendering is weak in CLI, also print plain text fallback.

## Security Rules (Mandatory)

- Never print API keys in chat or terminal logs.
- Never pass API key on command line arguments.
- If key is missing, collect in chat and persist to `openrouter/.env` with restrictive permissions.
- Run script without `--api-key`; key must come from env or `.env`.

## Large File Authorization (Mandatory)

Before reading saved OpenRouter output files (`.md` or images):

- If file size is greater than 50KB (51200 bytes), ask user authorization via popup first.
- If user refuses/skips, do not read content; only report path and size.

Unified size check template (Linux/macOS):

```bash
FILE_PATH="<file_path>"
FILE_SIZE_BYTES=$(wc -c < "$FILE_PATH" | tr -d '[:space:]')
THRESHOLD_BYTES=51200

if [ "$FILE_SIZE_BYTES" -gt "$THRESHOLD_BYTES" ]; then
  echo "NEED_AUTH size_bytes=$FILE_SIZE_BYTES path=$FILE_PATH"
else
  echo "READ_OK size_bytes=$FILE_SIZE_BYTES path=$FILE_PATH"
fi
```

Consent prompt example:

- "检测到文件超过50KB（<size_kb>KB）：`<file_path>`。是否允许我读取其内容并继续处理？"

## Required Assets

- Script: `./scripts/openrouter_capture.mjs`
- Package: `./scripts/package.json`
- Dependency: `@openrouter/sdk`
- Relay protocol spec: `./references/protocol.md`
- Regression checklist: `./references/regression-checklist.md`

When changing Mode B behavior, read `./references/protocol.md` first.
When validating changes, run through `./references/regression-checklist.md`.

## Run Template

Install once:

```bash
npm install --prefix <skill-dir>/scripts
```

Call template:

```bash
node <skill-dir>/scripts/openrouter_capture.mjs \
  --prompt "<user-prompt>" \
  --model "<resolved_model_id>" \
  --save-env
```

With image input (repeatable):

```bash
node <skill-dir>/scripts/openrouter_capture.mjs \
  --prompt "<user-prompt>" \
  --image <path-or-url> \
  --model "<resolved_model_id>" \
  --save-env
```

## Completion Checks

- Mode selected correctly (A or B).
- Model id resolved correctly.
- OpenRouter reply printed immediately.
- No API key exposed in logs.
- Large-file consent requested when needed.
