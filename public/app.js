const state = {
  user: null,
  plan: null,
  config: { providers: [], plugins: [], themes: [] },
  messages: [],
  admin: null,
  authMode: "login",
  selectedTheme: localStorage.getItem("theme") || "sage"
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

const views = {
  home: $("#homeView"),
  app: $("#appView"),
  admin: $("#adminView")
};

const messagesEl = $("#messages");
const form = $("#chat-form");
const input = $("#message");
const sendButton = $("#send");
const providerSelect = $("#provider");
const modelInput = $("#model");
const pluginList = $("#pluginList");
const themeList = $("#themeList");
const planBadge = $("#planBadge");
const authDialog = $("#authDialog");
const authForm = $("#authForm");
const authMessage = $("#authMessage");
const apiSettingsForm = $("#apiSettingsForm");
const toast = $("#toast");
const providerIds = ["openai", "gemini", "claude", "openrouter", "ainextcode"];

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function applyTheme(themeId) {
  state.selectedTheme = themeId;
  localStorage.setItem("theme", themeId);
  document.body.className = document.body.className
    .split(" ")
    .filter(name => name && !name.startsWith("theme-"))
    .join(" ");
  document.body.classList.add(`theme-${themeId}`);
}

function route() {
  const current = (location.hash || "#home").replace("#", "");
  for (const view of Object.values(views).filter(Boolean)) view.hidden = true;

  if (current === "admin") {
    if (!state.user) openAuth("login");
    views.admin.hidden = false;
    loadAdmin();
    return;
  }

  if (current === "app") {
    if (!state.user) openAuth("login");
    views.app.hidden = false;
    return;
  }

  views.home.hidden = false;
}

function renderAuthState() {
  const loggedIn = Boolean(state.user);
  $("#loginOpen").hidden = loggedIn;
  $("#signupOpen").hidden = loggedIn;
  $("#logout").hidden = !loggedIn;
  $$("[data-auth-link]").forEach(link => {
    link.textContent = loggedIn ? "Workspace" : "Log in";
  });
  $$("[data-admin-link]").forEach(link => {
    link.hidden = !state.user || state.user.role !== "admin";
  });
}

function renderProviderStatus() {
  for (const provider of state.config.providers) {
    const item = document.querySelector(`[data-provider-status="${provider.id}"]`);
    if (!item) continue;
    if (provider.source === "user") item.textContent = "Your key";
    else if (provider.source === "server") item.textContent = "Server key";
    else item.textContent = "Needs key";
  }
}

function renderFreeModelPresets() {
  const list = $("#freeModelPresets");
  if (!list) return;

  list.innerHTML = (state.config.freeModels || [])
    .map(model => `<option value="${model.model}">${model.name}</option>`)
    .join("");
}

function renderProviders() {
  const previousProvider = providerSelect.value;
  providerSelect.innerHTML = "";
  const allowed = state.plan?.providerAccess || providerIds;

  for (const provider of state.config.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    const sourceLabel = provider.source === "user" ? "your key" : provider.source === "server" ? "server key" : "not configured";
    option.textContent = `${provider.name} (${sourceLabel})`;
    option.disabled = !allowed.includes(provider.id);
    option.dataset.model = provider.defaultModel;
    providerSelect.append(option);
  }

  const selected = state.config.providers.find(provider => provider.id === previousProvider && allowed.includes(provider.id))
    || state.config.providers.find(provider => allowed.includes(provider.id))
    || state.config.providers[0];
  if (selected) {
    providerSelect.value = selected.id;
    modelInput.value = selected.defaultModel;
  }
}

function renderApiSettings() {
  if (!state.user || !apiSettingsForm) return;

  const status = state.user.apiKeyStatus || {};
  $("#apiKeyStatus").textContent = [
    `OpenAI: ${status.openai ? "saved" : "not saved"}`,
    `Gemini: ${status.gemini ? "saved" : "not saved"}`,
    `Claude: ${status.claude ? "saved" : "not saved"}`,
    `OpenRouter: ${status.openrouter ? "saved" : "not saved"}`,
    `AInextcode: ${status.ainextcode ? "saved" : "not saved"}`
  ].join(" | ");

  const prefs = state.user.modelPrefs || {};
  apiSettingsForm.elements.openaiModel.value = prefs.openai || "";
  apiSettingsForm.elements.geminiModel.value = prefs.gemini || "";
  apiSettingsForm.elements.claudeModel.value = prefs.claude || "";
  apiSettingsForm.elements.openrouterModel.value = prefs.openrouter || "";
  apiSettingsForm.elements.ainextcodeModel.value = prefs.ainextcode || "";
}

function renderPlugins() {
  pluginList.innerHTML = "";
  for (const plugin of state.config.plugins) {
    const id = `plugin-${plugin.id}`;
    const label = document.createElement("label");
    label.className = "check-item";
    label.innerHTML = `<input id="${id}" type="checkbox" value="${plugin.id}"> ${plugin.name}`;
    pluginList.append(label);
  }
}

function renderThemes() {
  themeList.innerHTML = "";
  for (const theme of state.config.themes) {
    const button = document.createElement("button");
    button.className = "theme-chip";
    button.type = "button";
    button.textContent = theme.name;
    button.addEventListener("click", () => applyTheme(theme.id));
    themeList.append(button);
  }
}

function renderChat() {
  messagesEl.innerHTML = "";

  if (state.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = "<strong>Ready when you are.</strong>Choose a provider, enable plugins, and start a conversation.";
    messagesEl.append(empty);
    return;
  }

  for (const message of state.messages) {
    const item = document.createElement("div");
    item.className = `message ${message.role}`;
    item.textContent = message.content;
    messagesEl.append(item);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderWorkspace() {
  renderProviders();
  renderFreeModelPresets();
  renderApiSettings();
  renderPlugins();
  renderThemes();
  renderChat();
  planBadge.textContent = state.plan
    ? `Free access: ${state.plan.providerAccess.join(", ")}`
    : "";
}

function renderAll() {
  renderAuthState();
  renderProviderStatus();
  renderWorkspace();
  route();
}

function addMessage(role, content) {
  state.messages.push({ role, content });
  renderChat();
}

function selectedPlugins() {
  return $$(`#pluginList input:checked`).map(input => input.value);
}

async function sendMessage() {
  sendButton.disabled = true;
  sendButton.textContent = "Sending";

  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: state.messages,
        provider: providerSelect.value,
        model: modelInput.value.trim(),
        specialization: $("#specialization").value,
        plugins: selectedPlugins()
      })
    });
    addMessage("assistant", data.message);
    if (data.usage && data.limit) {
      planBadge.textContent = `Free access: ${data.usage}/${data.limit} messages used`;
    }
  } catch (error) {
    addMessage("error", error.message);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Send";
    input.focus();
  }
}

function openAuth(mode) {
  state.authMode = mode;
  authMessage.textContent = "";
  $("#authModeLabel").textContent = mode === "signup" ? "Create account" : "Account";
  $("#authTitle").textContent = mode === "signup" ? "Sign up" : "Log in";
  $("#authSubmit").textContent = mode === "signup" ? "Create account" : "Log in";
  authForm.elements.name.hidden = mode !== "signup";
  authDialog.showModal();
}

async function refreshMe() {
  const data = await api("/api/me");
  state.user = data.user;
  state.plan = data.plan;
  state.config = data.config;
}

async function loadAdmin() {
  if (!state.user || state.user.role !== "admin") return;

  try {
    state.admin = await api("/api/admin/overview");
    renderAdmin();
  } catch (error) {
    showToast(error.message);
  }
}

function renderAdmin() {
  if (!state.admin) return;

  $("#adminUsers").innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${state.admin.users.map(user => `
          <tr>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>
              <select data-user-role="${user.id}">
                <option ${user.role === "user" ? "selected" : ""}>user</option>
                <option ${user.role === "admin" ? "selected" : ""}>admin</option>
              </select>
            </td>
            <td>
              <select data-user-status="${user.id}">
                <option ${user.status === "active" ? "selected" : ""}>active</option>
                <option ${user.status === "disabled" ? "selected" : ""}>disabled</option>
              </select>
            </td>
            <td><button type="button" data-save-user="${user.id}">Save</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  $("#adminPlugins").innerHTML = state.admin.plugins.map(plugin => `
    <div class="item-row">
      <div><strong>${plugin.name}</strong><br><span class="muted">${plugin.description}</span></div>
      <span class="status-pill">${plugin.active ? "Active" : "Hidden"}</span>
    </div>
  `).join("");

  $("#adminThemes").innerHTML = state.admin.themes.map(theme => `
    <div class="item-row">
      <strong>${theme.name}</strong>
      <span class="status-pill">${theme.active ? "Active" : "Hidden"}</span>
    </div>
  `).join("");

  $("#adminFreeModels").innerHTML = (state.admin.freeModels || []).map(model => `
    <div class="item-row">
      <div><strong>${model.name}</strong><br><span class="muted">${model.model}</span></div>
      <span class="status-pill">${model.active ? "Active" : "Hidden"}</span>
    </div>
  `).join("");

  $$("[data-save-user]").forEach(button => {
    button.addEventListener("click", () => saveUser(button.dataset.saveUser));
  });
}

async function saveUser(userId) {
  try {
    await api(`/api/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({
        role: document.querySelector(`[data-user-role="${userId}"]`).value,
        planId: "free",
        status: document.querySelector(`[data-user-status="${userId}"]`).value
      })
    });
    await loadAdmin();
    showToast("User saved.");
  } catch (error) {
    showToast(error.message);
  }
}

async function submitCatalog(event, endpoint) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));

  try {
    await api(endpoint, { method: "POST", body: JSON.stringify(data) });
    event.target.reset();
    await refreshMe();
    await loadAdmin();
    renderAll();
    showToast("Saved.");
  } catch (error) {
    showToast(error.message);
  }
}

async function submitApiSettings(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(apiSettingsForm));

  try {
    const data = await api("/api/settings/api", {
      method: "POST",
      body: JSON.stringify({
        openaiKey: values.openaiKey,
        geminiKey: values.geminiKey,
        claudeKey: values.claudeKey,
        openrouterKey: values.openrouterKey,
        ainextcodeKey: values.ainextcodeKey,
        models: {
          openai: values.openaiModel,
          gemini: values.geminiModel,
          claude: values.claudeModel,
          openrouter: values.openrouterModel,
          ainextcode: values.ainextcodeModel
        },
        clear: {
          openai: values.clearOpenai === "on",
          gemini: values.clearGemini === "on",
          claude: values.clearClaude === "on",
          openrouter: values.clearOpenrouter === "on",
          ainextcode: values.clearAinextcode === "on"
        }
      })
    });

    state.user = data.user;
    state.config = data.config;
    apiSettingsForm.elements.openaiKey.value = "";
    apiSettingsForm.elements.geminiKey.value = "";
    apiSettingsForm.elements.claudeKey.value = "";
    apiSettingsForm.elements.openrouterKey.value = "";
    apiSettingsForm.elements.ainextcodeKey.value = "";
    apiSettingsForm.elements.clearOpenai.checked = false;
    apiSettingsForm.elements.clearGemini.checked = false;
    apiSettingsForm.elements.clearClaude.checked = false;
    apiSettingsForm.elements.clearOpenrouter.checked = false;
    apiSettingsForm.elements.clearAinextcode.checked = false;
    renderAll();
    showToast("API settings saved.");
  } catch (error) {
    showToast(error.message);
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content) return;
  input.value = "";
  addMessage("user", content);
  sendMessage();
});

providerSelect.addEventListener("change", () => {
  const provider = state.config.providers.find(item => item.id === providerSelect.value);
  if (provider) modelInput.value = provider.defaultModel;
});

$("#clear").addEventListener("click", () => {
  state.messages = [];
  renderChat();
  input.focus();
});

$("#loginOpen").addEventListener("click", () => openAuth("login"));
$("#signupOpen").addEventListener("click", () => openAuth("signup"));
$("#heroSignup").addEventListener("click", () => openAuth("signup"));
$("#authClose").addEventListener("click", () => authDialog.close());

$("#logout").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  state.user = null;
  state.plan = null;
  state.messages = [];
  renderAll();
  location.hash = "#home";
});

$("#themeToggle").addEventListener("click", () => {
  const themes = state.config.themes.length ? state.config.themes : [{ id: "sage" }, { id: "midnight" }, { id: "paper" }, { id: "signal" }];
  const index = themes.findIndex(theme => theme.id === state.selectedTheme);
  applyTheme(themes[(index + 1) % themes.length].id);
});

authForm.addEventListener("submit", async event => {
  event.preventDefault();
  authMessage.textContent = "";
  const values = Object.fromEntries(new FormData(authForm));
  const endpoint = state.authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";

  try {
    const data = await api(endpoint, { method: "POST", body: JSON.stringify(values) });
    state.user = data.user;
    await refreshMe();
    authDialog.close();
    authForm.reset();
    renderAll();
    location.hash = "#app";
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

$("#pluginForm").addEventListener("submit", event => submitCatalog(event, "/api/admin/plugins"));
$("#themeForm").addEventListener("submit", event => submitCatalog(event, "/api/admin/themes"));
if ($("#settingsForm")) $("#settingsForm").addEventListener("submit", event => submitCatalog(event, "/api/admin/settings"));
$("#freeModelForm").addEventListener("submit", event => submitCatalog(event, "/api/admin/free-models"));
apiSettingsForm.addEventListener("submit", submitApiSettings);

window.addEventListener("hashchange", route);

(async function init() {
  applyTheme(state.selectedTheme);
  try {
    await refreshMe();
  } catch (error) {
    const config = await api("/api/config");
    state.config = config;
  }
  renderAll();
})();
