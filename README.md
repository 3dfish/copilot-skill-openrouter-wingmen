# OpenRouter Wingmen

`openrouter-wingmen` 在 GitHub Copilot 场景下实现了 **OpenClaw Gateway 的部分功能**，同时面向 **CLI** 与 **VS Code Chat** 两类交互入口。

它提供了：
- 面向 CLI 与 VS Code Chat 的统一调用约定
- 可复用的 OpenRouter/Gateway 调用脚本
- 传话模式（Relay）协议
- 安全约束（密钥管理、输出读取授权）
- 回归检查清单

## 交互入口

- CLI: 通过命令行脚本直接调用，适合自动化和批处理
- VS Code Chat: 通过技能工作流交互，适合协作式问答和多轮传话

## 适用场景

该技能主要覆盖两种模式：

- Mode A: `Wingman Tool Model`
  - 先向 OpenRouter 询问
  - 先把回复展示给用户
  - 用户授权后再用于后续深度处理

- Mode B: `Pure Relay`
  - 助手仅做传话
  - 用户消息默认转发到 OpenRouter
  - 支持 `--` 分隔本地指令与转发内容

## 仓库结构

```text
.
|-- SKILL.md
|-- README.md
|-- references/
|   |-- protocol.md
|   `-- regression-checklist.md
`-- scripts/
    |-- openrouter_capture.mjs
    |-- package.json
    `-- package-lock.json
```

## 环境要求

- Node.js 18+
- npm
- OpenRouter API Key

## 安装

```bash
npm install --prefix ./scripts
```

## 快速开始

1. 设置环境变量（推荐）

```bash
export OPENROUTER_API_KEY="<your_key>"
export OPENROUTER_MODEL_ID="openrouter/auto"
```

2. 文本请求

```bash
node ./scripts/openrouter_capture.mjs \
  --prompt "用三句话总结这个仓库" \
  --model "openrouter/auto" \
  --save-env
```

3. 长文本请求（推荐用于 README/规范润色）

```bash
node ./scripts/openrouter_capture.mjs \
  --prompt-file ./tmp/prompt.txt \
  --model "openrouter/auto" \
  --save-env
```

4. 文本 + 图片请求（可重复传 `--image`）

```bash
node ./scripts/openrouter_capture.mjs \
  --prompt "分析这两张图的共同视觉元素" \
  --image ./assets/a.png \
  --image https://example.com/b.jpg \
  --model "openrouter/auto"
```

5. 仅图片请求（不传 `--prompt`）

```bash
node ./scripts/openrouter_capture.mjs \
  --image ./assets/sample.png
```

## CLI 参数

- `--prompt <text>`: 直接传入提示词
- `--prompt-file <path>`: 从文件读取多行提示词
- `--image <path-or-url>`: 传入图片，支持本地路径/URL，可重复
- `--model <model-id>`: 指定模型
- `--api-key <key>`: 直接传 key（支持但不推荐）
- `--save-env`: 将当前 key/model 写入 `openrouter/.env`
- `--help`: 查看帮助

查看帮助：

```bash
node ./scripts/openrouter_capture.mjs --help
```

## 输出约定

脚本会在仓库根目录创建 `openrouter/` 并输出：

- 文本文件：`*-response.md`
- 图片文件：`*-image-<n>.<ext>`
- 原始兜底：`*-raw-response.md`
- 运行环境：`openrouter/.env`

终端会打印结构化标记：

- `[TEXT_FILE] <path>`
- `[TEXT_CONTENT_BEGIN] ... [TEXT_CONTENT_END]`
- `[IMAGE_FILE] <path>`
- `[RAW_FILE] <path>`

建议把终端正文当作预览，完整内容以 `[TEXT_FILE]` 对应文件为准。

## Relay 协议（Mode B）

详见 `references/protocol.md`。核心规则：

- 无 `--`：整条消息转发
- `left -- right`：只转发 `left`，`right` 仅本地处理
- `-- local-only`：不调用 OpenRouter
- 多个 `--`：只按第一个分割

## 安全约束

- 不在聊天或终端中泄露 API Key
- 不通过命令行参数暴露密钥（优先环境变量或 `openrouter/.env`）
- 大于 50KB 的输出文件，读取前必须先征得用户授权

## 回归检查

涉及 relay 逻辑、参数解析、输出渲染或安全控制变更时，请执行：

- `references/regression-checklist.md`

## 常见问题

1. `OPENROUTER_API_KEY is required`
   - 检查环境变量是否设置
   - 检查 `openrouter/.env` 是否存在且格式正确

2. 图片读取失败
   - 检查本地路径是否存在
   - 检查 URL 是否可访问

3. 输出看起来被截断
   - 打开 `[TEXT_FILE]` 对应的落盘文件查看完整内容

## 参考

- 技能定义：`SKILL.md`
- Relay 协议：`references/protocol.md`
- 回归清单：`references/regression-checklist.md`
