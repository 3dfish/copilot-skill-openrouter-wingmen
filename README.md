# OpenRouter Wingmen

一个用于 VS Code Copilot 技能场景的 OpenRouter 对话工作流包，支持两种模式：

- Mode A (`Wingman Tool Model`): 先向 OpenRouter 询问，再由助手继续深度处理
- Mode B (`Pure Relay`): 助手仅做传话，不对转述内容做二次加工

项目目标是把 OpenRouter 的调用流程、安全约束、输出落盘和回归检查标准化。

## 主要能力

- 统一的 OpenRouter CLI 调用脚本：`scripts/openrouter_capture.mjs`
- 支持文本与多图输入（重复 `--image`）
- 自动将输出保存到 `openrouter/` 目录（文本 `.md`、图片文件）
- 支持工作区级 `.env`（`openrouter/.env`）持久化
- 定义了 Mode B 的 `--` 分隔协议与回归检查清单

## 目录结构

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
- 可用的 OpenRouter API Key

## 快速开始

1. 安装依赖

```bash
npm install --prefix ./scripts
```

2. 配置环境变量（推荐）

```bash
export OPENROUTER_API_KEY="<your_key>"
export OPENROUTER_MODEL_ID="openrouter/auto"
```

3. 发送一次文本请求

```bash
node ./scripts/openrouter_capture.mjs \
  --prompt "用三句话总结这个仓库" \
  --model "openrouter/auto" \
  --save-env
```

4. 文本 + 图片输入

```bash
node ./scripts/openrouter_capture.mjs \
  --prompt "分析这两张图的共同视觉元素" \
  --image ./assets/a.png \
  --image https://example.com/b.jpg \
  --model "openrouter/auto"
```

5. 仅图片输入（不传 `--prompt`）

```bash
node ./scripts/openrouter_capture.mjs \
  --image ./assets/sample.png
```

## 脚本参数

`openrouter_capture.mjs` 支持以下参数：

- `--prompt <text>`: 用户消息文本
- `--image <path-or-url>`: 图片输入，可重复
- `--model <model-id>`: 模型 ID
- `--api-key <key>`: API Key（可用但不推荐，见安全说明）
- `--save-env`: 将当前 key/model 写入 `openrouter/.env`
- `--help`: 查看帮助

可以直接查看帮助：

```bash
node ./scripts/openrouter_capture.mjs --help
```

## 输出说明

脚本会在仓库根目录下创建 `openrouter/` 并写入结果：

- 文本响应：`*-response.md`
- 图片响应：`*-image-<n>.<ext>`
- 原始兜底：`*-raw-response.md`（未识别到文本/图片结构时）
- 环境文件：`.env`

命令行会打印结构化标记，便于上层流程捕获：

- `[TEXT_FILE] <path>`
- `[TEXT_CONTENT_BEGIN] ... [TEXT_CONTENT_END]`
- `[IMAGE_FILE] <path>`
- `[RAW_FILE] <path>`

## Mode B 协议（Relay）

Mode B 使用 `--` 作为分隔符，规则见 `references/protocol.md`：

- 不含 `--`: 整条消息转发给 OpenRouter
- `left -- right`: 仅转发 `left`，`right` 作为助手本地指令
- `-- only_local`: 不调用 OpenRouter，只执行本地指令
- 多个 `--`: 仅按第一个分割

## 回归检查

修改以下行为后，应执行 `references/regression-checklist.md`：

- Relay 协议解析
- 参数解析与模型切换逻辑
- 输出时序和渲染
- 安全约束（密钥与大文件授权）
- 多模态输入能力

## 安全与实践建议

- 推荐通过环境变量或 `openrouter/.env` 提供 API Key
- 避免在命令行中直接传 `--api-key`，以减少密钥暴露风险
- 不要将 `openrouter/.env` 或敏感输出提交到公开仓库
- 若用于代理/传话模式，严格遵守 `SKILL.md` 中的授权与展示规则

## 故障排查

- 提示 `OPENROUTER_API_KEY is required`:
  - 检查 `OPENROUTER_API_KEY` 是否设置
  - 或确认 `openrouter/.env` 是否存在且格式正确
- 图片读取失败:
  - 检查本地路径是否正确
  - 检查 URL 是否可访问
- 没有文本输出，只有 raw 文件:
  - 模型返回结构可能不含标准文本/图片块，请检查 `*-raw-response.md`

## 参考文档

- 技能定义：`SKILL.md`
- Relay 协议：`references/protocol.md`
- 回归清单：`references/regression-checklist.md`
