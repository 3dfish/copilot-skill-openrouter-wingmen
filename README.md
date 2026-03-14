# Wing-Models

`wing-models` 用于让agent直接调用第三方模型。

核心变化：不再使用单一 `apikey + model`，而是使用凭据条目集合：

- 必填 3 步录入：`别名 -> apikey -> modelid`
- 可选录入：`baseURL`（默认为 `https://api.openai.com/v1`）
- 首条凭据也必须逐项录入，不能跳过别名和 modelid
- 为保证多 agent 一致性，凭据录入统一在聊天框逐项采集
- 备注为可选项（可留空）
- 至少配置一条
- 调用时通过 `alias` 选择模型与密钥

## 支持的提供商

本工具兼容所有 OpenAI SDK 兼容的 API：

- OpenAI（默认：`https://api.openai.com/v1`）
- OpenRouter（`https://openrouter.ai/api/v1`）
- Azure OpenAI
- 本地模型（如 Ollama：`http://localhost:11434/v1`）
- 其他任何 OpenAI 兼容端点

## 交互入口

- CLI: 通过命令行脚本调用
- VS Code Chat: 通过技能工作流交互

## 仓库结构

```text
.
|-- .3rd.env.template
|-- SKILL.md
|-- README.md
|-- references/
|   |-- agent-compatibility.md
|   `-- regression-checklist.md
`-- scripts/
    |-- agent-profiles.json
    |-- wing_models.mjs
    |-- package.json
    `-- package-lock.json
```

## 环境要求

- Node.js 18+
- npm
- OpenAI 兼容 API key（至少一条 profile）

## 安装

```bash
npm install --prefix ./scripts
```

## 首次初始化（交互录入 profile）

首次运行且当前工作目录的 `.3rd.env` 不存在 profile 集合时，脚本会要求输入：

- 别名 alias（必填）
- API key（必填）
- Base URL（可选，默认为 `https://api.openai.com/v1`）
- Model id（必填）
- 备注 note（可选，可直接回车留空；若聊天界面不能发送空消息，可输入 `skip` / `跳过` / `-`）
- 是否继续新增下一条
- 默认别名（default alias）

约束：

- 即使是第一条凭据，也必须按上面字段逐项输入，不允许直接套用默认 alias/modelid 模板跳过步骤。

## 快速开始

1. 常规调用（建议显式传 alias）

```bash
node ./scripts/wing_models.mjs \
  --alias work \
  --prompt "用三句话总结这个仓库"
```

2. 长文本调用

```bash
node ./scripts/wing_models.mjs \
  --alias default \
  --prompt-file ./tmp/prompt.txt
```

3. 附件输入（通用）

```bash
node ./scripts/wing_models.mjs \
  --alias work \
  --prompt "分析这个附件" \
  --attachment ./assets/a.pdf
```

4. 列出已配置别名

```bash
node ./scripts/wing_models.mjs --list-aliases
```

## CLI 参数

- `--prompt <text>`: 直接传入提示词
- `--prompt-file <path>`: 从文件读取多行提示词
- `--attachment <path-or-url>`: 传入附件（本地路径/URL/data URL），可重复
- `--image <path-or-url>`: 兼容旧参数，等价于 `--attachment`（已废弃）
- `--alias <alias>`: 本次调用使用的别名
- `--default-alias <alias>`: 指定默认别名（配合 `--save-env` 持久化）
- `--agent <profile>`: 输出 profile（`github-copilot/claude-code/cursor/codex-cli/generic`）
- `--list-aliases`: 列出当前 profile 别名与绑定模型
- `--check-agent-consistency`: 校验各 agent profile 是否保持统一交互契约（`inlineTextPreview=true`、`emitRouteMarker=true`）
- `--save-env`: 将当前 profile 集、默认别名、agent 配置写入 `.3rd.env`
- `--help`: 查看帮助

首次非交互运行注意：

- 如果当前工作目录 `.3rd.env` 尚不存在，且在非交互环境中执行，必须显式传入 `--alias`，否则脚本会报错。
- 这样可以避免首次执行被静默回退为 `default`。

一致性校验示例：

```bash
node ./scripts/wing_models.mjs --check-agent-consistency
```

## 凭据存储格式

脚本把 profile 集合写入当前工作目录的 `.3rd.env`：

- `WING_MODELS_PROFILE_SET=[{"alias":"default","apiKey":"***","baseURL":"https://api.openai.com/v1","modelId":"gpt-4o","note":""}]`
- `WING_MODELS_DEFAULT_ALIAS="alias1"`
- `OPENCLAW_AGENT_PROFILE="github-copilot"`

说明：

- `WING_MODELS_PROFILE_SET` 按原始 JSON 保存（不额外包裹 JSON 字符串转义层），避免在不同 agent/runtime 间反复读写时出现逐层反斜杠转义累积。

推荐模板（可直接用于 `.3rd.env`，模板文件为仓库根目录 `.3rd.env.template`）：

```env
WING_MODELS_DEFAULT_ALIAS=<default-alias-from-chat>
WING_MODELS_PROFILE_SET=[{"alias":"<alias-from-chat>","apiKey":"<api-key-from-chat>","baseURL":"https://api.openai.com/v1","modelId":"<model-id-from-chat>","note":""}]
OPENCLAW_AGENT_PROFILE=github-copilot
```

提示：

- 上述占位值应来自聊天逐项采集结果，不应保留 `default` / `gpt-4o` 作为首条凭据的隐式默认。

注意：

- `alias` 允许字符：Unicode 字母/数字（含中文）、`.`、`_`、`-`
- `baseURL` 可选，默认为 `https://api.openai.com/v1`
- 旧格式（`alias:key:model`）不支持

## 输出约定

脚本会在当前工作目录（`cwd`）直接输出：

- 对话记录：`*-dialogue.md`（记录每次提问与回答）
- 输入附件：`*-input-attachment-<n>.<ext>`
- 输出附件：`*-attachment-<n>.<ext>`
- 原始兜底：`*-raw-response.md`
- 运行环境：当前工作目录 `.3rd.env`

说明：

- 对话 markdown 中，附件仅记录文件路径，不内联附件内容。

终端标记：

- `[ROUTE] <json>`: 当前 provider/alias/baseURL/model/agent
- `[TEXT_FILE] <path>`
- `[TEXT_CONTENT_BEGIN] ... [TEXT_CONTENT_END]`
- `[ATTACHMENT_FILE] <path>`
- `[RAW_FILE] <path>`

## 多Agent 适配

当前支持：

- GitHub Copilot
- Claude Code
- Cursor
- Codex CLI
- Generic fallback

交互一致性约束：

- 所有 agent 统一使用聊天/文本输入交互
- 不依赖卡片或 popup 控件

详见 `references/agent-compatibility.md`。

## 安全约束

- 不在聊天或终端里泄露 API key
- 不建议在命令参数中明文传 key
- 大于 50KB 的输出文件，读取前需要用户授权

## 参考

- 技能定义：`SKILL.md`
- Agent 兼容：`references/agent-compatibility.md`
- 回归清单：`references/regression-checklist.md`

## 许可证

本项目采用 GNU GPL-3.0-or-later License，详见 `LICENSE`。