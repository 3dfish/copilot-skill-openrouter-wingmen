---
name: wing-models
description: "Use this skill whenever the user wants to route part of a message to an OpenAI-compatible model while keeping the rest as local agent instructions. Trigger on requests like '和模型聊聊', '帮我问问模型', '代问模型', or when the user writes content wrapped with ==...==."
argument-hint: "user message, alias/model profile"
---

# Wing-Models

This skill packages a repeatable OpenAI-compatible model conversation workflow with a unified dual-channel syntax.

## Unified Channel Protocol

At any turn, parse user text by the `==...==` rule:

- Content inside `==...==` is the third-party model segment and must be sent to the configured model.
- Content outside `==...==` is assistant-local segment and must never be forwarded to the model.
- If no complete `==...==` pair exists, treat the whole message as assistant-local only and do not call the model.
- If at least one complete pair exists but the merged inside content is empty after trim, do not call the model.

Execution flow:

1. Resolve alias for this call (explicit alias first, otherwise default alias).
2. Extract and merge all complete `==...==` segments as model prompt body.
3. Send only merged inside content to the configured OpenAI-compatible endpoint.
4. Print model reply immediately in chat.
5. Handle outside content locally as assistant instructions.

## Alias Credential Set (Mandatory)

- Do not use a single `API_KEY + MODEL_ID` pair.
- Use required 4-step interactive profile input: `alias -> apikey -> baseurl -> modelid`.
- For every credential entry (including the first one), collect `alias`, `apikey`, `baseurl`, and `modelid` one-by-one in chat.
- `baseurl` is optional and defaults to `https://openrouter.ai/api/v1`.
- Never auto-fill first-entry `alias`/`modelid` from template defaults.
- `note` is optional and may be left empty; accept `skip` / `跳过` / `-` as empty note when chat UI cannot send blank messages.
- At least one profile entry must exist.
- Store profiles in `.3rd.env` as `WING_MODELS_PROFILE_SET`.
- Use `WING_MODELS_DEFAULT_ALIAS` as fallback alias.
- Legacy `alias:key:model` text format is not supported.
- On first non-interactive run (when `<cwd>/.3rd.env` does not exist), require explicit `--alias`; do not silently fall back to `default`.

If no profile set exists and the script is interactive, prompt user to enter profile entries.

When an agent needs to create `.3rd.env` directly after collecting fields in chat, use this structure:

```env
WING_MODELS_DEFAULT_ALIAS=<default-alias-from-chat>
WING_MODELS_PROFILE_SET=[{"alias":"<alias-from-chat>","apiKey":"<api-key-from-chat>","baseURL":"https://openrouter.ai/api/v1","modelId":"<model-id-from-chat>","note":""}]
OPENCLAW_AGENT_PROFILE=github-copilot
```

## Supported Providers

This skill works with any OpenAI-compatible API, including:

- OpenRouter (default: `https://openrouter.ai/api/v1`)
- OpenAI (`https://api.openai.com/v1`)
- Azure OpenAI (`https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT`)
- Local models (e.g., `http://localhost:11434/v1` for Ollama)
- Any other OpenAI-compatible endpoint

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
- Always print model reply immediately in chat.

## Security Rules (Mandatory)

- Never print API keys in chat or terminal logs.
- Prefer interactive/env-based profile setup over command-line key arguments.
- If credentials are missing, collect in chat and persist to `.3rd.env` with restrictive permissions.

## Large File Authorization (Mandatory)

Before reading saved model output files (`.md` or attachments):

- If file size is greater than 50KB (51200 bytes), ask user authorization in chat first.
- If user refuses/skips, do not read content; only report path and size.

## Required Assets

- Script: `./scripts/wing_models.mjs`
- Package: `./scripts/package.json`
- Dependency: `openai`
- Dependency: `dotenv`
- Credential template: `./.3rd.env.template`
- Agent profile config: `./scripts/agent-profiles.json`
- Channel protocol spec: `./references/protocol.md`
- Agent compatibility reference: `./references/agent-compatibility.md`
- Regression checklist: `./references/regression-checklist.md`

## Runtime Readiness Check (Automatic)

Before executing the script, **always** verify runtime prerequisites automatically:

### Pre-flight Checklist

1. **Check Node availability**: Run `node --version` to verify Node.js is installed and accessible.
2. **Check npm availability**: Run `npm --version` to verify npm is installed and accessible.
3. **Check dependency installation**: Run `npm list --prefix <skill-dir>/scripts openai dotenv` to verify both dependencies are installed.

### Auto-install Logic

If any check fails:

1. If `node` or `npm` is unavailable, report the missing tool and halt execution. Ask user to install Node.js first.
2. If dependencies are missing (exit code non-zero), auto-run:
   ```bash
   npm install --prefix <skill-dir>/scripts
   ```
3. Re-run the dependency check after installation.
4. If installation fails, report the error and halt execution.

### Implementation Pattern

```bash
# Step 1: Check node
node --version || { echo "Node.js not found. Please install Node.js."; exit 1; }

# Step 2: Check npm
npm --version || { echo "npm not found. Please install Node.js with npm."; exit 1; }

# Step 3: Check dependencies
npm list --prefix <skill-dir>/scripts openai dotenv 2>/dev/null || npm install --prefix <skill-dir>/scripts

# Step 4: Proceed with script
node <skill-dir>/scripts/wing_models.mjs --alias <alias> --prompt "<prompt>" --agent <agent>
```

### One-time Install Verification

For first-time use or after clearing node_modules, the above pattern ensures dependencies are installed transparently without manual intervention.

## Run Template

Install once:

```bash
npm install --prefix <skill-dir>/scripts
```

Call template:

```bash
node <skill-dir>/scripts/wing_models.mjs \
  --alias <alias> \
  --prompt "<user-prompt>" \
  --agent <agent-profile>
```

Long prompt template:

```bash
node <skill-dir>/scripts/wing_models.mjs \
  --alias <alias> \
  --prompt-file <path-to-prompt.txt> \
  --agent <agent-profile>
```

With attachment input (repeatable):

```bash
node <skill-dir>/scripts/wing_models.mjs \
  --alias <alias> \
  --prompt "<user-prompt>" \
  --attachment <path-or-url> \
  --agent <agent-profile>
```

## Reliability Notes

- For long prompts, prefer `--prompt-file` over shell heredoc/complex quoting.
- Treat terminal-rendered body as preview only; use `[TEXT_FILE]` path as source of truth for full output.
- If output seems cut off, inspect the saved file first, then request continuation in a follow-up call.
- Check `[ROUTE]` marker for provider/alias/model/baseURL decisions when debugging.

## Completion Checks

- **Runtime readiness verified**: Node.js and npm are available, dependencies are installed.
- `==...==` channel parsing is applied correctly.
- Alias selected correctly (arg or default).
- Model reply printed immediately.
- No API key exposed in logs.
- Large-file consent requested when needed.
- Agent consistency check passes: `node ./scripts/wing_models.mjs --check-agent-consistency`.