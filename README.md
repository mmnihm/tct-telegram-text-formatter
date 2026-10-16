# TCT Telegram 文字排版机器人

轻量级 Telegram 中文文字排版机器人，使用 Node.js、Telegram Bot API 和 polling 模式运行，无需开放公网端口或数据库。

## 功能

- 📝「排版」默认使用论坛原帖风：标题下方生成相关标签，保留可识别的作者姓名和发布时间，去掉“楼主”标识，并保留正文段落，不添加图片或擅自补写内容
- 直接发送文字只保存；点击「排版」按当前选中风格处理，默认论坛原帖风
- 🎨 多种排版风格：论坛原帖风、熟女风、少女风、绿帽风、频道发布风
- 🧹 投稿净化：清理常见隐藏/双向控制字符，识别常见引流话术、推广账号与广告文案，并清理部分口头填充词（尽量保留正常正文链接）
- 🤖 AI 智能排版：自动整理标题、段落、列表和关键信息（可选）
- 📢 频道发布风：醒目标题、清晰分段、小标题和简洁分隔线，适合 Telegram 频道推送；不擅自添加宣传内容
- 🔄 重新排版上一条文字
- 🧱 长内容在排版后安全分段发送，尽量保留整篇文章的标题、元数据和格式，不因分段重复识别标题
- 🧪 `npm run check` 会检查 JavaScript 语法并运行格式回归测试
- 🛡️ 对输入文本进行 HTML 转义，避免原文中的尖括号被当作格式标签
- 🧠 限制内存中缓存的会话数量，并防止同一用户重复并发触发 AI 请求

## 部署

需要 Node.js 18 或更新版本（建议使用当前受支持的 LTS 版本）。

```bash
npm install
npm start
```

机器人使用 polling 模式，不需要设置 Webhook 或开放 HTTP 端口。

部署前可运行以下命令检查 JavaScript 语法：

```bash
npm run check
```

## 环境变量

必须配置：

- `BOT_TOKEN`：从 Telegram 的 `@BotFather` 获取的机器人 Token。

AI 功能可选配置：

- `AI_PROVIDER`：首选服务商，支持 `auto`、`openrouter`、`openai`、`deepseek`、`groq`、`siliconflow`、`custom`。默认 `auto`。
- `AI_FALLBACK_PROVIDERS`：失败后的备用顺序，逗号分隔。默认 `openrouter,deepseek,openai,groq,siliconflow,custom`。
- OpenRouter：`OPENROUTER_API_KEY`、可选 `OPENROUTER_MODEL`。默认直接使用 `openrouter/free` 免费模型路由，不会把它替换成某个具体模型。也可以填模型列表中当前仍可用的完整模型 ID。
- OpenAI：`OPENAI_API_KEY`、可选 `OPENAI_MODEL`（默认 `gpt-4o-mini`）、可选 `OPENAI_BASE_URL`。
- DeepSeek：`DEEPSEEK_API_KEY`、可选 `DEEPSEEK_MODEL`（默认 `deepseek-chat`）、可选 `DEEPSEEK_BASE_URL`。
- Groq：`GROQ_API_KEY`、可选 `GROQ_MODEL`（默认 `llama-3.3-70b-versatile`）、可选 `GROQ_BASE_URL`。
- SiliconFlow：`SILICONFLOW_API_KEY`、可选 `SILICONFLOW_MODEL`（默认 `Qwen/Qwen2.5-7B-Instruct`）、可选 `SILICONFLOW_BASE_URL`。
- 其他 OpenAI 兼容接口：配置 `CUSTOM_AI_API_KEY`、`CUSTOM_AI_MODEL`、`CUSTOM_AI_BASE_URL`。

只会尝试已经配置 API Key、模型和接口地址的服务商。请求失败或超时后，会按备用顺序继续尝试下一家；全部失败时会显示各服务商的错误摘要。各服务商需要独立申请 API Key，是否免费及可用额度由服务商决定。未配置任何 AI 服务商时，普通排版、风格切换、重新排版和投稿净化仍可使用。

> 本项目当前不使用数据库。用户最近的文字和所选风格仅保存在进程内存中，机器人重启后会重置；不要把机器人当作持久化草稿存储工具。仓库中不应提交真实 Token 或 API Key。

## 使用方式

1. 启动机器人并发送 `/start`。
2. 发送原文后点击「📝 排版」，默认使用论坛原帖风；点击「🎨 排版风格」可切换为频道发布风、熟女风、少女风或绿帽风。
3. 需要清理明显引流内容时，先发送文字，再点击「🧹 投稿净化」。
4. 配置 OpenRouter 后，可以点击「🤖 AI」使用 AI 排版功能。
5. 点击「🔄 重新排版上一条」可按最近一次使用的排版模式再次整理文字。

也可以发送 `/help` 查看帮助。

## 注意事项

- 投稿净化基于规则匹配，不保证识别所有广告，也可能需要人工复核；重要信息请检查清理结果。
- AI 输出可能存在错误，使用前请核对价格、日期、链接、账号和其他事实信息。
- 不配置 `OPENROUTER_API_KEY` 不影响非 AI 功能。
