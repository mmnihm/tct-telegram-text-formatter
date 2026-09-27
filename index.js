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
      inline_keyboard: Object.keys(styles).map(name => [{ text: name, callback_data: `style:${name}` }])
    }
  };
}

bot.onText(/^\/start$/, msg => {
  users.set(msg.chat.id, { style: "✨ 简洁风", text: "" });
  bot.sendMessage(
    msg.chat.id,
    "👋 欢迎使用文字排版机器人！\n\n把你的文字发给我，我会按照你选择的风格自动排版。\n\n👇 请选择功能：",
    mainKeyboard()
  );
});

bot.onText(/^\/help$/, msg => {
  bot.sendMessage(
    msg.chat.id,
    "📖 使用帮助\n\n1️⃣ 点击「📝 开始排版」\n2️⃣ 发送需要排版的文字\n3️⃣ 在「🎨 排版风格」选择风格\n4️⃣ 点击「🔄 重新排版」重新生成\n\n支持多次修改和重新排版。",
    mainKeyboard()
  );
});

bot.on("callback_query", query => {
  if (!query.data.startsWith("style:")) return;
  const chatId = query.message.chat.id;
  const style = query.data.slice(6);
  const user = users.get(chatId) || { style: "✨ 简洁风", text: "" };
  user.style = style;
  users.set(chatId, user);

  bot.answerCallbackQuery(query.id, { text: `已切换：${style}` });

  if (user.text) {
    bot.sendMessage(chatId, styles[style](user.text), mainKeyboard());
  } else {
    bot.sendMessage(chatId, `🎨 已选择「${style}」\n\n现在把需要排版的文字发给我即可。`, mainKeyboard());
  }
});

bot.on("message", msg => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const user = users.get(chatId) || { style: "✨ 简洁风", text: "" };

  if (msg.text === "📝 开始排版") {
    users.set(chatId, user);
    return bot.sendMessage(chatId, "📝 请直接发送需要排版的文字：", mainKeyboard());
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
      "📖 直接发送文字即可排版。\n\n🎨 可以随时切换风格。\n🔄 可以重新排版上一条内容。",
      mainKeyboard()
    );
  }

  user.text = msg.text;
  users.set(chatId, user);

  bot.sendMessage(
    chatId,
    styles[user.style](msg.text),
    mainKeyboard()
  );
});

bot.on("polling_error", err => {
  console.error("Polling error:", err.message);
});

console.log("✅ TCT 文字排版机器人已启动");
