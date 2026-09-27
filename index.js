require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isDivider(line) {
  return /^[-_=—─━]{3,}$/.test(line.trim());
}

function isHeading(line) {
  const s = line.trim();
  if (!s || isDivider(s)) return false;
  return /^【.+】$/.test(s)
    || /^(第[一二三四五六七八九十百]+[章节部分]|[一二三四五六七八九十]+[、.．]|\\d+[、.．)]|#+\\s*)/.test(s)
    || /^(视频验证处|出售内容包含|价格|售价|活动时间|有效期|联系方式|购买方式|注意事项|温馨提示|使用说明|更新内容)\\s*[:：]/.test(s)
    || (s.length <= 30 && /[：:]$/.test(s));
}

function isImportant(line) {
  const s = line.trim();
  return /^(视频验证处|出售内容包含)\\s*[:：]/.test(s)
    || /(?:\\d+(?:\\.\\d+)?\\s*(?:元|分钟|分|天|小时|GB|MB)|¥\\s*\\d+(?:\\.\\d+)?)/.test(s);
}

function formatSmart(raw, styleName) {
  const style = styles[styleName] || styles["✨ 简洁风"];
  let text = String(raw || "").replace(/\\r/g, "").trim();
  if (!text) return "";

  text = text.replace(/[ \\t]+$/gm, "").replace(/\\n{3,}/g, "\\n\\n");
  const lines = text.split("\\n");
  const output = [];
  let firstContent = true;

  for (const original of lines) {
    const line = original.trim();
    if (!line) {
      if (output.length && output[output.length - 1] !== "") output.push("");
      continue;
    }

    if (isDivider(line)) {
      if (output.length && output[output.length - 1] !== "") output.push("");
      output.push("━━━━━━━━━━━━━━");
      output.push("");
      continue;
    }

    const heading = isHeading(line);
    const important = isImportant(line);

    if (firstContent) {
      firstContent = false;
      output.push("<b>" + (style.icon ? style.icon + " " : "") + escapeHtml(line) + "</b>");
      continue;
    }

    if (heading || important) {
      if (output.length && output[output.length - 1] !== "") output.push("");
      const prefix = heading && !/^【/.test(line) ? "▸ " : "";
      output.push(prefix + "<b>" + escapeHtml(line) + "</b>");
      continue;
    }

    output.push(escapeHtml(line));
  }

  while (output.length && output[output.length - 1] === "") output.pop();

  let result = output.join("\\n");
  if (style.divider && result) {
    result = "━━━━━━━━━━━━━━\\n" + result + "\\n━━━━━━━━━━━━━━";
  }
  return result;
}

function mainKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📝 开始排版" }, { text: "🎨 排版风格" }],
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

function sendFormatted(chatId, text, style) {
  return bot.sendMessage(chatId, formatSmart(text, style), {
    ...mainKeyboard(),
    parse_mode: "HTML"
  });
}

bot.onText(/^\\/start$/, msg => {
  users.set(msg.chat.id, { style: "✨ 简洁风", text: "" });
  bot.sendMessage(
    msg.chat.id,
    "👋 欢迎使用文字排版机器人！\\n\\n直接发送文字即可自动整理。标题、视频信息、价格和关键内容会自动突出，正文尽量保持原文。\\n\\n👇 请选择功能：",
    mainKeyboard()
  );
});

bot.onText(/^\\/help$/, msg => {
  bot.sendMessage(
    msg.chat.id,
    "📖 使用帮助\\n\\n1️⃣ 直接发送文字：自动排版\\n2️⃣ 🎨 排版风格：选择视觉风格\\n3️⃣ 🔄 重新排版：重新整理上一条文字\\n\\n标题自动加粗；视频验证、出售内容、价格、时间等关键行自动突出；不主动添加原文没有的信息。",
    mainKeyboard()
  );
});

bot.on("callback_query", async query => {
  const chatId = query.message?.chat?.id;
  if (!chatId) return;

  const data = query.data || "";
  if (!data.startsWith("style:")) return;

  const style = data.slice(6);
  const user = getUser(chatId);
  user.style = styles[style] ? style : "✨ 简洁风";
  users.set(chatId, user);

  await bot.answerCallbackQuery(query.id, { text: "已切换：" + user.style });

  if (user.text) {
    await sendFormatted(chatId, user.text, user.style);
  } else {
    await bot.sendMessage(
      chatId,
      "🎨 已选择「" + user.style + "」\\n\\n现在把需要排版的文字发给我即可。",
      mainKeyboard()
    );
  }
});

bot.on("message", async msg => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const user = getUser(chatId);

  if (msg.text === "📝 开始排版") {
    return bot.sendMessage(chatId, "📝 请直接发送需要排版的文字：", mainKeyboard());
  }

  if (msg.text === "🎨 排版风格") {
    return bot.sendMessage(chatId, "🎨 请选择排版风格：", styleKeyboard());
  }

  if (msg.text === "🔄 重新排版") {
    if (!user.text) {
      return bot.sendMessage(chatId, "⚠️ 还没有上一条文字，请先发送需要排版的内容。", mainKeyboard());
    }
    return sendFormatted(chatId, user.text, user.style);
  }

  if (msg.text === "ℹ️ 使用帮助") {
    return bot.sendMessage(
      chatId,
      "📖 直接发送文字即可排版。\\n\\n标题会自动加粗，视频信息、价格、时间等关键内容会单独突出，正文不会被机器人随意改写。",
      mainKeyboard()
    );
  }

  user.text = msg.text;
  users.set(chatId, user);
  return sendFormatted(chatId, msg.text, user.style);
});

bot.on("polling_error", err => {
  console.error("Polling error:", err.message);
});

console.log("✅ TCT 文字排版机器人已启动");
