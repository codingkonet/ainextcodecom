const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.1";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AINEXTCODE_API_KEY = process.env.AINEXTCODE_API_KEY;
const AINEXTCODE_MODEL = process.env.AINEXTCODE_MODEL || "ainextcode-agent";
const AINEXTCODE_API_BASE_URL = (process.env.AINEXTCODE_API_BASE_URL || "https://ai.ainextcode.com/v1").replace(/\/+$/, "");
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_RECEIVER_EMAIL = process.env.PAYPAL_RECEIVER_EMAIL || "";
const PAYPAL_MODE = process.env.PAYPAL_MODE || "sandbox";
const PAYPAL_BASE_URL = PAYPAL_MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

const BASE_INSTRUCTIONS = `You are an AI assistant powered by a multi-model platform. Your purpose is to provide clear, accurate, and practical help to users.

Role:
Act as a knowledgeable, friendly, and professional assistant.

Core Behavior:
- Understand the user's request before answering.
- Ask clarifying questions when the request is unclear.
- Provide step-by-step guidance when it is helpful.
- Keep answers concise unless the user asks for more detail.
- Do not invent facts. If you are unsure, say so clearly.
- Adapt your tone, depth, and style to the user's needs.

Output Style:
- Use simple and direct language.
- Organize answers with headings or bullet points when useful.
- Include examples when they make the answer easier to understand.
- End with practical next steps when appropriate.

Goal:
Help users solve problems, make better decisions, learn new things, and complete tasks efficiently.`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const providerIds = ["openai", "gemini", "claude", "openrouter", "ainextcode"];

const defaultPlans = [
  {
    id: "free",
    name: "Free Access",
    price: 0,
    currency: "USD",
    interval: "month",
    providerAccess: providerIds,
    messageLimit: 1000000,
    features: ["Free multi-model chat", "OpenRouter free model presets", "Plugins and themes"],
    active: true
  }
];

const defaultFreeModels = [
  {
    id: "deepseek-r1-free",
    name: "DeepSeek R1 Free",
    provider: "openrouter",
    model: "deepseek/deepseek-r1-0528:free",
    active: true
  },
  {
    id: "llama-3-3-free",
    name: "Llama 3.3 Free",
    provider: "openrouter",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    active: true
  },
  {
    id: "mistral-small-free",
    name: "Mistral Small Free",
    provider: "openrouter",
    model: "mistralai/mistral-small-3.2-24b-instruct:free",
    active: true
  }
];

const defaultPlugins = [
  {
    id: "writing",
    name: "Writing Studio",
    description: "Improves drafts, emails, summaries, and tone.",
    prompt: "When the user asks for writing help, improve clarity, structure, tone, and usefulness.",
    active: true
  },
  {
    id: "coding",
    name: "Code Helper",
    description: "Adds practical coding, debugging, and architecture guidance.",
    prompt: "When the user asks for technical help, provide careful, testable engineering guidance.",
    active: true
  },
  {
    id: "business",
    name: "Business Coach",
    description: "Supports plans, offers, operations, and customer communication.",
    prompt: "When the user asks about business, focus on practical execution, positioning, and next steps.",
    active: true
  }
];

const defaultThemes = [
  { id: "sage", name: "Sage", active: true },
  { id: "midnight", name: "Midnight", active: true },
  { id: "paper", name: "Paper", active: true },
  { id: "signal", name: "Signal", active: true }
];

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    writeDb({
      users: [],
      sessions: [],
      plans: defaultPlans,
      plugins: defaultPlugins,
      themes: defaultThemes,
      freeModels: defaultFreeModels,
      settings: {
        paypalEmail: PAYPAL_RECEIVER_EMAIL
      },
      apiAccessKeys: [],
      payments: []
    });
  }
}

function readDb() {
  ensureDb();
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  data.freeModels ||= defaultFreeModels;
  data.themes ||= defaultThemes;
  data.settings ||= { paypalEmail: PAYPAL_RECEIVER_EMAIL };
  data.settings.paypalEmail ||= PAYPAL_RECEIVER_EMAIL;
  data.apiAccessKeys ||= [];
  data.plans = [defaultPlans[0]];
  for (const theme of defaultThemes) {
    if (!data.themes.some(item => item.id === theme.id)) {
      data.themes.push(theme);
    }
  }
  return data;
}

function writeDb(db) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, `${JSON.stringify(db, null, 2)}\n`);
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function jsonBody(req) {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, apiKeys, ...safeUser } = user;
  safeUser.apiKeyStatus = {
    openai: Boolean(apiKeys?.openai),
    gemini: Boolean(apiKeys?.gemini),
    claude: Boolean(apiKeys?.claude),
    openrouter: Boolean(apiKeys?.openrouter),
    ainextcode: Boolean(apiKeys?.ainextcode)
  };
  safeUser.modelPrefs ||= {};
  return safeUser;
}

function cookieHeader(name, value, options = {}) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), candidate);
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function hashApiKey(key) {
  return crypto.createHash("sha256").update(String(key || "")).digest("hex");
}

function generateApiKey() {
  return `axc_${crypto.randomBytes(32).toString("base64url")}`;
}

function publicApiAccessKey(item) {
  return {
    id: item.id,
    name: item.name,
    prefix: item.prefix,
    active: item.active !== false,
    createdAt: item.createdAt,
    lastUsedAt: item.lastUsedAt || null
  };
}

function getSession(req, db = readDb()) {
  const token = parseCookies(req).session;
  if (!token) return { db, user: null, session: null };

  const now = Date.now();
  const session = db.sessions.find(item => item.token === token && item.expiresAt > now);
  if (!session) return { db, user: null, session: null };

  const user = db.users.find(item => item.id === session.userId && item.status !== "disabled");
  return { db, user, session };
}

function requireUser(req, res) {
  const context = getSession(req);
  if (!context.user) {
    sendJson(res, 401, { error: "Please log in first." });
    return null;
  }
  return context;
}

function requireAdmin(req, res) {
  const context = requireUser(req, res);
  if (!context) return null;
  if (context.user.role !== "admin") {
    sendJson(res, 403, { error: "Admin access required." });
    return null;
  }
  return context;
}

function authenticateApiAccessKey(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const db = readDb();
  const keyHash = hashApiKey(match[1].trim());
  const apiKey = db.apiAccessKeys.find(item => item.keyHash === keyHash && item.active !== false);
  if (!apiKey) return null;

  const user = db.users.find(item => item.id === apiKey.userId && item.status !== "disabled");
  if (!user) return null;

  apiKey.lastUsedAt = new Date().toISOString();
  return { db, user, apiKey };
}

function currentUsageMonth() {
  return new Date().toISOString().slice(0, 7);
}

function safeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => message && ["user", "assistant"].includes(message.role))
    .map(message => ({
      role: message.role,
      content: String(message.content || "").slice(0, 8000)
    }))
    .filter(message => message.content.trim().length > 0)
    .slice(-20);
}

function buildInstructions({ specialization, plugins, enabledPluginIds }) {
  const cleanSpecialization = String(specialization || "general help").slice(0, 300);
  const selectedPlugins = plugins
    .filter(plugin => plugin.active && enabledPluginIds.includes(plugin.id))
    .map(plugin => `Plugin: ${plugin.name}\n${plugin.prompt || plugin.description}`)
    .join("\n\n");

  return `${BASE_INSTRUCTIONS}

Specialization:
You specialize in ${cleanSpecialization}.

Enabled capabilities:
${selectedPlugins || "No extra plugins are enabled for this conversation."}`;
}

function providersStatus(user = null) {
  const apiKeys = user?.apiKeys || {};
  const modelPrefs = user?.modelPrefs || {};
  return [
    {
      id: "openai",
      name: "OpenAI",
      defaultModel: modelPrefs.openai || OPENAI_MODEL,
      configured: Boolean(apiKeys.openai || OPENAI_API_KEY),
      source: apiKeys.openai ? "user" : OPENAI_API_KEY ? "server" : "missing"
    },
    {
      id: "gemini",
      name: "Gemini",
      defaultModel: modelPrefs.gemini || GEMINI_MODEL,
      configured: Boolean(apiKeys.gemini || GEMINI_API_KEY),
      source: apiKeys.gemini ? "user" : GEMINI_API_KEY ? "server" : "missing"
    },
    {
      id: "claude",
      name: "Claude",
      defaultModel: modelPrefs.claude || CLAUDE_MODEL,
      configured: Boolean(apiKeys.claude || ANTHROPIC_API_KEY),
      source: apiKeys.claude ? "user" : ANTHROPIC_API_KEY ? "server" : "missing"
    },
    {
      id: "openrouter",
      name: "OpenRouter Free",
      defaultModel: modelPrefs.openrouter || "deepseek/deepseek-r1-0528:free",
      configured: Boolean(apiKeys.openrouter || OPENROUTER_API_KEY),
      source: apiKeys.openrouter ? "user" : OPENROUTER_API_KEY ? "server" : "missing"
    },
    {
      id: "ainextcode",
      name: "AInextcode API",
      defaultModel: modelPrefs.ainextcode || AINEXTCODE_MODEL,
      configured: Boolean(apiKeys.ainextcode || AINEXTCODE_API_KEY),
      source: apiKeys.ainextcode ? "user" : AINEXTCODE_API_KEY ? "server" : "missing"
    }
  ];
}

function planForUser(db, user) {
  return db.plans.find(plan => plan.id === user.planId) || db.plans.find(plan => plan.id === "free") || db.plans[0];
}

function providerModel(provider, model, user = null) {
  if (model) return String(model).trim();
  const modelPrefs = user?.modelPrefs || {};
  if (modelPrefs[provider]) return modelPrefs[provider];
  if (provider === "openrouter") return "deepseek/deepseek-r1-0528:free";
  if (provider === "ainextcode") return AINEXTCODE_MODEL;
  if (provider === "gemini") return GEMINI_MODEL;
  if (provider === "claude") return CLAUDE_MODEL;
  return OPENAI_MODEL;
}

function chatCompletionText(data) {
  const content = data.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map(part => part.text || "").join("").trim();
  }
  return String(content || "").trim();
}

function geminiText(data) {
  return (data.candidates || [])
    .flatMap(candidate => candidate.content?.parts || [])
    .map(part => part.text || "")
    .join("")
    .trim();
}

function claudeText(data) {
  return (data.content || [])
    .map(part => part.text || "")
    .join("")
    .trim();
}

async function callOpenAI({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("OpenAI is not configured. Add an OpenAI API key in API Settings.");

  const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: instructions },
        ...messages.map(message => ({ role: message.role, content: message.content }))
      ]
    })
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(data.error?.message || "OpenAI request failed.");
  return chatCompletionText(data);
}

async function callGemini({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("Gemini is not configured. Add a Gemini API key in API Settings.");

  const contents = messages.map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));

  const apiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents
      })
    }
  );

  const data = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(data.error?.message || "Gemini request failed.");
  return geminiText(data);
}

async function callClaude({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("Claude is not configured. Add a Claude API key in API Settings.");

  const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: instructions,
      messages: messages.map(message => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content
      }))
    })
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(data.error?.message || "Claude request failed.");
  return claudeText(data);
}

async function callOpenRouter({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("OpenRouter is not configured. Add an OpenRouter API key in API Settings.");

  const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "AInextcode"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: instructions },
        ...messages.map(message => ({
          role: message.role,
          content: message.content
        }))
      ]
    })
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(data.error?.message || "OpenRouter request failed.");
  return chatCompletionText(data);
}

async function callAInextcode({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("AInextcode API is not configured. Add an AInextcode API key in API Settings.");

  const apiResponse = await fetch(`${AINEXTCODE_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "AInextcode Bots and Agents"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: instructions },
        ...messages.map(message => ({
          role: message.role,
          content: message.content
        }))
      ]
    })
  });

  const data = await apiResponse.json().catch(() => ({}));
  if (!apiResponse.ok) throw new Error(data.error?.message || data.message || "AInextcode API request failed.");
  return chatCompletionText(data) || String(data.message || data.output || data.response || "").trim();
}

async function completeChatForUser({ db, user, body, defaultProvider = "openai" }) {
  const plan = planForUser(db, user);
  const messages = safeMessages(body.messages);
  const lastUserMessage = [...messages].reverse().find(message => message.role === "user");

  if (!lastUserMessage) {
    const error = new Error("Send a user message first.");
    error.status = 400;
    throw error;
  }

  const provider = providerIds.includes(body.provider) ? body.provider : defaultProvider;
  if (!plan.providerAccess.includes(provider)) {
    const error = new Error(`${plan.name} does not include ${provider}.`);
    error.status = 403;
    throw error;
  }

  const month = currentUsageMonth();
  user.usage ||= {};
  user.usage[month] ||= 0;

  if (plan.messageLimit > 0 && user.usage[month] >= plan.messageLimit) {
    const error = new Error("This plan has reached its monthly message limit.");
    error.status = 402;
    throw error;
  }

  const enabledPluginIds = Array.isArray(body.plugins) ? body.plugins.map(String) : [];
  const instructions = buildInstructions({
    specialization: body.specialization,
    plugins: db.plugins,
    enabledPluginIds
  });
  const model = providerModel(provider, body.model, user);
  const userApiKeys = user.apiKeys || {};
  const apiKey = provider === "gemini"
    ? userApiKeys.gemini || GEMINI_API_KEY
    : provider === "claude"
      ? userApiKeys.claude || ANTHROPIC_API_KEY
      : provider === "openrouter"
        ? userApiKeys.openrouter || OPENROUTER_API_KEY
        : provider === "ainextcode"
          ? userApiKeys.ainextcode || AINEXTCODE_API_KEY
          : userApiKeys.openai || OPENAI_API_KEY;
  const payload = { apiKey, model, instructions, messages };

  let message;
  if (provider === "gemini") {
    message = await callGemini(payload);
  } else if (provider === "claude") {
    message = await callClaude(payload);
  } else if (provider === "openrouter") {
    message = await callOpenRouter(payload);
  } else if (provider === "ainextcode") {
    message = await callAInextcode(payload);
  } else {
    message = await callOpenAI(payload);
  }

  user.usage[month] += 1;

  return {
    message: message || "I received the request, but no text response was returned.",
    provider,
    model,
    usage: user.usage[month],
    limit: plan.messageLimit
  };
}

async function handleChat(req, res) {
  const context = requireUser(req, res);
  if (!context) return;

  try {
    const body = await jsonBody(req);
    const result = await completeChatForUser({
      db: context.db,
      user: context.user,
      body,
      defaultProvider: "openai"
    });
    writeDb(context.db);
    sendJson(res, 200, {
      message: result.message,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      limit: result.limit
    });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Something went wrong." });
  }
}

async function handleSignup(req, res) {
  try {
    const body = await jsonBody(req);
    const name = String(body.name || "").trim().slice(0, 80);
    const email = cleanEmail(body.email);
    const password = String(body.password || "");

    if (!name || !email || password.length < 8) {
      sendJson(res, 400, { error: "Enter a name, valid email, and password with at least 8 characters." });
      return;
    }

    const db = readDb();
    if (db.users.some(user => user.email === email)) {
      sendJson(res, 409, { error: "An account with this email already exists." });
      return;
    }

    const isFirstUser = db.users.length === 0;
    const user = {
      id: newId("usr"),
      name,
      email,
      passwordHash: hashPassword(password),
      role: isFirstUser ? "admin" : "user",
      planId: "free",
      status: "active",
      themeId: "sage",
      apiKeys: {},
      modelPrefs: {},
      usage: {},
      createdAt: new Date().toISOString()
    };

    const token = newId("sess");
    db.users.push(user);
    db.sessions.push({
      token,
      userId: user.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14
    });
    writeDb(db);

    sendJson(res, 201, { user: publicUser(user) }, {
      "Set-Cookie": cookieHeader("session", token, { maxAge: 60 * 60 * 24 * 14 })
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Signup failed." });
  }
}

async function handleLogin(req, res) {
  try {
    const body = await jsonBody(req);
    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    const db = readDb();
    const user = db.users.find(item => item.email === email);

    if (!user || !verifyPassword(password, user.passwordHash) || user.status === "disabled") {
      sendJson(res, 401, { error: "Invalid email or password." });
      return;
    }

    const token = newId("sess");
    db.sessions.push({
      token,
      userId: user.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14
    });
    writeDb(db);

    sendJson(res, 200, { user: publicUser(user) }, {
      "Set-Cookie": cookieHeader("session", token, { maxAge: 60 * 60 * 24 * 14 })
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Login failed." });
  }
}

function handleLogout(req, res) {
  const db = readDb();
  const token = parseCookies(req).session;
  db.sessions = db.sessions.filter(session => session.token !== token);
  writeDb(db);
  sendJson(res, 200, { ok: true }, {
    "Set-Cookie": cookieHeader("session", "", { maxAge: 0 })
  });
}

function publicConfig(db = readDb(), user = null) {
  return {
    providers: providersStatus(user),
    plans: db.plans.filter(plan => plan.active),
    plugins: db.plugins.filter(plugin => plugin.active),
    themes: db.themes.filter(theme => theme.active),
    freeModels: db.freeModels.filter(model => model.active),
    paypal: {
      configured: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET),
      clientId: PAYPAL_CLIENT_ID || null,
      email: db.settings?.paypalEmail || PAYPAL_RECEIVER_EMAIL || null,
      mode: PAYPAL_MODE
    }
  };
}

async function handleApiSettings(req, res) {
  const context = requireUser(req, res);
  if (!context) return;

  try {
    const body = await jsonBody(req);
    const user = context.user;
    user.apiKeys ||= {};
    user.modelPrefs ||= {};

    const keyFields = {
      openai: "openaiKey",
      gemini: "geminiKey",
      claude: "claudeKey",
      openrouter: "openrouterKey",
      ainextcode: "ainextcodeKey"
    };

    for (const [provider, field] of Object.entries(keyFields)) {
      if (body.clear?.[provider]) {
        delete user.apiKeys[provider];
      }

      const value = String(body[field] || "").trim();
      if (value) {
        user.apiKeys[provider] = value;
      }
    }

    for (const provider of providerIds) {
      const model = String(body.models?.[provider] || "").trim();
      if (model) user.modelPrefs[provider] = model.slice(0, 120);
    }

    writeDb(context.db);
    sendJson(res, 200, {
      user: publicUser(user),
      config: publicConfig(context.db, user)
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Could not save API settings." });
  }
}

async function handleListApiAccessKeys(req, res) {
  const context = requireUser(req, res);
  if (!context) return;

  const items = (context.db.apiAccessKeys || [])
    .filter(item => item.userId === context.user.id)
    .map(publicApiAccessKey);
  sendJson(res, 200, { items });
}

async function handleCreateApiAccessKey(req, res) {
  const context = requireUser(req, res);
  if (!context) return;

  try {
    const body = await jsonBody(req);
    const key = generateApiKey();
    const item = {
      id: newId("key"),
      userId: context.user.id,
      name: String(body.name || "AInextcode API key").trim().slice(0, 80),
      prefix: `${key.slice(0, 8)}...${key.slice(-4)}`,
      keyHash: hashApiKey(key),
      active: true,
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };

    context.db.apiAccessKeys ||= [];
    context.db.apiAccessKeys.push(item);
    writeDb(context.db);
    sendJson(res, 201, { key, item: publicApiAccessKey(item) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Could not create API key." });
  }
}

function handleDeleteApiAccessKey(req, res, keyId) {
  const context = requireUser(req, res);
  if (!context) return;

  const item = (context.db.apiAccessKeys || []).find(key => key.id === keyId && key.userId === context.user.id);
  if (!item) {
    sendJson(res, 404, { error: "API key not found." });
    return;
  }

  item.active = false;
  item.revokedAt = new Date().toISOString();
  writeDb(context.db);
  sendJson(res, 200, { ok: true });
}

async function handleOpenAICompatibleChat(req, res) {
  const context = authenticateApiAccessKey(req);
  if (!context) {
    sendJson(res, 401, { error: { message: "Invalid or missing AInextcode API key." } });
    return;
  }

  try {
    const body = await jsonBody(req);
    const result = await completeChatForUser({
      db: context.db,
      user: context.user,
      body,
      defaultProvider: "ainextcode"
    });
    writeDb(context.db);
    sendJson(res, 200, {
      id: newId("chatcmpl"),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: result.model,
      provider: result.provider,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: result.message
        },
        finish_reason: "stop"
      }],
      usage: {
        total_messages: result.usage,
        message_limit: result.limit
      }
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: {
        message: error.message || "AInextcode API request failed."
      }
    });
  }
}

async function handleAdminSettings(req, res) {
  const context = requireAdmin(req, res);
  if (!context) return;

  const body = await jsonBody(req);
  context.db.settings ||= {};
  context.db.settings.paypalEmail = String(body.paypalEmail || "").trim().slice(0, 160);
  writeDb(context.db);

  sendJson(res, 200, {
    settings: context.db.settings,
    config: publicConfig(context.db, context.user)
  });
}

async function handleAdminFreeModel(req, res) {
  const context = requireAdmin(req, res);
  if (!context) return;

  const body = await jsonBody(req);
  const id = String(body.id || body.name || body.model || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!id || !body.name || !body.model) {
    sendJson(res, 400, { error: "Free model name and model slug are required." });
    return;
  }

  const item = {
    id,
    name: String(body.name).trim().slice(0, 80),
    provider: "openrouter",
    model: String(body.model).trim().slice(0, 160),
    active: body.active !== false
  };

  context.db.freeModels ||= [];
  const index = context.db.freeModels.findIndex(model => model.id === id);
  if (index >= 0) context.db.freeModels[index] = item;
  else context.db.freeModels.push(item);

  writeDb(context.db);
  sendJson(res, 200, { item });
}

async function paypalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  }

  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const apiResponse = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const data = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(data.error_description || "PayPal authentication failed.");
  return data.access_token;
}

async function handleCreatePayPalOrder(req, res) {
  const context = requireUser(req, res);
  if (!context) return;

  try {
    const body = await jsonBody(req);
    const db = context.db;
    const plan = db.plans.find(item => item.id === body.planId && item.active);

    if (!plan) {
      sendJson(res, 404, { error: "Plan not found." });
      return;
    }

    if (plan.price <= 0) {
      context.user.planId = plan.id;
      writeDb(db);
      sendJson(res, 200, { free: true, planId: plan.id });
      return;
    }

    const accessToken = await paypalAccessToken();
    const origin = req.headers.origin || `http://localhost:${PORT}`;
    const apiResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: plan.id,
          description: `${plan.name} plan`,
          amount: {
            currency_code: plan.currency,
            value: Number(plan.price).toFixed(2)
          }
        }],
        application_context: {
          brand_name: "AInextcode",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          return_url: `${origin}/#billing-success`,
          cancel_url: `${origin}/#billing-cancelled`
        }
      })
    });

    const data = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(data.message || "PayPal order creation failed.");

    db.payments.push({
      id: newId("pay"),
      userId: context.user.id,
      planId: plan.id,
      provider: "paypal",
      orderId: data.id,
      status: "created",
      amount: plan.price,
      currency: plan.currency,
      createdAt: new Date().toISOString()
    });
    writeDb(db);

    sendJson(res, 200, {
      orderId: data.id,
      approveUrl: data.links?.find(link => link.rel === "approve")?.href || null
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "PayPal order failed." });
  }
}

async function handleCapturePayPalOrder(req, res) {
  const context = requireUser(req, res);
  if (!context) return;

  try {
    const body = await jsonBody(req);
    const orderId = String(body.orderId || body.token || "");
    const planId = String(body.planId || "");

    if (!orderId) {
      sendJson(res, 400, { error: "Missing PayPal order id." });
      return;
    }

    const db = context.db;
    const payment = db.payments.find(item => item.orderId === orderId && item.userId === context.user.id);
    const plan = db.plans.find(item => item.id === (planId || payment?.planId));

    if (!payment || !plan) {
      sendJson(res, 404, { error: "Payment record not found." });
      return;
    }

    const accessToken = await paypalAccessToken();
    const apiResponse = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    const data = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(data.message || "PayPal capture failed.");

    payment.status = data.status || "COMPLETED";
    payment.capturedAt = new Date().toISOString();
    context.user.planId = plan.id;
    writeDb(db);

    sendJson(res, 200, { ok: true, status: payment.status, planId: plan.id });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "PayPal capture failed." });
  }
}

async function handleAdminUpdateUser(req, res, userId) {
  const context = requireAdmin(req, res);
  if (!context) return;

  const body = await jsonBody(req);
  const target = context.db.users.find(user => user.id === userId);
  if (!target) {
    sendJson(res, 404, { error: "User not found." });
    return;
  }

  if (["admin", "user"].includes(body.role)) target.role = body.role;
  if (["active", "disabled"].includes(body.status)) target.status = body.status;
  if (context.db.plans.some(plan => plan.id === body.planId)) target.planId = body.planId;
  writeDb(context.db);
  sendJson(res, 200, { user: publicUser(target) });
}

async function handleAdminPlan(req, res) {
  const context = requireAdmin(req, res);
  if (!context) return;

  const body = await jsonBody(req);
  const id = String(body.id || body.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id || !body.name) {
    sendJson(res, 400, { error: "Plan id and name are required." });
    return;
  }

  const plan = {
    id,
    name: String(body.name).trim().slice(0, 60),
    price: Number(body.price || 0),
    currency: String(body.currency || "USD").toUpperCase().slice(0, 3),
    interval: String(body.interval || "month").slice(0, 20),
    messageLimit: Number(body.messageLimit || 100),
    providerAccess: Array.isArray(body.providerAccess) ? body.providerAccess.filter(item => providerIds.includes(item)) : ["openai"],
    features: String(body.features || "").split("\n").map(item => item.trim()).filter(Boolean),
    active: body.active !== false
  };

  const index = context.db.plans.findIndex(item => item.id === id);
  if (index >= 0) context.db.plans[index] = plan;
  else context.db.plans.push(plan);

  writeDb(context.db);
  sendJson(res, 200, { plan });
}

async function handleAdminCatalogItem(req, res, type, itemId = null) {
  const context = requireAdmin(req, res);
  if (!context) return;

  const collection = type === "themes" ? context.db.themes : context.db.plugins;
  const body = await jsonBody(req);
  const id = itemId || String(body.id || body.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  if (!id || !body.name) {
    sendJson(res, 400, { error: "Id and name are required." });
    return;
  }

  const item = type === "themes"
    ? { id, name: String(body.name).trim().slice(0, 60), active: body.active !== false }
    : {
        id,
        name: String(body.name).trim().slice(0, 60),
        description: String(body.description || "").slice(0, 180),
        prompt: String(body.prompt || "").slice(0, 1000),
        active: body.active !== false
      };

  const index = collection.findIndex(existing => existing.id === id);
  if (index >= 0) collection[index] = item;
  else collection.push(item);

  writeDb(context.db);
  sendJson(res, 200, { item });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const resolvedPath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  const publicRoot = `${PUBLIC_DIR}${path.sep}`;

  if (resolvedPath !== PUBLIC_DIR && !resolvedPath.startsWith(publicRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackContent) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallbackContent);
      });
      return;
    }

    const contentType = mimeTypes[path.extname(resolvedPath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

function route(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/healthz") {
    sendJson(res, 200, {
      ok: true,
      providers: providersStatus(),
      paypalConfigured: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET)
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/config") {
    sendJson(res, 200, publicConfig());
    return;
  }

  if (req.method === "POST" && pathname === "/v1/chat/completions") return handleOpenAICompatibleChat(req, res);

  if (req.method === "GET" && pathname === "/api/me") {
    const context = getSession(req);
    sendJson(res, 200, {
      user: publicUser(context.user),
      plan: context.user ? planForUser(context.db, context.user) : null,
      config: publicConfig(context.db, context.user)
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/signup") return handleSignup(req, res);
  if (req.method === "POST" && pathname === "/api/auth/login") return handleLogin(req, res);
  if (req.method === "POST" && pathname === "/api/auth/logout") return handleLogout(req, res);
  if (req.method === "POST" && pathname === "/api/settings/api") return handleApiSettings(req, res);
  if (req.method === "GET" && pathname === "/api/access-keys") return handleListApiAccessKeys(req, res);
  if (req.method === "POST" && pathname === "/api/access-keys") return handleCreateApiAccessKey(req, res);
  if (req.method === "POST" && pathname === "/api/chat") return handleChat(req, res);
  if (req.method === "POST" && pathname === "/api/paypal/create-order") return handleCreatePayPalOrder(req, res);
  if (req.method === "POST" && pathname === "/api/paypal/capture-order") return handleCapturePayPalOrder(req, res);

  if (req.method === "GET" && pathname === "/api/admin/overview") {
    const context = requireAdmin(req, res);
    if (!context) return;
    sendJson(res, 200, {
      users: context.db.users.map(publicUser),
      plans: context.db.plans,
      plugins: context.db.plugins,
      themes: context.db.themes,
      freeModels: context.db.freeModels,
      settings: context.db.settings,
      payments: context.db.payments,
      providers: providersStatus(),
      paypalConfigured: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET)
    });
    return;
  }

  const userMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  const accessKeyMatch = pathname.match(/^\/api\/access-keys\/([^/]+)$/);
  if (req.method === "DELETE" && accessKeyMatch) return handleDeleteApiAccessKey(req, res, accessKeyMatch[1]);
  if (req.method === "PUT" && userMatch) return handleAdminUpdateUser(req, res, userMatch[1]);
  if (req.method === "POST" && pathname === "/api/admin/plans") return handleAdminPlan(req, res);
  if (req.method === "POST" && pathname === "/api/admin/plugins") return handleAdminCatalogItem(req, res, "plugins");
  if (req.method === "POST" && pathname === "/api/admin/themes") return handleAdminCatalogItem(req, res, "themes");
  if (req.method === "POST" && pathname === "/api/admin/settings") return handleAdminSettings(req, res);
  if (req.method === "POST" && pathname === "/api/admin/free-models") return handleAdminFreeModel(req, res);

  const pluginMatch = pathname.match(/^\/api\/admin\/plugins\/([^/]+)$/);
  if (req.method === "PUT" && pluginMatch) return handleAdminCatalogItem(req, res, "plugins", pluginMatch[1]);

  const themeMatch = pathname.match(/^\/api\/admin\/themes\/([^/]+)$/);
  if (req.method === "PUT" && themeMatch) return handleAdminCatalogItem(req, res, "themes", themeMatch[1]);

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
}

ensureDb();

const server = http.createServer((req, res) => {
  Promise.resolve(route(req, res)).catch(error => {
    sendJson(res, 500, { error: error.message || "Server error." });
  });
});

server.listen(PORT, () => {
  console.log(`AInextcode running at http://localhost:${PORT}`);
});
