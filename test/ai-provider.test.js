const test = require("node:test");
const assert = require("node:assert/strict");
const { requestAI } = require("../ai-provider");

test("falls back to the next configured provider when the primary model fails", async () => {
  const envKeys = [
    "AI_PROVIDER", "AI_FALLBACK_PROVIDERS",
    "OPENROUTER_API_KEY", "OPENROUTER_MODEL",
    "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DEEPSEEK_BASE_URL",
    "OPENAI_API_KEY", "GROQ_API_KEY", "SILICONFLOW_API_KEY", "CUSTOM_AI_API_KEY"
  ];
  const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const calls = [];

  Object.assign(process.env, {
    AI_PROVIDER: "auto",
    AI_FALLBACK_PROVIDERS: "openrouter,deepseek",
    OPENROUTER_API_KEY: "test-openrouter-key",
    OPENROUTER_MODEL: "openrouter/free",
    DEEPSEEK_API_KEY: "test-deepseek-key"
  });
  for (const key of ["OPENAI_API_KEY", "GROQ_API_KEY", "SILICONFLOW_API_KEY", "CUSTOM_AI_API_KEY"]) delete process.env[key];

  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    if (calls.length === 1) {
      return { ok: false, status: 404, text: async () => '{"error":{"message":"model not found"}}' };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "排版完成" } }] })
    };
  };

  try {
    const result = await requestAI([{ role: "user", content: "测试" }], { timeoutMs: 1000 });
    assert.equal(result.content, "排版完成");
    assert.equal(result.provider, "deepseek");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.model, "cognitivecomputations/dolphin-mistral-24b-venice-edition:free");
    assert.equal(calls[1].url, "https://api.deepseek.com/v1/chat/completions");
    assert.equal(calls[1].body.model, "deepseek-chat");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});
