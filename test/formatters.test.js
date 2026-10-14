const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
const start = source.indexOf("const styles = {");
const end = source.indexOf("async function sendFormattedText(", start);
assert.ok(start >= 0 && end > start, "formatting function block must exist");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  "const OUTPUT_CHUNK_SIZE = 1000;\n" +
    source.slice(start, end) +
    "\nglobalThis.__formatters = { cleanText, normalizeAdProbe, removeAdContent, formatSmart, formatForumPost, splitFormattedHtml };",
  sandbox
);
const f = sandbox.__formatters;

test("normalizes whitespace and punctuation in obfuscated ad detection", () => {
  assert.equal(f.normalizeAdProbe("点 击 · 链 接"), "点击链接");
});

test("forum output puts tags below the title and keeps publication metadata", () => {
  const output = f.formatForumPost([
    "测试标题",
    "#原有标签 #第二标签",
    "张三 楼主",
    "2026-10-11 12:30",
    "活动时间：2026-10-12",
    "正文内容保留。"
  ].join("\n"));
  assert.match(output, /^<b>测试标题<\/b>\n#[^\n]+/);
  assert.match(output, /👤 #张三/);
  assert.doesNotMatch(output, /作者：张三/);
  assert.doesNotMatch(output, /张三 楼主/);
  assert.match(output, /发布时间：2026-10-11 12:30/);
  assert.match(output, /活动时间：2026-10-12/);
  assert.match(output, /正文内容保留。/);
});

test("does not drop ordinary body text merely because it mentions 楼主", () => {
  const output = f.formatForumPost("帖子标题\n2026-10-11\n这段正文提到了楼主，但不是作者信息。");
  assert.match(output, /这段正文提到了楼主，但不是作者信息。/);
});

test("HTML-special characters are escaped in formatted output", () => {
  const output = f.formatSmart("标题 <测试>\n正文 A & B", "✨ 简洁风");
  assert.match(output, /&lt;测试&gt;/);
  assert.match(output, /A &amp; B/);
});

test("long forum posts are formatted once before being split", () => {
  const raw = "长帖标题\n#测试标签\n作者：张三\n2026-10-11\n" + "正文内容。".repeat(450);
  const formatted = f.formatSmart(raw, "🗂️ 论坛原帖风");
  const chunks = f.splitFormattedHtml(formatted);
  assert.ok(chunks.length > 1, "long output should be split into multiple messages");
  assert.equal(chunks.join("").match(/<b>长帖标题<\/b>/g)?.length, 1);
  assert.equal(chunks.join("").match(/👤 #张三/g)?.length, 1);
  assert.ok(chunks.every(chunk => chunk.length < 1100));
});
