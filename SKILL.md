---
name: openrouter-wingmen
description: "Use this skill whenever the user wants to talk to OpenRouter models through you, either as a relay (you pass messages back and forth) or as a wingman tool model (you ask OpenRouter first, then ask user consent before deeper internal use). Trigger on requests like '和 openrouter 聊聊', '帮我问问 openrouter', '你当传话员', '外援模型', '代问模型', and similar wording."
argument-hint: "Mode A or B, first message, alias/model profile"
---

# OpenRouter Wingmen

This skill packages a repeatable OpenRouter conversation workflow with two modes.

## Modes

### Mode A: Wingman Tool Model

Use this when the user wants outside model input and then asks you to continue working with it.

Flow:

1. Ask/resolve alias for this call.
2. Call OpenRouter with alias-bound API key and model id.
3. Print OpenRouter reply immediately.
4. Ask user authorization before feeding that reply into your own deeper reasoning.
5. If user refuses, do not reuse that reply internally.

### Mode B: Pure Relay

Use this when the user wants you to be a messenger only.

Flow:

1. First turn chat initialization:
   - Ask first relay message.
   - Ask alias (optional; default alias can be used).
2. Later turns:
   - User message is relay content by default.
   - If message contains `--`, split at first `--`:
     - Left side: relay content (send if non-empty).
     - Right side: assistant-only instructions (never forward to OpenRouter).
   - If message starts with `--`, do not call OpenRouter for that turn.

## Alias Credential Set (Mandatory)

- Do not use a single `OPENROUTER_API_KEY + OPENROUTER_MODEL_ID` pair.
- Use 4-step interactive profile input: `apikey -> modelid -> alias -> note(optional)`.
- At least one profile entry must exist.
- Store profiles in `openrouter/.env` as `OPENROUTER_PROFILE_SET`.
- Use `OPENROUTER_DEFAULT_ALIAS` as fallback alias.
- Legacy `alias:key:model` text format is removed and must not be used.

If no profile set exists and the script is interactive, prompt user to enter profile entries.

## Multi-Agent Compatibility

- The script supports `--agent` profiles for runtime identification only.
- Supported profiles: `github-copilot`, `claude-code`, `cursor`, `codex-cli`, `generic`.
- Interaction must stay consistent across all agents: use chat/text input only.
- Do not rely on popup/card UI or agent-specific interaction widgets.

## Output Contract

- Save outputs under `<workspace>/openrouter/`.
- Dialogue outputs: `*-dialogue.md` (question + answer; attachment sections record paths only)
- Attachment outputs: `*-attachment-<n>.<ext>` files
- Credentials file: `openrouter/.env`
- Always print OpenRouter reply immediately in chat.

## Security Rules (Mandatory)

- Never print API keys in chat or terminal logs.
- Prefer interactive/env-based profile setup over command-line key arguments.
- If credentials are missing, collect in chat and persist to `openrouter/.env` with restrictive permissions.

## Large File Authorization (Mandatory)

Before reading saved OpenRouter output files (`.md` or attachments):

- If file size is greater than 50KB (51200 bytes), ask user authorization in chat first.
- If user refuses/skips, do not read content; only report path and size.

## Required Assets

- Script: `./scripts/openrouter_capture.mjs`
- Package: `./scripts/package.json`
- Dependency: `@openrouter/sdk`
- Agent profile config: `./scripts/agent-profiles.json`
- Relay protocol spec: `./references/protocol.md`
- Agent compatibility reference: `./references/agent-compatibility.md`
- Regression checklist: `./references/regression-checklist.md`

## Run Template

Install once:

```bash
npm install --prefix <skill-dir>/scripts
```

Call template:

```bash
node <skill-dir>/scripts/openrouter_capture.mjs \
  --alias <alias> \
  --prompt "<user-prompt>" \
  --agent <agent-profile>
```

Long prompt template:

```bash
node <skill-dir>/scripts/openrouter_capture.mjs \
  --alias <alias> \
  --prompt-file <path-to-prompt.txt> \
  --agent <agent-profile>
```

With attachment input (repeatable):

```bash
node <skill-dir>/scripts/openrouter_capture.mjs \
  --alias <alias> \
  --prompt "<user-prompt>" \
  --attachment <path-or-url> \
  --agent <agent-profile>
```

## Reliability Notes

- For long prompts, prefer `--prompt-file` over shell heredoc/complex quoting.
- Treat terminal-rendered body as preview only; use `[TEXT_FILE]` path as source of truth for full output.
- If output seems cut off, inspect the saved file first, then request continuation in a follow-up call.
- Check `[ROUTE]` marker for provider/alias/model decisions when debugging.

## Completion Checks

- Mode selected correctly (A or B).
- Alias selected correctly (arg or default).
- OpenRouter reply printed immediately.
- No API key exposed in logs.
- Large-file consent requested when needed.
