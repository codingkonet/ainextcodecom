const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const defaults = {
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.1",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
  openrouterModel: process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1-0528:free"
};

const serverKeys = {
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  claude: process.env.ANTHROPIC_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY
};

const paypal = {
  mode: process.env.PAYPAL_MODE || "sandbox",
  clientId: process.env.PAYPAL_CLIENT_ID,
  secret: process.env.PAYPAL_CLIENT_SECRET,
  receiverEmail: process.env.PAYPAL_RECEIVER_EMAIL || ""
};
paypal.baseUrl = paypal.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const systemPrompt = `You are AInextcode, a helpful AI assistant for a multi-model SaaS platform. Be clear, accurate, concise, practical, and honest about uncertainty.`;
const providerIds = ["openai", "gemini", "claude", "openrouter"];

const seed = {
  users: [],
  sessions: [],
  payments: [],
  settings: { paypalEmail: paypal.receiverEmail },
  freeModels: [
    { id: "deepseek-r1-free", name: "DeepSeek R1 Free", provider: "openrouter", model: "deepseek/deepseek-r1-0528:free", active: true },
    { id: "llama-33-free", name: "Llama 3.3 70B Free", provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", active: true },
    { id: "mistral-small-free", name: "Mistral Small Free", provider: "openrouter", model: "mistralai/mistral-small-3.2-24b-instruct:free", active: true }
  ],
  plans: [
    { id: "free", name: "Free", price: 0, currency: "USD", interval: "month", messageLimit: 25, providerAccess: ["openai", "openrouter"], features: ["OpenAI chat", "Free model presets", "Basic themes", "Community plugins"], active: true },
    { id: "pro", name: "Pro", price: 19, currency: "USD", interval: "month", messageLimit: 500, providerAccess: ["openai", "gemini", "claude", "openrouter"], features: ["All providers", "More messages", "Premium themes"], active: true },
    { id: "business", name: "Business", price: 49, currency: "USD", interval: "month", messageLimit: 2500, providerAccess: ["openai", "gemini", "claude", "openrouter"], features: ["Team-ready limits", "Admin controls", "Priority setup"], active: true }
  ],
  plugins: [
    { id: "writing", name: "Writing Studio", description: "Drafting and editing help.", prompt: "Improve clarity, structure, tone, and usefulness.", active: true },
    { id: "coding", name: "Code Helper", description: "Coding and debugging help.", prompt: "Give careful, testable engineering guidance.", active: true },
    { id: "business", name: "Business Coach", description: "Planning and marketing help.", prompt: "Focus on practical execution and next steps.", active: true }
  ],
  themes: [
    { id: "sage", name: "Sage", active: true },
    { id: "midnight", name: "Midnight", active: true },
    { id: "paper", name: "Paper", active: true },
    { id: "signal", name: "Signal", active: true }
  ]
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, `${JSON.stringify(seed, null, 2)}\n`);
}
function db() {
  ensureDb();
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  data.settings ||= { paypalEmail: paypal.receiverEmail };
  if (typeof data.settings.paypalEmail !== "string") data.settings.paypalEmail = paypal.receiverEmail;
  data.freeModels ||= seed.freeModels;
  data.themes ||= seed.themes;
  for (const theme of seed.themes) {
    if (!data.themes.some(item => item.id === theme.id)) data.themes.push(theme);
  }
  for (const plan of data.plans || []) {
    if (["free", "pro", "business"].includes(plan.id) && !plan.providerAccess.includes("openrouter")) plan.providerAccess.push("openrouter");
  }
  return data;
}
function save(data) { fs.writeFileSync(DB_FILE, `${JSON.stringify(data, null, 2)}\n`); }
function id(prefix) { return `${prefix}_${crypto.randomBytes(12).toString("hex")}`; }
function slug(input) { return String(input || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function hash(password, salt = crypto.randomBytes(16).toString("hex")) { return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`; }
function verify(password, stored) { const [salt, digest] = String(stored || "").split(":"); if (!salt || !digest) return false; return crypto.timingSafeEqual(Buffer.from(digest, "hex"), crypto.scryptSync(password, salt, 64)); }
function json(res, status, data, headers = {}) { const out = JSON.stringify(data); res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(out), ...headers }); res.end(out); }
function body(req) { return new Promise((resolve, reject) => { let raw = ""; req.on("data", c => { raw += c; if (raw.length > 1_000_000) req.destroy(); }); req.on("end", () => resolve(raw ? JSON.parse(raw) : {})); req.on("error", reject); }); }
function cookies(req) { return Object.fromEntries(String(req.headers.cookie || "").split(";").map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf("="); return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))]; })); }
function cookie(name, value, maxAge) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`; }
function safeUser(user) { if (!user) return null; const { passwordHash, apiKeys, ...rest } = user; return { ...rest, modelPrefs: user.modelPrefs || {}, apiKeyStatus: { openai: !!apiKeys?.openai, gemini: !!apiKeys?.gemini, claude: !!apiKeys?.claude, openrouter: !!apiKeys?.openrouter } }; }
function session(req, data = db()) { const token = cookies(req).session; const s = data.sessions.find(x => x.token === token && x.expiresAt > Date.now()); const user = s && data.users.find(x => x.id === s.userId && x.status !== "disabled"); return { data, user, session: s }; }
function needUser(req, res) { const ctx = session(req); if (!ctx.user) { json(res, 401, { error: "Please log in first." }); return null; } return ctx; }
function needAdmin(req, res) { const ctx = needUser(req, res); if (!ctx) return null; if (ctx.user.role !== "admin") { json(res, 403, { error: "Admin access required." }); return null; } return ctx; }
function planOf(data, user) { return data.plans.find(x => x.id === user.planId) || data.plans[0]; }
function providerList(user) { const keys = user?.apiKeys || {}; const prefs = user?.modelPrefs || {}; return [
  { id: "openai", name: "OpenAI", defaultModel: prefs.openai || defaults.openaiModel, configured: !!(keys.openai || serverKeys.openai), source: keys.openai ? "user" : serverKeys.openai ? "server" : "missing" },
  { id: "gemini", name: "Gemini", defaultModel: prefs.gemini || defaults.geminiModel, configured: !!(keys.gemini || serverKeys.gemini), source: keys.gemini ? "user" : serverKeys.gemini ? "server" : "missing" },
  { id: "claude", name: "Claude", defaultModel: prefs.claude || defaults.claudeModel, configured: !!(keys.claude || serverKeys.claude), source: keys.claude ? "user" : serverKeys.claude ? "server" : "missing" },
  { id: "openrouter", name: "OpenRouter Free", defaultModel: prefs.openrouter || defaults.openrouterModel, configured: !!(keys.openrouter || serverKeys.openrouter), source: keys.openrouter ? "user" : serverKeys.openrouter ? "server" : "missing" }
]; }
function config(data = db(), user = null) { return { providers: providerList(user), plans: data.plans.filter(x => x.active), plugins: data.plugins.filter(x => x.active), themes: data.themes.filter(x => x.active), freeModels: (data.freeModels || []).filter(x => x.active), paypal: { configured: !!(paypal.clientId && paypal.secret), clientId: paypal.clientId || null, mode: paypal.mode, email: data.settings?.paypalEmail || paypal.receiverEmail || "" } }; }
function instructions(data, specialization, pluginIds = []) { const plugs = data.plugins.filter(p => p.active && pluginIds.includes(p.id)).map(p => `${p.name}: ${p.prompt || p.description}`).join("\n"); return `${systemPrompt}\nSpecialization: ${specialization || "general help"}\n${plugs}`; }
function cleanMessages(messages) { return Array.isArray(messages) ? messages.filter(m => m && ["user", "assistant"].includes(m.role)).map(m => ({ role: m.role, content: String(m.content || "").slice(0, 8000) })).filter(m => m.content).slice(-20) : []; }

async function callOpenAI(key, model, prompt, messages) {
  if (!key) throw new Error("OpenAI is not configured. Add a key in API Settings.");
  const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }, ...messages] }) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error?.message || "OpenAI request failed."); return data.choices?.[0]?.message?.content || "";
}
async function callOpenRouter(key, model, prompt, messages) {
  if (!key) throw new Error("OpenRouter is not configured. Add a key in API Settings.");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "AInextcode" }, body: JSON.stringify({ model, messages: [{ role: "system", content: prompt }, ...messages] }) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error?.message || "OpenRouter request failed."); return data.choices?.[0]?.message?.content || "";
}
async function callGemini(key, model, prompt, messages) {
  if (!key) throw new Error("Gemini is not configured. Add a key in API Settings.");
  const contents = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: prompt }] }, contents }) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error?.message || "Gemini request failed."); return (data.candidates || []).flatMap(c => c.content?.parts || []).map(p => p.text || "").join("");
}
async function callClaude(key, model, prompt, messages) {
  if (!key) throw new Error("Claude is not configured. Add a key in API Settings.");
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model, max_tokens: 1200, system: prompt, messages }) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error?.message || "Claude request failed."); return (data.content || []).map(p => p.text || "").join("");
}

async function signup(req, res) { const input = await body(req); const data = db(); const email = String(input.email || "").trim().toLowerCase(); if (!input.name || !email || String(input.password || "").length < 8) return json(res, 400, { error: "Name, email, and 8 character password required." }); if (data.users.some(u => u.email === email)) return json(res, 409, { error: "Email already exists." }); const user = { id: id("usr"), name: String(input.name).slice(0, 80), email, passwordHash: hash(input.password), role: data.users.length ? "user" : "admin", planId: "free", status: "active", themeId: "sage", apiKeys: {}, modelPrefs: {}, usage: {}, createdAt: new Date().toISOString() }; const token = id("sess"); data.users.push(user); data.sessions.push({ token, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + 12096e5 }); save(data); json(res, 201, { user: safeUser(user) }, { "Set-Cookie": cookie("session", token, 60 * 60 * 24 * 14) }); }
async function login(req, res) { const input = await body(req); const data = db(); const user = data.users.find(u => u.email === String(input.email || "").trim().toLowerCase()); if (!user || !verify(input.password, user.passwordHash)) return json(res, 401, { error: "Invalid email or password." }); const token = id("sess"); data.sessions.push({ token, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + 12096e5 }); save(data); json(res, 200, { user: safeUser(user) }, { "Set-Cookie": cookie("session", token, 60 * 60 * 24 * 14) }); }
function logout(req, res) { const data = db(); const token = cookies(req).session; data.sessions = data.sessions.filter(s => s.token !== token); save(data); json(res, 200, { ok: true }, { "Set-Cookie": cookie("session", "", 0) }); }
async function apiSettings(req, res) { const ctx = needUser(req, res); if (!ctx) return; const input = await body(req); ctx.user.apiKeys ||= {}; ctx.user.modelPrefs ||= {}; for (const p of providerIds) { if (input.clear?.[p]) delete ctx.user.apiKeys[p]; const key = String(input[`${p}Key`] || "").trim(); if (key) ctx.user.apiKeys[p] = key; const model = String(input.models?.[p] || "").trim(); if (model) ctx.user.modelPrefs[p] = model; } save(ctx.data); json(res, 200, { user: safeUser(ctx.user), config: config(ctx.data, ctx.user) }); }
async function chat(req, res) { const ctx = needUser(req, res); if (!ctx) return; const input = await body(req); const data = ctx.data; const user = ctx.user; const plan = planOf(data, user); const provider = providerIds.includes(input.provider) ? input.provider : "openai"; if (!plan.providerAccess.includes(provider)) return json(res, 403, { error: `${plan.name} does not include ${provider}.` }); const month = new Date().toISOString().slice(0, 7); user.usage ||= {}; user.usage[month] ||= 0; if (user.usage[month] >= plan.messageLimit) return json(res, 402, { error: "Monthly message limit reached." }); const messages = cleanMessages(input.messages); const found = providerList(user).find(p => p.id === provider); const model = input.model || user.modelPrefs?.[provider] || found.defaultModel; const key = user.apiKeys?.[provider] || serverKeys[provider]; const prompt = instructions(data, input.specialization, input.plugins || []); const answer = provider === "gemini" ? await callGemini(key, model, prompt, messages) : provider === "claude" ? await callClaude(key, model, prompt, messages) : provider === "openrouter" ? await callOpenRouter(key, model, prompt, messages) : await callOpenAI(key, model, prompt, messages); user.usage[month] += 1; save(data); json(res, 200, { message: answer, provider, model, usage: user.usage[month], limit: plan.messageLimit }); }
async function paypalOrder(req, res) { const ctx = needUser(req, res); if (!ctx) return; const input = await body(req); const plan = ctx.data.plans.find(p => p.id === input.planId); if (!plan) return json(res, 404, { error: "Plan not found." }); if (plan.price <= 0) { ctx.user.planId = plan.id; save(ctx.data); return json(res, 200, { free: true, planId: plan.id }); } if (!paypal.clientId || !paypal.secret) return json(res, 500, { error: "PayPal is not configured." }); json(res, 501, { error: "PayPal Orders are wired, but production checkout still needs approval return pages and webhooks." }); }
async function adminOverview(req, res) { const ctx = needAdmin(req, res); if (!ctx) return; json(res, 200, { users: ctx.data.users.map(safeUser), plans: ctx.data.plans, plugins: ctx.data.plugins, themes: ctx.data.themes, payments: ctx.data.payments, freeModels: ctx.data.freeModels || [], settings: ctx.data.settings || {}, providers: providerList(), paypalConfigured: !!(paypal.clientId && paypal.secret) }); }
async function adminUser(req, res, userId) { const ctx = needAdmin(req, res); if (!ctx) return; const input = await body(req); const user = ctx.data.users.find(u => u.id === userId); if (!user) return json(res, 404, { error: "User not found." }); if (["admin", "user"].includes(input.role)) user.role = input.role; if (["active", "disabled"].includes(input.status)) user.status = input.status; if (ctx.data.plans.some(p => p.id === input.planId)) user.planId = input.planId; save(ctx.data); json(res, 200, { user: safeUser(user) }); }
async function adminSettings(req, res) { const ctx = needAdmin(req, res); if (!ctx) return; const input = await body(req); ctx.data.settings ||= {}; ctx.data.settings.paypalEmail = String(input.paypalEmail || "").trim(); save(ctx.data); json(res, 200, { settings: ctx.data.settings }); }
async function adminFreeModel(req, res) { const ctx = needAdmin(req, res); if (!ctx) return; const input = await body(req); const name = String(input.name || "").trim(); const model = String(input.model || "").trim(); if (!name || !model) return json(res, 400, { error: "Name and model are required." }); const item = { id: slug(input.id || name), name, provider: "openrouter", model, active: input.active !== false }; ctx.data.freeModels ||= []; const i = ctx.data.freeModels.findIndex(x => x.id === item.id); if (i >= 0) ctx.data.freeModels[i] = item; else ctx.data.freeModels.push(item); save(ctx.data); json(res, 200, { item }); }
async function adminAdd(req, res, type) { const ctx = needAdmin(req, res); if (!ctx) return; const input = await body(req); const collection = ctx.data[type]; const idValue = slug(input.id || input.name); if (!idValue || !input.name) return json(res, 400, { error: "Id and name required." }); const access = Array.isArray(input.providerAccess) ? input.providerAccess.filter(p => providerIds.includes(p)) : ["openai", "openrouter"]; const item = type === "plans" ? { id: idValue, name: input.name, price: Number(input.price || 0), currency: "USD", interval: "month", messageLimit: Number(input.messageLimit || 100), providerAccess: access.length ? access : ["openai"], features: String(input.features || "").split("\n").filter(Boolean), active: true } : type === "themes" ? { id: idValue, name: input.name, active: true } : { id: idValue, name: input.name, description: input.description || "", prompt: input.prompt || "", active: true }; const i = collection.findIndex(x => x.id === idValue); if (i >= 0) collection[i] = item; else collection.push(item); save(ctx.data); json(res, 200, { item }); }

function staticFile(req, res) { const url = new URL(req.url, `http://localhost:${PORT}`); const p = url.pathname === "/" ? "/index.html" : url.pathname; const file = path.resolve(PUBLIC_DIR, `.${p}`); if (!file.startsWith(PUBLIC_DIR)) return res.writeHead(403).end("Forbidden"); fs.readFile(file, (err, content) => { if (err) return fs.readFile(path.join(PUBLIC_DIR, "index.html"), (e, html) => { if (e) return res.writeHead(404).end("Not found"); res.writeHead(200, { "Content-Type": "text/html" }); res.end(html); }); const ext = path.extname(file); res.writeHead(200, { "Content-Type": ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html" }); res.end(content); }); }

async function route(req, res) { const url = new URL(req.url, `http://localhost:${PORT}`); const p = url.pathname; if (req.method === "GET" && p === "/healthz") return json(res, 200, { ok: true, providers: providerList(), paypalConfigured: !!(paypal.clientId && paypal.secret) }); if (req.method === "GET" && p === "/api/config") return json(res, 200, config()); if (req.method === "GET" && p === "/api/me") { const ctx = session(req); return json(res, 200, { user: safeUser(ctx.user), plan: ctx.user ? planOf(ctx.data, ctx.user) : null, config: config(ctx.data, ctx.user) }); } if (req.method === "POST" && p === "/api/auth/signup") return signup(req, res); if (req.method === "POST" && p === "/api/auth/login") return login(req, res); if (req.method === "POST" && p === "/api/auth/logout") return logout(req, res); if (req.method === "POST" && p === "/api/settings/api") return apiSettings(req, res); if (req.method === "POST" && p === "/api/chat") return chat(req, res); if (req.method === "POST" && p === "/api/paypal/create-order") return paypalOrder(req, res); if (req.method === "GET" && p === "/api/admin/overview") return adminOverview(req, res); const userMatch = p.match(/^\/api\/admin\/users\/([^/]+)$/); if (req.method === "PUT" && userMatch) return adminUser(req, res, userMatch[1]); if (req.method === "POST" && p === "/api/admin/settings") return adminSettings(req, res); if (req.method === "POST" && p === "/api/admin/free-models") return adminFreeModel(req, res); if (req.method === "POST" && p === "/api/admin/plans") return adminAdd(req, res, "plans"); if (req.method === "POST" && p === "/api/admin/plugins") return adminAdd(req, res, "plugins"); if (req.method === "POST" && p === "/api/admin/themes") return adminAdd(req, res, "themes"); if (req.method === "GET") return staticFile(req, res); res.writeHead(405).end("Method not allowed"); }

ensureDb();
http.createServer((req, res) => Promise.resolve(route(req, res)).catch(err => json(res, 500, { error: err.message || "Server error." }))).listen(PORT, () => console.log(`AInextcode running on http://localhost:${PORT}`));
