---
name: copilot-skill-openrouter-wingmen
description: "Use this skill whenever the user wants to route part of a message to an OpenRouter model while keeping the rest as local agent instructions. Trigger on requests like '和 openrouter 聊聊', '帮我问问 openrouter', '代问模型', or when the user writes content wrapped with ==...==."
argument-hint: "user message, alias/model profile"
---

# OpenRouter Wingmen

This skill packages a repeatable OpenRouter conversation workflow with a unified dual-channel syntax.

## Unified Channel Protocol

At any turn, parse user text by the `==...==` rule:

- Content inside `==...==` is the third-party model segment and must be sent to OpenRouter.
- Content outside `==...==` is assistant-local segment and must never be forwarded to OpenRouter.
- If no complete `==...==` pair exists, treat the whole message as assistant-local only and do not call OpenRouter.
- If at least one complete pair exists but the merged inside content is empty after trim, do not call OpenRouter.

Execution flow:

1. Resolve alias for this call (explicit alias first, otherwise default alias).
2. Extract and merge all complete `==...==` segments as OpenRouter prompt body.
3. Send only merged inside content to OpenRouter.
4. Print OpenRouter reply immediately in chat.
5. Handle outside content locally as assistant instructions.

## Alias Credential Set (Mandatory)

- Do not use a single `OPENROUTER_API_KEY + OPENROUTER_MODEL_ID` pair.
- Use 4-step interactive profile input: `apikey -> modelid -> alias -> note(optional)`.
- For `note(optional)`, accept `skip` / `跳过` / `-` as empty note when chat UI cannot send blank messages.
- At least one profile entry must exist.
- Store profiles in `.3rd.env` as `OPENROUTER_PROFILE_SET`.
- Use `OPENROUTER_DEFAULT_ALIAS` as fallback alias.
- Legacy `alias:key:model` text format is not supported.
- On first non-interactive run (when `<cwd>/.3rd.env` does not exist), require explicit `--alias`; do not silently fall back to `default`.

If no profile set exists and the script is interactive, prompt user to enter profile entries.

When an agent needs to create `.3rd.env` directly, use this exact template:

```env
OPENROUTER_DEFAULT_ALIAS=default
OPENROUTER_PROFILE_SET=[{"alias":"default","apiKey":"<your-openrouter-api-key>","modelId":"openrouter/auto","note":""}]
OPENCLAW_AGENT_PROFILE=github-copilot
```

## Multi-Agent Compatibility

- The script supports `--agent` profiles for runtime identification only.
- Supported profiles: `github-copilot`, `claude-code`, `cursor`, `codex-cli`, `generic`.
- Interaction must stay consistent across all agents: use chat/text input only.
- Do not rely on popup/card UI or agent-specific interaction widgets.

## Output Contract

- Save outputs directly under `<cwd>/`.
- Dialogue outputs: `*-dialogue.md` (question + answer; attachment sections record paths only)
- Attachment outputs: `*-attachment-<n>.<ext>` files
- Credentials file: `<cwd>/.3rd.env`
- Always print OpenRouter reply immediately in chat.

## Security Rules (Mandatory)

- Never print API keys in chat or terminal logs.
- Prefer interactive/env-based profile setup over command-line key arguments.
- If credentials are missing, collect in chat and persist to `.3rd.env` with restrictive permissions.

## Large File Authorization (Mandatory)

Before reading saved OpenRouter output files (`.md` or attachments):

- If file size is greater than 50KB (51200 bytes), ask user authorization in chat first.
- If user refuses/skips, do not read content; only report path and size.

## Required Assets

- Script: `./scripts/openrouter_capture.mjs`
- Package: `./scripts/package.json`
- Dependency: `@openrouter/sdk`
- Dependency: `dotenv`
- Credential template: `./.3rd.env.template`
- Agent profile config: `./scripts/agent-profiles.json`
- Channel protocol spec: `./references/protocol.md`
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

- `==...==` channel parsing is applied correctly.
- Alias selected correctly (arg or default).
- OpenRouter reply printed immediately.
- No API key exposed in logs.
- Large-file consent requested when needed.
- Agent consistency check passes: `node ./scripts/openrouter_capture.mjs --check-agent-consistency`.
