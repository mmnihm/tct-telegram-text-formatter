const DEFAULT_OPENROUTER_MODEL = "cognitivecomputations/dolphin-mistral-24b-venice-edition:free";

function configuredProviders() {
  const env = process.env;
  const all = {
    openrouter: {
      key: env.OPENROUTER_API_KEY,
      model: String(env.OPENROUTER_MODEL || "").trim() === "openrouter/free" || !String(env.OPENROUTER_MODEL || "").trim()
        ? DEFAULT_OPENROUTER_MODEL
        : String(env.OPENROUTER_MODEL).trim(),
      baseURL: "https://openrouter.ai/api/v1",
      headers: {
        "HTTP-Referer": "https://github.com/mmnihm/tct-telegram-text-formatter",
        "X-Title": "TCT Telegram Formatter"
      }
    },
    openai: {
      key: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      baseURL: env.OPENAI_BASE_URL || "https://api.openai.com/v1"
    },
    deepseek: {
      key: env.DEEPSEEK_API_KEY,
      model: env.DEEPSEEK_MODEL || "deepseek-chat",
      baseURL: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1"
    },
    groq: {
      key: env.GROQ_API_KEY,
      model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
      baseURL: env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
    },
    siliconflow: {
      key: env.SILICONFLOW_API_KEY,
      model: env.SILICONFLOW_MODEL || "Qwen/Qwen2.5-7B-Instruct",
      baseURL: env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1"
    },
    custom: {
      key: env.CUSTOM_AI_API_KEY,
      model: env.CUSTOM_AI_MODEL,
      baseURL: env.CUSTOM_AI_BASE_URL
    }
  };
  return Object.fromEntries(Object.entries(all).filter(([, p]) => p.key && p.model && p.baseURL));
}

function getProviderOrder(available) {
  const preferred = String(process.env.AI_PROVIDER || "auto").trim().toLowerCase();
  const configuredFallbacks = String(process.env.AI_FALLBACK_PROVIDERS || "openrouter,deepseek,openai,groq,siliconflow,custom")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const requested = preferred === "auto" ? configuredFallbacks : [preferred, ...configuredFallbacks.filter(x => x !== preferred)];
  return [...new Set(requested)].filter(name => available[name]);
}

async function requestAI(messages, options = {}) {
  const available = configuredProviders();
  const order = getProviderOrder(available);
  if (!order.length) {
    throw new Error("未配置可用的 AI 服务商。请至少设置 OPENROUTER_API_KEY、OPENAI_API_KEY、DEEPSEEK_API_KEY、GROQ_API_KEY、SILICONFLOW_API_KEY 或 CUSTOM_AI_API_KEY。");
  }

  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 60000);
  const failures = [];
  for (const name of order) {
    const provider = available[name];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(provider.baseURL.replace(/\/+$/, "") + "/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + provider.key,
          "Content-Type": "application/json",
          ...(provider.headers || {})
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2000
        }),
        signal: controller.signal
      });
      const bodyText = await response.text();
      if (!response.ok) {
        failures.push(name + " " + response.status + ": " + bodyText.slice(0, 240));
        continue;
      }
      let data;
      try {
        data = JSON.parse(bodyText);
      } catch {
        failures.push(name + ": API 返回的不是有效 JSON");
        continue;
      }
      const choice = data.choices?.[0];
      const content = (choice?.message?.content || choice?.text || "").trim();
      if (!content) {
        failures.push(name + ": AI 返回空内容 (" + (choice?.finish_reason || data.error?.message || "unknown") + ")");
        continue;
      }
      return { content, provider: name, model: provider.model };
    } catch (error) {
      failures.push(name + ": " + (error.name === "AbortError" ? "请求超时" : (error.message || String(error))).slice(0, 240));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("所有已配置 AI 服务商均失败：" + failures.join("；").slice(0, 900));
}

module.exports = { requestAI };
