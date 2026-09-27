require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
const openrouterKey = process.env.OPENROUTER_API_KEY;
const openrouterModel = process.env.OPENROUTER_MODEL || "openrouter/free";

if (!token) {
  console.error("❌ 未找到 BOT_TOKEN");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const users = new Map();

const styles = {
  "✨ 简洁风": { icon: "✨", divider: false },
  "💎 高级风": { icon: "💎", divider: true },
  "🔥 宣传风": { icon: "🔥", divider: true },
  "📋 信息风": { icon: "📋", divider: true },
  "🌸 可爱风": { icon: "🌸", divider: false },
  "🖤 极简风": { icon: "", divider: false }
};

function getUser(chatId) {
  const user = users.get(chatId) || { style: "✨ 简洁风", text: "" };
  users.set(chatId, user);
  return user;
}

function cleanText(raw) {
  return String(raw || "")
    // Remove the common invisible replacement/object placeholder character.
    .replace(/[\uFFFC\uFFFD]/g, "")
    // Remove zero-width and byte-order-mark characters.
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // Remove other C0 control characters while preserving tabs and newlines.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // Normalize line endings.
    .replace(/\r\n?/g, "\n")
    // Remove trailing spaces/tabs from every line.
    .replace(/[ \t]+$/gm, "")
    // Keep at most one blank line between paragraphs.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const AD_PATTERNS = [
  /^(?:查看|看看|浏览|阅读|进入|点击|跳转).{0,12}(?:其他|更多|以前|历史|上一篇|下一篇).{0,12}(?:投稿|文章|作品|内容)/i,
  /^(?:更多|其他|以前|历史).{0,12}(?:投稿|文章|作品|内容).{0,12}(?:请|可|欢迎|点击|进入)/i,
  /^(?:欢迎|记得|可以|请).{0,12}(?:关注|订阅|收藏|加我|联系我)/i,
  /^(?:关注|订阅|收藏).{0,16}(?:我|作者|主页|频道|账号)/i,
  /^(?:点击|进入|查看|打开).{0,20}(?:链接|主页|频道|群组|个人主页)/i,
  /^(?:更多精彩|更多内容|持续更新|后续更新|还有更多)/i,
  /^(?:想看更多|想看其他|想了解更多).{0,20}(?:投稿|内容|作品|文章)/i,
  /^(?:我的|本人).{0,12}(?:其他投稿|其他作品|更多内容|主页|频道)/i
];

function isAdLine(line) {
  const s = String(line || "").trim();
  if (!s) return false;
  if (AD_PATTERNS.some(pattern => pattern.test(s))) return true;

  // Remove obvious standalone promotional links/usernames when attached to ad wording.
  if (/(?:投稿|作品|内容|主页|频道|关注|订阅|查看更多|更多)/.test(s)
      && /(?:https?:\/\/|t\.me\/|@[A-Za-z0-9_]{3,})/.test(s)) {
    return true;
  }

  return false;
}

function removeAdContent(raw) {
  const text = cleanText(raw);
  if (!text) return "";

  const kept = text
    .split("\n")
    .filter(line => !isAdLine(line));

  return cleanText(kept.join("\n"));
}

function simplifyText(raw) {
  let text = removeAdContent(raw);
  if (!text) return "";

  // Remove common filler words only when they are used as standalone discourse fillers.
  const fillerPatterns = [
    /^(?:然后|然后呢|就是|那个|这个|其实|就是说|怎么说呢|我觉得吧|反正|总之)[，,、：:\s]+/g,
    /(?:[，,、]\s*)?(?:然后呢|就是说|怎么说呢|我觉得吧)(?:[，,、]\s*)?/g
  ];

  for (const pattern of fillerPatterns) {
    text = text.replace(pattern, "");
  }

  // Collapse repeated punctuation without changing normal sentence meaning.
  text = text
    .replace(/[，,]{2,}/g, "，")
    .replace(/[。]{2,}/g, "。")
    .replace(/[！!]{2,}/g, "！")
    .replace(/[？?]{2,}/g, "？")
    .replace(/([。！？!?])\1+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  return cleanText(text);
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isDivider(line) {
  return /^[-_=—─━]{3,}$/.test(line.trim());
}

function isHeading(line) {
  const s = line.trim();
  if (!s || isDivider(s)) return false;
  return /^【.+】$/.test(s)
    || /^(第[一二三四五六七八九十百]+[章节部分]|[一二三四五六七八九十]+[、.．]|\d+[、.．)]|#+\s*)/.test(s)
    || /^(视频验证处|出售内容包含|价格|售价|活动时间|有效期|联系方式|购买方式|注意事项|温馨提示|使用说明|更新内容)\s*[:：]/.test(s)
    || (s.length <= 30 && /[：:]$/.test(s));
}

function isImportant(line) {
  const s = line.trim();
  return /^(视频验证处|出售内容包含)\s*[:：]/.test(s)
    || /(?:\d+(?:\.\d+)?\s*(?:元|分钟|分|天|小时|GB|MB)|¥\s*\d+(?:\.\d+)?)/.test(s);
}

function formatSmart(raw, styleName) {
  const style = styles[styleName] || styles["✨ 简洁风"];
  let text = cleanText(raw);
  if (!text) return "";

  text = text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  const output = [];
  let firstContent = true;

  for (const original of text.split("\n")) {
    const line = original.trim();

    if (!line) {
      if (output.length && output[output.length - 1] !== "") output.push("");
      continue;
    }

    if (isDivider(line)) {
      if (output.length && output[output.length - 1] !== "") output.push("");
      output.push("━━━━━━━━━━━━━━", "");
      continue;
    }

    const heading = isHeading(line);
    const important = isImportant(line);

    if (firstContent) {
      firstContent = false;
      output.push("<b>" + (style.icon ? style.icon + " " : "") + escapeHtml(line) + "</b>");
    } else if (heading || important) {
      if (output.length && output[output.length - 1] !== "") output.push("");
      output.push((heading && !/^【/.test(line) ? "▸ " : "") + "<b>" + escapeHtml(line) + "</b>");
    } else {
      output.push(escapeHtml(line));
    }
  }

  while (output.length && output[output.length - 1] === "") output.pop();

  let result = output.join("\n");
  if (style.divider && result) result = "━━━━━━━━━━━━━━\n" + result + "\n━━━━━━━━━━━━━━";
  return result;
}

function mainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📝 开始排版" }, { text: "🧹 投稿净化" }],
        [{ text: "🤖 AI智能排版" }, { text: "🎨 排版风格" }],
        [{ text: "🔄 重新排版" }, { text: "ℹ️ 使用帮助" }]
      ],
      resize_keyboard: true
    }
  };
}

function styleKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: Object.keys(styles).map(name => [
        { text: name, callback_data: "style:" + name }
      ])
    }
  };
}

function aiKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🤖 AI智能排版当前文字", callback_data: "ai:current" }],
        [{ text: "💎 AI排版 + 高级风", callback_data: "ai:高级风" }],
        [{ text: "🔥 AI排版 + 宣传风", callback_data: "ai:宣传风" }],
        [{ text: "📋 AI排版 + 信息风", callback_data: "ai:信息风" }]
      ]
    }
  };
}

async function aiFormat(text, style = "自动判断") {
  if (!openrouterKey) {
    throw new Error("未配置 OPENROUTER_API_KEY");
  }

  const styleRule = style === "自动判断"
    ? "根据内容自动选择合适的排版结构。"
    : "采用" + style + "的视觉风格。";

  const prompt = [
    "你是中文 Telegram 文字排版助手。",
    "只负责整理用户提供的合法内容，不改变事实，不编造价格、时间、链接、联系方式或其他信息。",
    "保留原文的重要数字、名称、链接和账号。",
    "自动识别标题、小标题、列表、价格、时间、联系方式等并合理分段。",
    "不要写解释、不要加前言，只输出最终排版结果。",
    "不要生成或改写涉及未成年人的色情或性内容；遇到这类内容只回复：无法处理该内容。",
    styleRule,
    "",
    "用户原文：",
    text
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + openrouterKey,
        "HTTP-Referer": "https://github.com/mmnihm/tct-telegram-text-formatter",
        "X-Title": "TCT Telegram Text Formatter"
      },
      body: JSON.stringify({
        model: openrouterModel,
        messages: [
          { role: "system", content: "你是专业的中文 Telegram 文字排版助手，只输出最终结果。" },
          { role: "user", content: prompt }
        ],
        max_tokens: 2500,
        temperature: 0.4
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || ("OpenRouter HTTP " + response.status));
    }

    const result = data?.choices?.[0]?.message?.content?.trim();
    if (!result) throw new Error("AI没有返回内容");
    return result;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("AI请求超时，请稍后再试");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function runAI(chatId, style) {
  const user = getUser(chatId);

  if (!user.text) {
    await bot.sendMessage(chatId, "⚠️ 还没有文字。\n\n请先发送需要排版的文字，再点击「🤖 AI智能排版」。", mainKeyboard());
    return;
  }

  if (!openrouterKey) {
    await bot.sendMessage(
      chatId,
      "⚠️ AI排版目前没有启用。\n\n请在部署平台添加：\nOPENROUTER_API_KEY\n\n普通排版不受影响。",
      mainKeyboard()
    );
    return;
  }

  const wait = await bot.sendMessage(chatId, "🤖 AI正在排版，请稍候…");

  try {
    const result = await aiFormat(user.text, style);
    user.text = result;
    users.set(chatId, user);

    await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
    await bot.sendMessage(chatId, escapeHtml(result), {
      ...mainKeyboard(),
      parse_mode: "HTML"
    });
  } catch (err) {
    console.error("AI error:", err);
    await bot.deleteMessage(chatId, wait.message_id).catch(() => {});
    await bot.sendMessage(
      chatId,
      "❌ AI排版失败\n\n原因：" + err.message + "\n\n请检查 OPENROUTER_API_KEY、OPENROUTER_MODEL 和部署日志。",
      mainKeyboard()
    );
  }
}

bot.onText(/^\/start$/, msg => {
  users.set(msg.chat.id, { style: "✨ 简洁风", text: "" });
  bot.sendMessage(
    msg.chat.id,
    "👋 欢迎使用文字排版机器人！\n\n直接发送文字即可自动排版，也可以使用 AI 智能排版。\n\n👇 请选择功能：",
    mainKeyboard()
  );
});

bot.onText(/^\/help$/, msg => {
  bot.sendMessage(
    msg.chat.id,
    "📖 使用帮助\n\n1️⃣ 直接发送文字：普通排版\n2️⃣ 🧹 投稿净化：去隐藏字符、明显广告和口头废话\n3️⃣ 🤖 AI智能排版：AI自动整理结构\n4️⃣ 🎨 排版风格：选择视觉风格\n5️⃣ 🔄 重新排版：重新整理上一条文字",
    mainKeyboard()
  );
});

bot.on("callback_query", async query => {
  const chatId = query.message?.chat?.id;
  if (!chatId) return;

  const data = query.data || "";

  try {
    if (data.startsWith("style:")) {
      const style = data.slice(6);
      const user = getUser(chatId);
      user.style = styles[style] ? style : "✨ 简洁风";
      users.set(chatId, user);

      await bot.answerCallbackQuery(query.id, { text: "已切换：" + user.style });

      if (user.text) {
        await bot.sendMessage(chatId, formatSmart(user.text, user.style), {
          ...mainKeyboard(),
          parse_mode: "HTML"
        });
      } else {
        await bot.sendMessage(chatId, "🎨 已选择「" + user.style + "」\n\n现在发送需要排版的文字即可。", mainKeyboard());
      }
      return;
    }

    if (data.startsWith("ai:")) {
      await bot.answerCallbackQuery(query.id, { text: "AI开始处理…" });
      const style = data === "ai:current" ? "自动判断" : data.slice(3);
      await runAI(chatId, style);
    }
  } catch (err) {
    console.error("Callback error:", err);
    await bot.sendMessage(chatId, "❌ 操作失败：" + err.message, mainKeyboard()).catch(() => {});
  }
});

bot.on("message", async msg => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const user = getUser(chatId);

  if (msg.text === "📝 开始排版") {
    return bot.sendMessage(chatId, "📝 请直接发送需要排版的文字：", mainKeyboard());
  }

  if (msg.text === "🧹 投稿净化") {
    if (!user.text) {
      return bot.sendMessage(chatId, "🧹 投稿净化\n\n请先发送一段投稿文字，我会自动清理隐藏字符、明显广告、其他投稿推荐和部分口头废话，再进行干净排版。", mainKeyboard());
    }

    const cleaned = simplifyText(user.text);
    user.text = cleaned;
    users.set(chatId, user);

    return bot.sendMessage(
      chatId,
      cleaned ? formatSmart(cleaned, "🖤 极简风") : "⚠️ 清理后没有剩余内容。",
      {
        ...mainKeyboard(),
        parse_mode: "HTML"
      }
    );
  }

  if (msg.text === "🤖 AI智能排版") {
    return bot.sendMessage(
      chatId,
      "🤖 AI智能排版\n\n请选择一种方式：\n\nAI会自动整理标题、段落、列表和关键信息。",
      aiKeyboard()
    );
  }

  if (msg.text === "🎨 排版风格") {
    return bot.sendMessage(chatId, "🎨 请选择排版风格：", styleKeyboard());
  }

  if (msg.text === "🔄 重新排版") {
    if (!user.text) return bot.sendMessage(chatId, "⚠️ 还没有上一条文字，请先发送内容。", mainKeyboard());
    return bot.sendMessage(chatId, formatSmart(user.text, user.style), {
      ...mainKeyboard(),
      parse_mode: "HTML"
    });
  }

  if (msg.text === "ℹ️ 使用帮助") {
    return bot.sendMessage(
      chatId,
      "📖 直接发送文字即可排版。\n\n🧹 投稿净化：自动清理隐藏字符、明显引流广告、其他投稿推荐和部分口头废话。\n🤖 AI智能排版可以自动分析结构。\n🎨 排版风格可以切换视觉样式。\n🔄 重新排版可以再次整理上一条文字。",
      mainKeyboard()
    );
  }

  user.text = cleanText(msg.text);
  users.set(chatId, user);

  return bot.sendMessage(chatId, formatSmart(msg.text, user.style), {
    ...mainKeyboard(),
    parse_mode: "HTML"
  });
});

bot.on("polling_error", err => {
  console.error("Polling error:", err.message);
});

console.log("✅ TCT 文字排版机器人已启动");
