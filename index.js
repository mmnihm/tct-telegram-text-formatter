require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const http = require("http");
const { requestAI } = require("./ai-provider");

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error("❌ 未找到 BOT_TOKEN");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const users = new Map();
const aiBusy = new Set();
const MAX_CACHED_USERS = 5000;
const OUTPUT_CHUNK_SIZE = 1000;

const styles = {
  "✨ 简洁风": { icon: "✨", divider: false },
  "💎 高级风": { icon: "💎", divider: true },
  "🔥 宣传风": { icon: "🔥", divider: true },
  "📋 信息风": { icon: "📋", divider: true },
  "🌸 可爱风": { icon: "🌸", divider: false },
  "🖤 极简风": { icon: "", divider: false },
  "📢 频道发布风": { icon: "📢", divider: true },
  "✦ 熟女风": { icon: "✦", divider: true },
  "♡ 少女风": { icon: "♡", divider: true }
};

function getUser(chatId) {
  let user = users.get(chatId);
  if (!user) {
    if (users.size >= MAX_CACHED_USERS) {
      const oldestChatId = users.keys().next().value;
      if (oldestChatId !== undefined) users.delete(oldestChatId);
    }
    user = { style: "✨ 简洁风", text: "", nextFormatMode: null, lastFormatMode: null, aiChat: false, history: [], channelTemplate: null, settingTemplate: false };
    users.set(chatId, user);
  }
  return user;
}

function cleanText(raw) {
  return String(raw || "")
    .replace(/[\uFFFC\uFFFD]/g, "")
    .replace(/[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "")
    .replace(/\u3000/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const AD_PATTERNS = [
  /^(?:查看|看看|浏览|阅读|进入|点击|跳转).{0,18}(?:其他|更多|以前|历史|上一篇|下一篇).{0,18}(?:投稿|文章|作品|内容)/i,
  /^(?:更多|其他|以前|历史).{0,18}(?:投稿|文章|作品|内容).{0,18}(?:请|可|欢迎|点击|进入)/i,
  /^(?:欢迎|记得|可以|请|别忘了).{0,18}(?:关注|订阅|收藏|加我|联系我|私信|进群)/i,
  /^(?:关注|订阅|收藏).{0,20}(?:我|作者|主页|频道|账号|备用号)/i,
  /^(?:点击|进入|查看|打开|复制|长按).{0,24}(?:链接|主页|频道|群组|个人主页|电报|飞机|网盘|下载页)/i,
  /^(?:更多精彩|更多内容|持续更新|后续更新|还有更多|每日更新|防失联|备用频道|最新地址)/i,
  /^(?:想看更多|想看其他|想了解更多).{0,24}(?:投稿|内容|作品|文章)/i,
  /^(?:我的|本人).{0,16}(?:其他投稿|其他作品|更多内容|主页|频道|账号)/i,
  /^(?:进群|加群|入群|加好友|私聊|私信|联系管理员|商务合作|广告合作)\s*[:：!！👉➡️\s]/i,
  /^(?:群满|防封|防失联|最新地址|新地址|永久地址|回家地址|点击直达)\s*[:：!！👉➡️\s]/i,
  /^(?:tg|电报|飞机|频道|群组)\s*(?:搜索|搜|关注|订阅|加入|进群)\s*[:：]/i
];

function normalizeAdProbe(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "")
    .replace(/[\s·•.。_—–-]+/g, "");
}

function isAdLine(line) {
  const s = cleanText(line);
  if (!s) return false;
  const probe = normalizeAdProbe(s);
  if (AD_PATTERNS.some(pattern => pattern.test(s))) return true;
  const promoPhrases = ["关注频道", "订阅频道", "进群获取", "加群获取", "私信获取", "点击链接", "点击进群", "点击加入", "更多精彩内容", "持续更新中", "最新地址", "备用频道", "防失联", "广告合作", "商务合作", "免费领取", "扫码添加", "加我获取", "联系管理员获取"];
  if (promoPhrases.some(phrase => probe.includes(normalizeAdProbe(phrase)))) return true;
  const hasUrlOrHandle = /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|@[A-Za-z0-9_]{3,})/i.test(s);
  const hasPromotionContext = /(?:投稿|作品|内容|主页|频道|关注|订阅|查看更多|更多|进群|加群|私信|联系|领取|下载|推广|广告|商务|备用|防失联|最新地址)/i.test(s);
  if (hasUrlOrHandle && hasPromotionContext) return true;
  if (/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[A-Za-z0-9_+/?=-]+\s*$/i.test(s)) return false;
  if (/^(?:投稿邮箱|投稿方式|商务合作|广告投放|推广联系|加群方式|备用频道|引流群)\s*[:：]/i.test(s)) return true;
  return false;
}

function removeAdContent(raw) {
  const text = cleanText(raw);
  if (!text) return "";
  const lines = text.split("\n");
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    const previous = i > 0 ? lines[i - 1] : "";
    const isExplicitCta = /(?:点击|进入|加入|关注|订阅|私信|联系|加群|进群|扫码|领取).{0,20}(?:链接|频道|群|主页|账号|获取|联系|下载)/i.test(line);
    const nextIsSocialLink = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[A-Za-z0-9_+/?=-]+\s*$/i.test(next.trim());
    if ((isExplicitCta || isAdLine(line)) && nextIsSocialLink) { i++; continue; }
    const currentIsSocialLink = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[A-Za-z0-9_+/?=-]+\s*$/i.test(line.trim());
    if (currentIsSocialLink && /(?:点击|加入|关注|订阅|进群|加群|备用频道|防失联|最新地址)/i.test(previous)) continue;
    if (!isAdLine(line)) kept.push(line);
  }
  return cleanText(kept.join("\n"));
}

function simplifyText(raw) {
  let text = removeAdContent(raw);
  if (!text) return "";
  const fillerPatterns = [/^(?:然后|然后呢|就是|那个|这个|其实|就是说|怎么说呢|我觉得吧|反正|总之)[，,、：:\s]+/g, /(?:[，,、]\s*)?(?:然后呢|就是说|怎么说呢|我觉得吧)(?:[，,、]\s*)?/g];
  for (const pattern of fillerPatterns) text = text.replace(pattern, "");
  text = text.replace(/[，,]{2,}/g, "，").replace(/[。]{2,}/g, "。").replace(/[！!]{2,}/g, "！").replace(/[？?]{2,}/g, "？").replace(/([。！？!?])\1+/g, "$1").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return cleanText(text);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, String.fromCharCode(38) + "amp;")
    .replace(/</g, String.fromCharCode(38) + "lt;")
    .replace(/>/g, String.fromCharCode(38) + "gt;");
}

function isDivider(line) {
  return /^[-_=—─━]{3,}$/.test(line.trim());
}

// 统一识别作者行：去掉“楼主”，作者名前只保留一个 #。
// 只处理明确的作者/楼主格式，避免误删正文里正常出现的“楼主”。
function normalizeAuthorName(raw) {
  return String(raw || "").replace(/^[#＃\s]+/, "").replace(/\s*(?:[#＃|｜·•]\s*)?楼主\s*$/, "").replace(/^[#＃\s]+/, "").trim();
}

function matchAuthorRole(line) {
  return String(line || "").trim().match(/^[#＃]?([\p{Script=Han}A-Za-z0-9_.-]{1,40})\s*楼主$/u);
}

function isHeading(line) {
  const s = line.trim();
  if (!s || isDivider(s)) return false;
  return /^【.+】$/.test(s) || /^(第[一二三四五六七八九十百]+[章节部分]|[一二三四五六七八九十]+[、.．]|\d+[、.．)]|#+\s*)/.test(s) || /^(视频验证处|出售内容包含|价格|售价|活动时间|有效期|联系方式|购买方式|注意事项|温馨提示|使用说明|更新内容)\s*[:：]/.test(s) || (s.length <= 30 && /[：:]$/.test(s));
}

function isImportant(line) {
  const s = line.trim();
  return /^(视频验证处|出售内容包含)\s*[:：]/.test(s) || /(?:\d+(?:\.\d+)?\s*(?:元|分钟|分|天|小时|GB|MB)|¥\s*\d+(?:\.\d+)?)/.test(s);
}

function formatSmart(raw, styleName, template) {
  const style = styles[styleName] || styles["✨ 简洁风"];
  let text = cleanText(raw);
  if (!text) return "";
  if (styleName === "🗂️ 论坛原帖风") return formatForumPost(text);
  if (styleName === "📢 频道发布风") return formatChannelPost(text, template);
  if (styleName === "✦ 熟女风") return formatMaturePost(text);
  if (styleName === "♡ 少女风") return formatGirlPost(text);
  text = text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  const output = [];
  let firstContent = true;
  for (const original of text.split("\n")) {
    const line = original.trim();
    if (!line) { if (output.length && output[output.length - 1] !== "") output.push(""); continue; }
    if (isDivider(line)) { if (output.length && output[output.length - 1] !== "") output.push(""); output.push("━━━━━━━━━━━━━━", ""); continue; }
    const heading = isHeading(line);
    const important = isImportant(line);
    if (firstContent) { firstContent = false; output.push("<b>" + (style.icon ? style.icon + " " : "") + escapeHtml(line) + "</b>"); }
    else if (heading || important) { if (output.length && output[output.length - 1] !== "") output.push(""); output.push((heading && !/^【/.test(line) ? "▸ " : "") + "<b>" + escapeHtml(line) + "</b>"); }
    else output.push(escapeHtml(line));
  }
  while (output.length && output[output.length - 1] === "") output.pop();
  let result = output.join("\n");
  if (style.divider && result) result = "━━━━━━━━━━━━━━\n" + result + "\n━━━━━━━━━━━━━━";
  return result;
}

function formatChannelPost(raw, template) {
  const text = cleanText(raw);
  if (!text) return "";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  const title = lines[0].replace(/^【|】$/g, "").replace(/^📢\s*/, "").replace(/^[✨💎🔥📋🌸🖤📢]\s*/, "");
  const skipRe = /^(?:更多|关注|订阅|点赞|转发|分享到|👉|觉得有用|收藏一下|伦理之爱|售价|钻石|￥|¥)/;
  const timeOnlyRe = /^(?:(?:\d{1,2}:\d{2}(?::\d{2})?)|(?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s+\d{1,2}:\d{2})?)|发布时间|发布于|日期)\s*[:：]?\s*[\d\-/:年月日\s]*$/;
  const authorRe = /^[#＃]?([\p{Script=Han}A-Za-z0-9_.-]{1,40})\s*楼主$/u;
  const explicitAuthorRe = /^(?:作者|发布者|用户)\s*[:：]\s*(.+)$/;
  const dateRe = /^(?:(?:发布时间|发布于|日期)\s*[:：]?\s*)?\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/;
  const statsRe = /^(?:\S{2,24})?(?:99\+\s*)?\d{2,}(?:\s*阅读)?$/;
  const bodyLines = lines.slice(1).filter(l =>
    !isDivider(l) &&
    !skipRe.test(l) &&
    !timeOnlyRe.test(l) &&
    !dateRe.test(l) &&
    !statsRe.test(l) &&
    !authorRe.test(l) &&
    !explicitAuthorRe.test(l)
  );

  let authorTag = "";
  for (const line of lines.slice(1)) {
    const match = line.match(authorRe);
    const explicit = line.match(explicitAuthorRe);
    if (match && !authorTag) authorTag = "👤 #" + normalizeAuthorName(match[1]);
    else if (explicit && !authorTag) authorTag = "👤 #" + normalizeAuthorName(explicit[1]);
  }

  // 保留第一段有效介绍，再补充最多两个有价值的要点，避免只抓到标题或统计信息。
  const candidates = [];
  for (const line of bodyLines) {
    const cleaned = line.replace(/^[▸▪️•\-\d.、]+\s*/, "").trim();
    if (cleaned.length < 6) continue;
    if (/^\S{2,20}\+\d+$/.test(cleaned) || /售价\s*[:：]?\s*\d/.test(cleaned) || /\d+\.?\d*\s*钻石/.test(cleaned)) continue;
    if (candidates.includes(cleaned)) continue;
    candidates.push(cleaned);
  }
  const points = [];
  // 优先保留原文最前面的介绍，避免被后面的短标签、统计项挤掉。
  if (candidates.length) points.push(candidates[0]);
  for (const line of candidates.slice(1)) {
    if (points.length >= 3) break;
    if (isHeading(line) || isImportant(line) || line.length >= 12) points.push(line);
  }
  if (points.length < 3) {
    for (const line of candidates.slice(1)) {
      if (points.length >= 3) break;
      if (!points.includes(line)) points.push(line);
    }
  }

  const pointsText = points.slice(0, 3).map(p => "• " + escapeHtml(p)).join("\n");
  const action = "👉 觉得有用就收藏一下";
  const tpl = (template || "<b>{结论}</b>\n\n{要点}\n\n{行动}").trim();
  const titleOut = authorTag ? escapeHtml(title) + "\n" + escapeHtml(authorTag) : escapeHtml(title);
  let result = tpl
    .replace(/\{结论\}/g, titleOut)
    .replace(/\{要点\}/g, pointsText || "")
    .replace(/\{行动\}/g, action);
  result = result.replace(/(👉\s*觉得有用就收藏一下\s*)+/g, "👉 觉得有用就收藏一下");
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function extractTitleAndBody(raw) {
  const lines = cleanText(raw).split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { title: "", body: "", tags: [] };
  let title = lines[0]
    .replace(/^【|】$/g, "")
    .replace(/^[✨💎🔥📋🌸🖤📢✦♡]\s*/, "")
    .replace(/^(?:熟女|少女)\s*[｜|]\s*/, "")
    .trim();
  const bodyLines = lines.slice(1).filter(l => !isDivider(l) && !/^(?:#+\s*)+$/.test(l));
  const body = bodyLines.join("\n");
  // 简单从正文和标题里抽一些可能的标签
  const tagCandidates = [];
  const addTag = (t) => {
    const tag = String(t || "").replace(/^#+/, "").replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").trim();
    if (tag.length >= 2 && tag.length <= 10 && !tagCandidates.includes(tag)) tagCandidates.push(tag);
  };
  for (const m of (title + " " + body).matchAll(/#([\p{Script=Han}A-Za-z0-9]{2,10})/gu)) addTag(m[1]);
  const keywords = title.split(/[，。！？!?、：:｜|\s\-—_【】\[\]()（）]+/).filter(Boolean);
  for (const k of keywords) if (k.length <= 8) addTag(k);
  return { title, body, tags: tagCandidates.slice(0, 5) };
}

function formatMaturePost(raw) {
  const { title, body, tags } = extractTitleAndBody(raw);
  if (!title && !body) return "";
  const displayTitle = title || "熟女";
  const defaultTags = ["熟女", "人妻", "成熟"];
  const allTags = [...new Set([...defaultTags, ...tags])].slice(0, 6);
  const tagStr = allTags.map(t => "#" + t).join("  ");
  const desc = body || "";
  let result = `<b>✦ 熟女｜${escapeHtml(displayTitle)}</b>\n\n`;
  if (desc) result += escapeHtml(desc) + "\n\n";
  result += "————————————\n\n" + escapeHtml(tagStr);
  return result.trim();
}

function formatGirlPost(raw) {
  const { title, body, tags } = extractTitleAndBody(raw);
  if (!title && !body) return "";
  const displayTitle = title || "少女";
  const defaultTags = ["少女", "清纯", "软萌"];
  const allTags = [...new Set([...defaultTags, ...tags])].slice(0, 6);
  const tagStr = allTags.map(t => "#" + t).join("  ");
  const desc = body || "";
  let result = `<b>♡ 少女｜${escapeHtml(displayTitle)}</b>\n\n`;
  if (desc) result += escapeHtml(desc) + "\n\n";
  result += "————————————\n\n" + escapeHtml(tagStr);
  return result.trim();
}

function makeForumTags(title, lines) {
  const stopWords = new Set(["这个", "那个", "一个", "一些", "我们", "他们", "然后", "就是", "真的", "可以", "内容", "分享", "标题", "原帖", "求助", "大家", "今天", "现在", "本人", "作者", "什么", "怎么", "为什么", "有没有", "求一个", "谢谢大家", "帮忙看看"]);
  const candidates = [];
  const add = value => {
    const tag = String(value || "").replace(/^#+/, "").replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").trim();
    if (tag.length < 2 || tag.length > 12 || stopWords.has(tag) || candidates.includes(tag)) return;
    candidates.push(tag);
  };
  const sourceLines = [title, ...lines.slice(0, 12)];
  for (const sourceLine of sourceLines) for (const match of sourceLine.matchAll(/#([\p{Script=Han}A-Za-z0-9]{2,12})/gu)) add(match[1]);
  const titleParts = title.split(/[，。！？!?、：:｜|\/\s\-—_【】\[\]()（）]+/).filter(Boolean);
  for (const part of titleParts) if (part.length <= 12) add(part);
  const bodyText = lines.slice(0, 12).filter(line => !/楼主\s*$/.test(line) && !/^(?:作者|发布者|用户|发布时间)\s*[:：]/.test(line)).filter(line => !/^\d{4}-\d{2}-\d{2}/.test(line) && !isDivider(line)).filter(line => !/^(?:#[\p{Script=Han}A-Za-z0-9]{2,12}\s*)+$/u.test(line.trim())).join(" ");
  for (const match of bodyText.matchAll(/[\p{Script=Han}]{2,6}|[A-Za-z][A-Za-z0-9]{1,11}|\d{2,}/gu)) { add(match[0]); if (candidates.length >= 4) break; }
  return candidates.slice(0, 4).map(tag => "#" + tag).join(" ");
}

function formatForumPost(raw) {
  const lines = cleanText(raw).split("\n");
  const titleIndex = lines.findIndex(line => line.trim() && !isDivider(line.trim()));
  if (titleIndex < 0) return "";
  const title = lines[titleIndex].trim();
  const contentLines = lines.slice(titleIndex + 1);
  const tags = makeForumTags(title, contentLines);
  const output = ["<b>" + escapeHtml(title) + "</b>"];
  if (tags) output.push(escapeHtml(tags));
  const body = [];
  let authorAdded = false;
  let dateAdded = false;
  for (const original of contentLines) {
    const line = original.trim();
    if (!line || isDivider(line)) { if (body.length && body[body.length - 1] !== "") body.push(""); continue; }
    if (/^(?:#[\p{Script=Han}A-Za-z0-9]{2,12}\s*)+$/u.test(line)) continue;
    const authorRole = matchAuthorRole(line);
    if (authorRole) {
      const author = normalizeAuthorName(authorRole[1]);
      if (author && !authorAdded) { body.push("👤 #" + escapeHtml(author)); authorAdded = true; }
      continue;
    }
    const explicitAuthor = line.match(/^(?:作者|发布者|用户)\s*[:：]\s*(.+)$/);
    if (explicitAuthor) {
      const author = normalizeAuthorName(explicitAuthor[1]);
      if (author && !authorAdded) { body.push("👤 #" + escapeHtml(author)); authorAdded = true; }
      continue;
    }
    const dateMatch = line.match(/^(?:发布时间|发布于|日期)\s*[:：]?\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)$/) || line.match(/^(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)$/);
    if (dateMatch && !dateAdded) { body.push("🕒 发布时间：" + escapeHtml(dateMatch[1].replace("T", " "))); dateAdded = true; continue; }
    body.push(escapeHtml(line));
  }
  while (body.length && body[0] === "") body.shift();
  while (body.length && body[body.length - 1] === "") body.pop();
  if (body.length) output.push("", "━━━━━━━━━━━━━━", "", ...body);
  output.push("", "━━━━━━━━━━━━━━");
  return output.join("\n");
}

function splitTextSafely(raw, maxLength = OUTPUT_CHUNK_SIZE) {
  const text = cleanText(raw);
  if (!text) return [];
  const chunks = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (Array.from(line).length > maxLength) { if (current) { chunks.push(current); current = ""; } const chars = Array.from(line); for (let i = 0; i < chars.length; i += maxLength) chunks.push(chars.slice(i, i + maxLength).join("")); continue; }
    const candidate = current ? current + "\n" + line : line;
    if (Array.from(candidate).length > maxLength) { if (current) chunks.push(current); current = line; } else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitFormattedHtml(raw, maxLength = OUTPUT_CHUNK_SIZE) {
  const text = String(raw || "");
  if (!text) return [];
  const chunks = [];
  let current = "";
  let currentLength = 0;
  let openBold = false;
  const tokens = text.match(/<b>|<\/b>|&(?:amp|lt|gt|quot|#39);|[\s\S]/g) || [];
  for (const token of tokens) {
    if (token === "<b>") { current += token; currentLength += token.length; openBold = true; continue; }
    if (token === "</b>") { current += token; currentLength += token.length; openBold = false; continue; }
    if (token === "\n") { if (currentLength + 1 > maxLength && current) { if (openBold) current += "</b>"; chunks.push(current); current = openBold ? "<b>" : ""; currentLength = current.length; } else { current += token; currentLength += 1; } continue; }
    if (currentLength + token.length > maxLength && current) { if (openBold) current += "</b>"; chunks.push(current); current = openBold ? "<b>" : ""; currentLength = current.length; }
    current += token;
    currentLength += token.length;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendFormattedText(chatId, raw, styleName, keyboard = mainKeyboard()) {
  const user = getUser(chatId);
  const tpl = styleName === "📢 频道发布风" ? user.channelTemplate : null;
  const formatted = formatSmart(raw, styleName, tpl);
  const chunks = splitFormattedHtml(formatted);
  if (!chunks.length) return bot.sendMessage(chatId, "⚠️ 没有可排版的文字。", keyboard);
  for (let i = 0; i < chunks.length; i++) {
    const options = { parse_mode: "HTML" };
    if (i === chunks.length - 1 && keyboard) Object.assign(options, keyboard);
    await bot.sendMessage(chatId, chunks[i], options);
  }
}

function mainKeyboard() {
  return { reply_markup: { keyboard: [[{ text: "📢 频道发布风" }, { text: "📝 开始排版" }], [{ text: "🧹 投稿净化" }, { text: "🎨 排版风格" }], [{ text: "🤖 AI智能排版" }, { text: "🔄 重新排版" }], [{ text: "⚙️ 设置频道模板" }, { text: "ℹ️ 使用帮助" }]], resize_keyboard: true } };
}

function styleKeyboard() {
  return { reply_markup: { inline_keyboard: [
    [{ text: "✨ 简洁风", callback_data: "style:✨ 简洁风" }, { text: "💎 高级风", callback_data: "style:💎 高级风" }],
    [{ text: "🔥 宣传风", callback_data: "style:🔥 宣传风" }, { text: "📋 信息风", callback_data: "style:📋 信息风" }],
    [{ text: "🌸 可爱风", callback_data: "style:🌸 可爱风" }, { text: "🖤 极简风", callback_data: "style:🖤 极简风" }],
    [{ text: "📢 频道发布风", callback_data: "style:📢 频道发布风" }],
    [{ text: "✦ 熟女风", callback_data: "style:✦ 熟女风" }, { text: "♡ 少女风", callback_data: "style:♡ 少女风" }]
  ] } };
}

function aiKeyboard() {
  return { reply_markup: { inline_keyboard: [[{ text: "自动判断", callback_data: "ai:自动判断" }], [{ text: "频道发布风", callback_data: "ai:频道发布风" }], [{ text: "使用当前风格", callback_data: "ai:current" }], [{ text: "💬 进入多轮对话", callback_data: "ai:chat" }]] } };
}
