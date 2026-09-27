require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
const openaiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-5.6-luna";

if (!token) {
  console.error("❌ 未找到 BOT_TOKEN");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const users = new Map();

const styles = {
  "✨ 简洁风": text => `📝 ${text}`,
  "💎 高级风": text => `━━━━━━━━━━━━━━
💎 ${text}
━━━━━━━━━━━━━━`,
  "🔥 宣传风": text => `🔥【${text}】🔥
✨ 精彩内容 · 值得关注
`,
  "📋 信息风": text => `📌 ${text}

━━━━━━━━━━━━━━
📋 详细信息
━━━━━━━━━━━━━━`,
  "🌸 可爱风": text => `🌸 ${text} 🌸
૮₍ ˶ᵔ ᵕ ᵔ˶ ₎ა
`,
  "🖤 极简风": text => `【${text}】`
};

function mainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📝 开始排版" }, { text: "🤖 AI智能排版" }],
        [{ text: "🎨 排版风格" }, { text: "🔄 重新排版" }],
        [{ text: "ℹ️ 使用帮助" }]
      ],
      resize_keyboard: true
    }
  };
}

function styleKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: Object.keys(styles).map(name => [
        { text: name, callback_data: `style:${name}` }
      ])
    }
  };
}

function aiKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🤖 AI智能排版当前文字", callback_data: "ai:current" }],
        [{ text: "🎨 AI排版 + 高级风", callback_data: "ai:高级风" }],
        [{ text: "🔥 AI排版 + 宣传风", callback_data: "ai:宣传风" }],
        [{ text: "📋 AI排版 + 信息风", callback_data: "ai:信息风" }]
      ]
    }
  };
}

async function aiFormat(text, style = "自动判断") {
  if (!openaiKey) {
    throw new Error("未配置 OPENAI_API_KEY");
  }

  const styleRule = style === "自动判断"
    ? "请根据内容自动选择最合适的排版风格。"
    : `请使用「${style}」作为主要视觉风格。`;

  const prompt = `你是一个专业的中文文字排版助手。
任务：把用户提供的原始文字整理成可以直接发布到 Telegram 的成品。

严格要求：
1. 不改变原意，不虚构事实，不添加用户没有提供的优惠、价格、时间、联系方式等信息。
2. 保留重要数字、链接、账号、名称和关键信息。
3. 自动识别内容类型，例如公告、通知、活动、商品介绍、价格表、推广文案、普通信息等。
4. 合理分段，增加清晰的标题和层级。
5. 只在有帮助时使用 Emoji，不要滥用。
6. 使用 Telegram 友好的纯文本排版。
7. 不要解释你做了什么，不要加“以下是排版结果”等前缀，只输出最终成品。
8. ${styleRule}

用户原文：
---
${text}
---`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: openaiModel,
      input: prompt,
      max_output_tokens: 2000
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI API HTTP ${response.status}`);
  }

  if (data.output_text) return data.output_text.trim();

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }

  const result = parts.join("\n").trim();
  if (!result) throw new Error("AI没有返回排版结果");
  return result;
}

async function runAI(chatId, user, style = "自动判断") {
  if (!user.text) {
    return bot.sendMessage(chatId, "⚠️ 还没有文字，请先发送需要排版的内容。", mainKeyboard());
  }

  if (!openaiKey) {
    return bot.sendMessage(
      chatId,
      "⚠️ AI功能还没有配置。\n\n管理员需要在部署平台添加 OPENAI_API_KEY。\n\n原来的普通排版功能仍然可以正常使用。",
      mainKeyboard()
    );
  }

  const wait = await bot.sendMessage(chatId, "🤖 AI正在智能排版，请稍候…");

  try {
    const result = await aiFormat(user.text, style);
    user.aiText = result;
    users.set(chatId, user);

    await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
    await bot.sendMessage(chatId, result, mainKeyboard());
  } catch (err) {
    console.error("AI error:", err.message);
    await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
    await bot.sendMessage(
      chatId,
      `❌ AI排版失败\n\n${err.message}\n\n请检查 OPENAI_API_KEY 和 OPENAI_MODEL 配置。`,
      mainKeyboard()
    );
  }
}

bot.onText(/^\/start$/, msg => {
  users.set(msg.chat.id, { style: "✨ 简洁风", text: "", aiText: "" });
  bot.sendMessage(
    msg.chat.id,
    "👋 欢迎使用文字排版机器人！\n\n把原始文字发给我，可以使用普通排版，也可以让 AI 自动分析内容并重新排版。\n\n👇 请选择功能：",
    mainKeyboard()
  );
});

bot.onText(/^\/help$/, msg => {
  bot.sendMessage(
    msg.chat.id,
    "📖 使用帮助\n\n1️⃣ 点击「📝 开始排版」发送文字\n2️⃣ 点击「🤖 AI智能排版」让 AI 自动整理\n3️⃣ 「🎨 排版风格」可以选择固定风格\n4️⃣ 「🔄 重新排版」重新生成上一条内容\n\nAI会尽量保持原意，不虚构原文没有的信息。",
    mainKeyboard()
  );
});

bot.on("callback_query", async query => {
  const chatId = query.message.chat.id;
  const data = query.data || "";

  if (data.startsWith("style:")) {
    const style = data.slice(6);
    const user = users.get(chatId) || { style: "✨ 简洁风", text: "", aiText: "" };
    user.style = style;
    users.set(chatId, user);

    await bot.answerCallbackQuery(query.id, { text: `已切换：${style}` });

    if (user.text) {
      await bot.sendMessage(chatId, styles[style](user.text), mainKeyboard());
    } else {
      await bot.sendMessage(chatId, `🎨 已选择「${style}」\n\n现在把需要排版的文字发给我即可。`, mainKeyboard());
    }
    return;
  }

  if (data.startsWith("ai:")) {
    const style = data.slice(3);
    const user = users.get(chatId) || { style: "✨ 简洁风", text: "", aiText: "" };
    await bot.answerCallbackQuery(query.id, { text: "AI正在处理…" });
    await runAI(chatId, user, style === "current" ? "自动判断" : style);
  }
});

bot.on("message", async msg => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const user = users.get(chatId) || { style: "✨ 简洁风", text: "", aiText: "" };

  if (msg.text === "📝 开始排版") {
    return bot.sendMessage(chatId, "📝 请直接发送需要排版的文字：", mainKeyboard());
  }

  if (msg.text === "🤖 AI智能排版") {
    return bot.sendMessage(
      chatId,
      "🤖 AI智能排版\n\n请选择：\n\nAI会自动判断你的文字属于公告、宣传、商品、价格表等哪种类型，并整理成可以直接发布的版本。",
      aiKeyboard()
    );
  }

  if (msg.text === "🎨 排版风格") {
    return bot.sendMessage(chatId, "🎨 请选择排版风格：", styleKeyboard());
  }

  if (msg.text === "🔄 重新排版") {
    if (!user.text) {
      return bot.sendMessage(chatId, "⚠️ 还没有上一条文字，请先发送需要排版的内容。", mainKeyboard());
    }
    return bot.sendMessage(chatId, styles[user.style](user.text), mainKeyboard());
  }

  if (msg.text === "ℹ️ 使用帮助") {
    return bot.sendMessage(
      chatId,
      "📖 直接发送文字即可排版。\n\n🤖 AI智能排版：AI自动分析内容并整理。\n🎨 排版风格：手动选择固定风格。\n🔄 重新排版：重新生成上一条普通排版。",
      mainKeyboard()
    );
  }

  user.text = msg.text;
  users.set(chatId, user);

  return bot.sendMessage(chatId, styles[user.style](msg.text), mainKeyboard());
});

bot.on("polling_error", err => {
  console.error("Polling error:", err.message);
});

console.log("✅ TCT 文字排版机器人已启动");
