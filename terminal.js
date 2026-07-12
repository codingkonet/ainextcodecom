const fs = require("fs");
const readline = require("readline/promises");

const DEFAULT_SERVER_URL = "https://ainextcodecom.onrender.com";

function loadDotEnv() {
  if (!fs.existsSync(".env")) return;
  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const DEFAULTS = {
  openai: process.env.OPENAI_MODEL || "gpt-5.1",
  gemini: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  claude: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
  openrouter: process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1-0528:free",
  ainextcode: process.env.AINEXTCODE_MODEL || "ainextcode-agent"
};

const KEYS = {
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  claude: process.env.ANTHROPIC_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
  ainextcode: process.env.AINEXTCODE_API_KEY
};

const PROVIDERS = {
  openai: "OpenAI",
  gemini: "Gemini",
  claude: "Claude",
  openrouter: "OpenRouter Free",
  ainextcode: "AInextcode API"
};
const AINEXTCODE_API_BASE_URL = (process.env.AINEXTCODE_API_BASE_URL || "https://ai.ainextcode.com/v1").replace(/\/+$/, "");

const BASE_INSTRUCTIONS = `You are AInextcode, an AI assistant powered by a multi-model platform.

Role:
Act as a knowledgeable, friendly, and professional assistant.

Behavior:
- Give clear, accurate, and practical answers.
- Ask clarifying questions when the request is unclear.
- Keep answers concise unless the user asks for more detail.
- Do not invent facts. If you are unsure, say so.
- Adapt your tone to the user's needs.`;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function normalizeServerUrl(value) {
  const raw = String(value || DEFAULT_SERVER_URL).trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

function firstConfiguredProvider() {
  return Object.keys(PROVIDERS).find(provider => Boolean(KEYS[provider])) || "openai";
}

function maskKey(value) {
  if (!value) return "missing";
  if (value.length <= 8) return "saved";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function systemPrompt(specialization) {
  return `${BASE_INSTRUCTIONS}

Specialization:
You specialize in ${specialization || "general help"}.`;
}

function chatCompletionText(data) {
  const content = data.choices?.[0]?.message?.content;
  if (Array.isArray(content)) return content.map(part => part.text || "").join("").trim();
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
  return (data.content || []).map(part => part.text || "").join("").trim();
}

function readSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const header = headers.get("set-cookie");
  return header ? [header] : [];
}

function mergeCookie(cookieHeader, setCookieHeaders) {
  const jar = new Map();
  for (const pair of String(cookieHeader || "").split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index > 0) jar.set(trimmed.slice(0, index), trimmed.slice(index + 1));
  }
  for (const setCookie of setCookieHeaders) {
    const first = String(setCookie).split(";")[0];
    const index = first.indexOf("=");
    if (index > 0) jar.set(first.slice(0, index), first.slice(index + 1));
  }
  return Array.from(jar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
}

async function remoteFetch(state, path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.cookie) headers.Cookie = state.cookie;
  const response = await fetch(`${state.serverUrl}${path}`, { ...options, headers });
  state.cookie = mergeCookie(state.cookie, readSetCookies(response.headers));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Remote request failed: ${response.status}`);
  return data;
}

async function refreshRemote(state) {
  const data = await remoteFetch(state, "/api/me");
  state.remoteUser = data.user;
  state.remotePlan = data.plan;
  state.remoteConfig = data.config || {};

  if (!PROVIDERS[state.provider]) {
    const first = state.remoteConfig.providers?.[0]?.id || "openai";
    state.provider = first;
  }

  const found = state.remoteConfig.providers?.find(provider => provider.id === state.provider);
  if (found && (!state.model || state.model === DEFAULTS[state.provider])) {
    state.model = found.defaultModel;
  }

  return data;
}

async function loginRemote(rl, state, args) {
  let email = args.email || process.env.AINEXTCODE_EMAIL;
  let password = args.password || process.env.AINEXTCODE_PASSWORD;
  let name = args.name || process.env.AINEXTCODE_NAME;
  const signup = Boolean(args.signup);

  if (!email) email = (await rl.question("Email: ")).trim();
  if (!password) password = await rl.question("Password (visible): ");
  if (signup && !name) name = (await rl.question("Name: ")).trim();

  const endpoint = signup ? "/api/auth/signup" : "/api/auth/login";
  const payload = signup ? { name, email, password } : { email, password };
  const data = await remoteFetch(state, endpoint, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.remoteUser = data.user;
  await refreshRemote(state);
  console.log(`Connected to ${state.serverUrl} as ${state.remoteUser?.email || email}.`);
}

async function ensureRemoteLogin(rl, state, args) {
  try {
    await refreshRemote(state);
  } catch (error) {
    console.log(`Could not reach ${state.serverUrl}: ${error.message}`);
  }

  if (state.remoteUser) return;

  console.log(`Connect to AInextcode at ${state.serverUrl}`);
  console.log("Use your website account. Add --signup to create the first account from the terminal.");
  await loginRemote(rl, state, args);
}

async function callOpenAI({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("OpenAI key missing. Set OPENAI_API_KEY.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: instructions }, ...messages] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed.");
  return chatCompletionText(data);
}

async function callOpenRouter({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("OpenRouter key missing. Set OPENROUTER_API_KEY.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "AInextcode Terminal" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: instructions }, ...messages] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OpenRouter request failed.");
  return chatCompletionText(data);
}

async function callAInextcode({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("AInextcode API key missing. Set AINEXTCODE_API_KEY.");
  const response = await fetch(`${AINEXTCODE_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "AInextcode Terminal" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: instructions }, ...messages] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || "AInextcode API request failed.");
  return chatCompletionText(data) || String(data.message || data.output || data.response || "").trim();
}

async function callGemini({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("Gemini key missing. Set GEMINI_API_KEY.");
  const contents = messages.map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: instructions }] }, contents })
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini request failed.");
  return geminiText(data);
}

async function callClaude({ apiKey, model, instructions, messages }) {
  if (!apiKey) throw new Error("Claude key missing. Set ANTHROPIC_API_KEY.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1200, system: instructions, messages })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Claude request failed.");
  return claudeText(data);
}

async function askLocalProvider(state) {
  const payload = {
    apiKey: KEYS[state.provider],
    model: state.model,
    instructions: systemPrompt(state.specialization),
    messages: state.messages
  };

  if (state.provider === "gemini") return callGemini(payload);
  if (state.provider === "claude") return callClaude(payload);
  if (state.provider === "openrouter") return callOpenRouter(payload);
  if (state.provider === "ainextcode") return callAInextcode(payload);
  return callOpenAI(payload);
}

async function askRemoteProvider(state) {
  const data = await remoteFetch(state, "/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: state.messages,
      provider: state.provider,
      model: state.model,
      specialization: state.specialization,
      plugins: []
    })
  });
  if (data.usage && data.limit) state.usageLabel = `${data.usage}/${data.limit}`;
  return data.message || "";
}

async function askProvider(state) {
  if (state.mode === "remote") return askRemoteProvider(state);
  return askLocalProvider(state);
}

function printHelp() {
  console.log(`
Commands:
  /help                         Show commands
  /status                       Show provider, model, server, and key/account status
  /provider <name>              Use openai, gemini, claude, openrouter, or ainextcode
  /model <model-name>           Change the current model
  /specialization <text>        Change the assistant specialization
  /login                        Log in again to the remote AInextcode server
  /clear                        Clear this terminal conversation
  /exit                         Quit
`);
}

function printStatus(state) {
  console.log(`Mode: ${state.mode === "remote" ? "remote server" : "local API keys"}`);
  if (state.mode === "remote") {
    console.log(`Server: ${state.serverUrl}`);
    console.log(`Account: ${state.remoteUser?.email || "not logged in"}`);
    console.log(`Plan: ${state.remotePlan?.name || "unknown"}${state.usageLabel ? ` (${state.usageLabel} used)` : ""}`);
  }
  console.log(`Provider: ${PROVIDERS[state.provider]} (${state.provider})`);
  console.log(`Model: ${state.model}`);
  console.log(`Specialization: ${state.specialization}`);
  if (state.mode === "local") {
    console.log("Keys:");
    for (const [provider, name] of Object.entries(PROVIDERS)) {
      console.log(`  ${name}: ${maskKey(KEYS[provider])}`);
    }
  }
}

function setProvider(state, provider) {
  if (!PROVIDERS[provider]) {
    console.log("Unknown provider. Use openai, gemini, claude, openrouter, or ainextcode.");
    return;
  }
  state.provider = provider;
  const remoteModel = state.remoteConfig?.providers?.find(item => item.id === provider)?.defaultModel;
  state.model = remoteModel || DEFAULTS[provider];
  console.log(`Provider changed to ${PROVIDERS[provider]}. Model: ${state.model}`);
}

async function handleCommand({ command, value, rl, state, args }) {
  if (command === "help") printHelp();
  else if (command === "status") printStatus(state);
  else if (command === "provider") setProvider(state, value.toLowerCase());
  else if (command === "model") {
    if (!value) console.log("Enter a model name after /model.");
    else {
      state.model = value;
      console.log(`Model changed to ${state.model}`);
    }
  } else if (command === "specialization") {
    state.specialization = value || "general help";
    console.log(`Specialization changed to ${state.specialization}`);
  } else if (command === "login") {
    if (state.mode !== "remote") console.log("Login is only used in remote mode.");
    else await loginRemote(rl, state, { ...args, email: null, password: null, signup: false });
  } else if (command === "clear") {
    state.messages = [];
    console.log("Conversation cleared.");
  } else {
    console.log("Unknown command. Type /help.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.local ? "local" : "remote";
  const provider = PROVIDERS[args.provider] ? args.provider : firstConfiguredProvider();
  const state = {
    mode,
    serverUrl: normalizeServerUrl(args.server || process.env.AINEXTCODE_SERVER_URL),
    cookie: "",
    remoteUser: null,
    remotePlan: null,
    remoteConfig: null,
    provider,
    model: args.model || DEFAULTS[provider],
    specialization: args.specialization || process.env.AINEXTCODE_SPECIALIZATION || "general help",
    messages: [],
    usageLabel: ""
  };

  console.log("AInextcode Terminal");
  console.log("Type /help for commands. Type /exit to quit.");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\nYou> "
  });

  if (state.mode === "remote") await ensureRemoteLogin(rl, state, args);
  printStatus(state);
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      continue;
    }

    if (input.startsWith("/")) {
      const [command, ...rest] = input.slice(1).split(" ");
      const value = rest.join(" ").trim();
      if (command === "exit" || command === "quit") break;
      await handleCommand({ command, value, rl, state, args });
      rl.prompt();
      continue;
    }

    state.messages.push({ role: "user", content: input });
    state.messages = state.messages.slice(-20);

    try {
      process.stdout.write("\nAInextcode> ");
      const answer = await askProvider(state);
      console.log(answer || "No text response was returned.");
      state.messages.push({ role: "assistant", content: answer || "" });
      state.messages = state.messages.slice(-20);
    } catch (error) {
      console.log(`Error: ${error.message}`);
    }

    rl.prompt();
  }

  rl.close();
  console.log("\nGoodbye.");
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
