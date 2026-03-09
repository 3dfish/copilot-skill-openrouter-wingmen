# OpenRouter Wingmen

`openrouter-wingmen` 在 GitHub Copilot 场景下实现了 OpenClaw Gateway 的部分能力，当前聚焦于 OpenRouter 调用链。

核心变化：不再使用单一 `apikey + model`，而是使用凭据条目集合：

- 通过 4 次交互录入：`apikey -> modelid -> 别名 -> 备注（可选）`
- 至少配置一条
- 调用时通过 `alias` 选择模型与密钥

## 交互入口

- CLI: 通过命令行脚本调用
- VS Code Chat: 通过技能工作流交互

## 仓库结构

```text
.
|-- SKILL.md
|-- README.md
|-- references/
|   |-- agent-compatibility.md
|   |-- protocol.md
|   `-- regression-checklist.md
`-- scripts/
    |-- agent-profiles.json
    |-- openrouter_capture.mjs
    |-- package.json
    `-- package-lock.json
```

## 环境要求

- Node.js 18+
- npm
- OpenRouter API key（至少一条 profile）

## 安装

```bash
npm install --prefix ./scripts
```

## 首次初始化（交互录入 profile）

首次运行且 `openrouter/.env` 不存在 profile 集合时，脚本会要求输入：

- API key（必填）
- Model id（必填）
- 别名 alias（必填）
- 备注 note（可选）
- 是否继续新增下一条
- 默认别名（default alias）

## 快速开始

1. 常规调用（建议显式传 alias）

```bash
node ./scripts/openrouter_capture.mjs \
  --alias work \
  --prompt "用三句话总结这个仓库"
```

2. 长文本调用

```bash
node ./scripts/openrouter_capture.mjs \
  --alias default \
  --prompt-file ./tmp/prompt.txt
```

3. 附件输入（通用）

```bash
node ./scripts/openrouter_capture.mjs \
  --alias work \
  --prompt "分析这个附件" \
  --attachment ./assets/a.pdf
```

4. 列出已配置别名

```bash
node ./scripts/openrouter_capture.mjs --list-aliases
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
- `--save-env`: 将当前 profile 集、默认别名、agent 配置写入 `openrouter/.env`
- `--help`: 查看帮助

## 凭据存储格式

脚本把 profile 集合写入 `openrouter/.env`：

- `OPENROUTER_PROFILE_SET='[{"alias":"default","apiKey":"***","modelId":"openrouter/auto","note":""}]'`
- `OPENROUTER_DEFAULT_ALIAS="alias1"`
- `OPENCLAW_AGENT_PROFILE="github-copilot"`

注意：

- `alias` 允许字符：字母、数字、`.`、`_`、`-`
- 旧格式（`alias:key:model`）已移除，不再支持

## 输出约定

脚本会在仓库根目录创建 `openrouter/` 并输出：

- 对话记录：`*-dialogue.md`（记录每次提问与回答）
- 输入附件：`*-input-attachment-<n>.<ext>`
- 输出附件：`*-attachment-<n>.<ext>`
- 原始兜底：`*-raw-response.md`
- 运行环境：`openrouter/.env`

说明：

- 对话 markdown 中，附件仅记录文件路径，不内联附件内容。

终端标记：

- `[ROUTE] <json>`: 当前 provider/alias/model/agent
- `[TEXT_FILE] <path>`
- `[TEXT_CONTENT_BEGIN] ... [TEXT_CONTENT_END]`
- `[ATTACHMENT_FILE] <path>`
- `[RAW_FILE] <path>`

## 多 Agent 适配

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
- Relay 协议：`references/protocol.md`
- 回归清单：`references/regression-checklist.md`
