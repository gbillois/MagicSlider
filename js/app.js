(() => {
  "use strict";

  const STORAGE_KEY = "magicslider_autosave_v1";
  const SETTINGS_KEY = "magicslider_settings_v1";
  const SECRET_KEY = "magicslider_api_key";
  const AZURE_SECRET_KEY = "magicslider_azure_api_key";
  const BASE_W = 960;
  const BASE_H = 540;

  const DEFAULT_MODELS = {
    anthropic: ["claude-sonnet-4-20250514"],
    openai: ["gpt-5.2", "gpt-5", "gpt-5-mini", "gpt-5-nano", "o3", "o4-mini", "o3-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini"],
    azure_openai: ["gpt-5.2", "gpt-5", "gpt-5-mini", "gpt-5-nano", "o3", "o4-mini", "o3-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini"],
    google_gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite"],
    mistral: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"]
  };

  const STYLE_PRESETS = {
    wavestone: {
      label: "Wavestone",
      css: `
        .ms-slide{background:#ffffff;color:#171321;font-family:Inter,Arial,sans-serif;}
        .ms-slide::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(69,29,199,.08),transparent 38%),linear-gradient(90deg,#04f06a 0 8px,transparent 8px);}
        .ms-title{color:#451dc7;font-family:Poppins,Inter,Arial,sans-serif;font-weight:800;}
        .ms-accent{background:#04f06a;color:#16121f;}
        .ms-footer{color:#6b6580;}
      `
    },
    darkcyber: {
      label: "Dark Cyber",
      css: `
        .ms-slide{background:#070b12;color:#e7f9ff;font-family:Inter,Arial,sans-serif;}
        .ms-slide::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(4,240,106,.16),transparent 32%),linear-gradient(180deg,rgba(42,88,255,.18),transparent 62%);}
        .ms-title{color:#7cfcae;font-family:Inter,Arial,sans-serif;font-weight:800;}
        .ms-accent{background:#143b52;color:#7cfcae;border:1px solid rgba(124,252,174,.42);}
        .ms-footer{color:#88a0b2;}
      `
    }
  };

  const SLIDE_TEMPLATES = [
    { id: "blank", name: "Blank", desc: "Canvas libre" },
    { id: "title", name: "Title", desc: "Titre et sous-titre" },
    { id: "section", name: "Section", desc: "Intercalaire fort" },
    { id: "bullets", name: "Bullets", desc: "Message et points clés" },
    { id: "two-column", name: "Two columns", desc: "Comparaison ou plan" },
    { id: "image", name: "Image", desc: "Visuel plein format" }
  ];

  const state = {
    activeTab: "create",
    selectedIds: [],
    clipboard: null,
    currentTemplate: "title",
    drag: null,
    aiCatalog: { provider: "", status: "idle", models: [], error: "", requestId: 0 },
    connectionTest: { status: "idle", message: "", checkedAt: null },
    create: {
      brief: "",
      slideCount: 5,
      style: "wavestone",
      customCss: "",
      customCssName: "",
      brandPrompt: "",
      loading: false,
      styleLoading: false,
      log: []
    },
    export: { quality: 2, log: [] },
    settings: defaultSettings(),
    deck: {
      title: "MagicSlider deck",
      slides: []
    }
  };

  function defaultSettings() {
    return {
      ai_provider: "anthropic",
      ai_model: DEFAULT_MODELS.anthropic[0],
      ai_api_key: "",
      azure_endpoint: "",
      azure_api_key: "",
      azure_deployment: "",
      confidentiality_acknowledged: false
    };
  }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(message, type = "info") {
    const root = document.getElementById("toast-root");
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    root.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function saveLocal() {
    const clean = JSON.parse(JSON.stringify({ deck: state.deck, create: state.create, settings: state.settings }));
    clean.settings.ai_api_key = "";
    clean.settings.azure_api_key = "";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    persistProviderSettings();
  }

  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.deck?.slides) state.deck = saved.deck;
      if (saved?.create) Object.assign(state.create, saved.create, { loading: false, styleLoading: false, log: saved.create.log || [] });
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (settings) Object.assign(state.settings, settings);
      restoreApiKeys();
      normalizeSettings();
    } catch (error) {
      console.warn("Autosave load failed", error);
    }
  }

  function persistProviderSettings() {
    const publicSettings = { ...state.settings, ai_api_key: "", azure_api_key: "" };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(publicSettings));
    const secrets = sessionStorage || localStorage;
    state.settings.ai_api_key ? secrets.setItem(SECRET_KEY, state.settings.ai_api_key) : secrets.removeItem(SECRET_KEY);
    state.settings.azure_api_key ? secrets.setItem(AZURE_SECRET_KEY, state.settings.azure_api_key) : secrets.removeItem(AZURE_SECRET_KEY);
  }

  function restoreApiKeys() {
    const secrets = sessionStorage || localStorage;
    state.settings.ai_api_key = secrets.getItem(SECRET_KEY) || state.settings.ai_api_key || "";
    state.settings.azure_api_key = secrets.getItem(AZURE_SECRET_KEY) || state.settings.azure_api_key || "";
  }

  function normalizeSettings() {
    if (!DEFAULT_MODELS[state.settings.ai_provider]) state.settings.ai_provider = "anthropic";
    const models = DEFAULT_MODELS[state.settings.ai_provider] || DEFAULT_MODELS.anthropic;
    if (!state.settings.ai_model) state.settings.ai_model = models[0];
    state.settings.ai_api_key ||= "";
    state.settings.azure_endpoint ||= "";
    state.settings.azure_deployment ||= "";
    state.settings.azure_api_key ||= "";
  }

  function currentSlide() {
    return state.deck.slides.find((slide) => slide.id === state.currentSlideId) || state.deck.slides[0] || null;
  }

  function currentElements() {
    const slide = currentSlide();
    return slide ? slide.elements.filter((element) => state.selectedIds.includes(element.id)) : [];
  }

  function createElement(type, overrides = {}) {
    const base = {
      id: uid("el"),
      type,
      x: 90,
      y: 90,
      w: type === "line" ? 240 : 260,
      h: type === "line" ? 4 : 90,
      rotate: 0,
      fill: type === "text" || type === "line" ? "transparent" : "#451dc7",
      stroke: type === "text" ? "transparent" : "#451dc7",
      strokeWidth: type === "line" ? 3 : 1,
      color: "#171321",
      fontSize: 30,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 700,
      fontStyle: "normal",
      text: type === "text" ? "New text" : "",
      url: "",
      opacity: 1,
      z: Date.now()
    };
    if (type === "ellipse") base.radius = "50%";
    return { ...base, ...overrides };
  }

  function makeSlide(template = "blank", data = {}) {
    const slide = {
      id: uid("slide"),
      name: data.name || "Untitled slide",
      background: data.background || "#ffffff",
      notes: data.notes || "",
      elements: []
    };
    const title = data.title || "New slide";
    const subtitle = data.subtitle || "";
    const bullets = Array.isArray(data.bullets) ? data.bullets : [];
    if (template === "title") {
      slide.elements.push(createElement("text", { x: 70, y: 72, w: 780, h: 90, text: title, color: "#451dc7", fontSize: 48, fontFamily: "Poppins, Inter, sans-serif", fontWeight: 800 }));
      slide.elements.push(createElement("text", { x: 74, y: 185, w: 620, h: 110, text: subtitle || "Subtitle", color: "#4b465f", fontSize: 24, fontWeight: 500 }));
      slide.elements.push(createElement("rect", { x: 74, y: 410, w: 230, h: 18, fill: "#04f06a", stroke: "transparent" }));
    } else if (template === "section") {
      slide.background = "#16121f";
      slide.elements.push(createElement("text", { x: 80, y: 160, w: 780, h: 116, text: title, color: "#ffffff", fontSize: 54, fontFamily: "Poppins, Inter, sans-serif", fontWeight: 800 }));
      slide.elements.push(createElement("rect", { x: 80, y: 318, w: 300, h: 16, fill: "#04f06a", stroke: "transparent" }));
    } else if (template === "bullets") {
      slide.elements.push(createElement("text", { x: 64, y: 52, w: 790, h: 70, text: title, color: "#451dc7", fontSize: 38, fontFamily: "Poppins, Inter, sans-serif", fontWeight: 800 }));
      slide.elements.push(createElement("text", { x: 88, y: 150, w: 760, h: 260, text: (bullets.length ? bullets : ["First point", "Second point", "Third point"]).map((b) => `- ${b}`).join("\n"), color: "#171321", fontSize: 25, fontWeight: 500 }));
    } else if (template === "two-column") {
      slide.elements.push(createElement("text", { x: 60, y: 44, w: 830, h: 58, text: title, color: "#451dc7", fontSize: 36, fontFamily: "Poppins, Inter, sans-serif", fontWeight: 800 }));
      slide.elements.push(createElement("rect", { x: 66, y: 132, w: 390, h: 310, fill: "#f5f4f9", stroke: "#d1caf2" }));
      slide.elements.push(createElement("rect", { x: 504, y: 132, w: 390, h: 310, fill: "#f1ffee", stroke: "#a6faca" }));
      slide.elements.push(createElement("text", { x: 94, y: 164, w: 320, h: 220, text: bullets.slice(0, 3).map((b) => `- ${b}`).join("\n") || "- Point A\n- Point B", fontSize: 22, fontWeight: 500 }));
      slide.elements.push(createElement("text", { x: 532, y: 164, w: 320, h: 220, text: bullets.slice(3, 6).map((b) => `- ${b}`).join("\n") || "- Point C\n- Point D", fontSize: 22, fontWeight: 500 }));
    } else if (template === "image") {
      slide.elements.push(createElement("rect", { x: 0, y: 0, w: 960, h: 540, fill: "#16121f", stroke: "transparent" }));
      slide.elements.push(createElement("text", { x: 68, y: 330, w: 700, h: 96, text: title, color: "#ffffff", fontSize: 44, fontFamily: "Poppins, Inter, sans-serif", fontWeight: 800 }));
      slide.elements.push(createElement("text", { x: 72, y: 430, w: 560, h: 48, text: subtitle, color: "#dfe7f1", fontSize: 20, fontWeight: 500 }));
    }
    slide.name = title.slice(0, 48) || slide.name;
    return slide;
  }

  function seedDeckIfNeeded() {
    if (state.deck.slides.length) {
      state.currentSlideId = state.deck.slides[0].id;
      return;
    }
    const first = makeSlide("title", {
      title: "MagicSlider",
      subtitle: "Create, edit and export AI-generated HTML slides",
      bullets: []
    });
    const second = makeSlide("bullets", {
      title: "Workflow",
      bullets: ["Create a deck with your configured LLM", "Edit every slide like a lightweight PowerPoint canvas", "Export as high-quality PPTX or standalone HTML"]
    });
    state.deck.slides = [first, second];
    state.currentSlideId = first.id;
  }

  function getStyleCss() {
    const preset = STYLE_PRESETS[state.create.style]?.css || STYLE_PRESETS.wavestone.css;
    return `${preset}\n${state.create.customCss || ""}`;
  }

  function providerSummary() {
    const s = state.settings;
    if (s.ai_provider === "azure_openai") return `Azure OpenAI / ${s.azure_deployment || "deployment not set"}`;
    const labels = { anthropic: "Anthropic", openai: "OpenAI", google_gemini: "Google Gemini", mistral: "Mistral" };
    return `${labels[s.ai_provider] || s.ai_provider} / ${s.ai_model || "model not set"}`;
  }

  function isAIReady() {
    const s = state.settings;
    if (!s.confidentiality_acknowledged) return false;
    if (s.ai_provider === "azure_openai") return Boolean(s.azure_endpoint && s.azure_api_key && s.azure_deployment);
    return Boolean(s.ai_api_key && s.ai_model);
  }

  function availableModels() {
    const provider = state.settings.ai_provider;
    const fallback = DEFAULT_MODELS[provider] || [];
    const dynamic = state.aiCatalog.provider === provider && state.aiCatalog.models.length ? state.aiCatalog.models : fallback;
    return [...new Set([state.settings.ai_model, ...dynamic].filter(Boolean))];
  }

  function classifyLLMError(error) {
    const msg = String(error?.message || error || "").toLowerCase();
    if (msg.includes("401") || msg.includes("403") || msg.includes("invalid") || msg.includes("api key") || msg.includes("unauthorized")) return "auth";
    if (msg.includes("429") || msg.includes("quota") || msg.includes("rate limit")) return "quota";
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("connection") || msg.includes("cors")) return "network";
    return "malformed";
  }

  function errorMessage(code, raw) {
    const map = {
      auth: "Clé API invalide ou non autorisée. Vérifiez l'onglet Settings.",
      quota: "Quota ou rate limit atteint. Réessayez plus tard ou changez de modèle.",
      network: "Erreur réseau ou CORS. Vérifiez la connexion et le fournisseur.",
      malformed: "Réponse IA inexploitable. Reformulez la demande ou changez de modèle."
    };
    return `${map[code] || map.malformed}${raw ? ` (${raw})` : ""}`;
  }

  function parseLLMJson(text) {
    const raw = String(text || "").trim();
    try { return JSON.parse(raw); } catch (_) {}
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try { return JSON.parse(fenced[1]); } catch (_) {}
    }
    const start = Math.min(...["{", "["].map((token) => {
      const idx = raw.indexOf(token);
      return idx < 0 ? Infinity : idx;
    }));
    const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
    if (Number.isFinite(start) && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("No valid JSON object in LLM response");
  }

  async function fetchProviderModels(force = false) {
    const provider = state.settings.ai_provider;
    if (provider === "azure_openai") return;
    if (!state.settings.ai_api_key) {
      state.aiCatalog = { provider, status: "missing-key", models: [], error: "", requestId: (state.aiCatalog.requestId || 0) + 1 };
      render();
      return;
    }
    if (!force && state.aiCatalog.provider === provider && ["loading", "success"].includes(state.aiCatalog.status)) return;
    const requestId = (state.aiCatalog.requestId || 0) + 1;
    state.aiCatalog = { provider, status: "loading", models: [], error: "", requestId };
    render();
    try {
      let response;
      const key = state.settings.ai_api_key;
      if (provider === "anthropic") {
        response = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
        });
      } else if (provider === "openai") {
        response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
      } else if (provider === "google_gemini") {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      } else if (provider === "mistral") {
        response = await fetch("https://api.mistral.ai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
      let models = [];
      if (provider === "openai") {
        models = (data.data || []).map((m) => m.id).filter((id) => /^(gpt-|o\d|chatgpt)/.test(id)).filter((id) => !/(audio|realtime|search|transcribe|tts|embed|image|moderation|instruct)/i.test(id));
      } else if (provider === "google_gemini") {
        models = (data.models || []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => String(m.name || "").replace(/^models\//, ""));
      } else if (provider === "mistral") {
        models = (data.data || []).filter((m) => m.capabilities?.completion_chat !== false).map((m) => m.id).filter((id) => id && !/(embed|moderation|ocr|transcribe|tts|voxtral|codestral-embed)/i.test(id));
      } else {
        models = (data.data || []).map((m) => m.id);
      }
      if (state.aiCatalog.requestId !== requestId) return;
      state.aiCatalog = { provider, status: "success", models: [...new Set(models)].sort(), error: "", requestId };
    } catch (error) {
      if (state.aiCatalog.requestId !== requestId) return;
      state.aiCatalog = { provider, status: "error", models: [], error: error.message || String(error), requestId };
    }
    render();
  }

  async function llmGenerate(systemPrompt, userPrompt, maxTokens = 4000) {
    const s = state.settings;
    if (!isAIReady()) throw new Error("Configuration IA incomplete ou validation de confidentialite manquante.");
    if (s.ai_provider === "azure_openai") {
      const endpoint = s.azure_endpoint.replace(/\/+$/, "");
      const response = await fetch(`${endpoint}/openai/deployments/${encodeURIComponent(s.azure_deployment)}/chat/completions?api-version=2024-02-01`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": s.azure_api_key },
        body: JSON.stringify({ messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], max_tokens: maxTokens })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Azure OpenAI HTTP ${response.status}`);
      return parseLLMJson(data.choices?.[0]?.message?.content || "");
    }
    if (s.ai_provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": s.ai_api_key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: s.ai_model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Anthropic HTTP ${response.status}`);
      return parseLLMJson(data.content?.[0]?.text || "");
    }
    if (s.ai_provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.ai_api_key}` },
        body: JSON.stringify({ model: s.ai_model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], max_tokens: maxTokens })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `OpenAI HTTP ${response.status}`);
      return parseLLMJson(data.choices?.[0]?.message?.content || "");
    }
    if (s.ai_provider === "mistral") {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.ai_api_key}` },
        body: JSON.stringify({ model: s.ai_model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], max_tokens: maxTokens, response_format: { type: "json_object" } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Mistral HTTP ${response.status}`);
      return parseLLMJson(data.choices?.[0]?.message?.content || "");
    }
    if (s.ai_provider === "google_gemini") {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.ai_model)}:generateContent?key=${encodeURIComponent(s.ai_api_key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }], generationConfig: { maxOutputTokens: maxTokens } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Google Gemini HTTP ${response.status}`);
      return parseLLMJson(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
    }
    throw new Error(`Unsupported provider: ${s.ai_provider}`);
  }

  async function testConnection() {
    state.connectionTest = { status: "testing", message: "Test en cours...", checkedAt: null };
    render();
    try {
      const result = await llmGenerate("Reply only with JSON.", "Return exactly {\"ok\":true,\"message\":\"valid connection\"}.", 200);
      state.connectionTest = { status: "success", message: result.message || "Connexion confirmee.", checkedAt: new Date().toISOString() };
      toast("Connexion IA confirmee.", "success");
    } catch (error) {
      state.connectionTest = { status: "error", message: errorMessage(classifyLLMError(error), error.message), checkedAt: new Date().toISOString() };
      toast("Test IA en echec.", "error");
    }
    render();
  }

  function addLog(role, message, error = false) {
    state.create.log.push({ role, message, error, at: new Date().toLocaleTimeString() });
    state.create.log = state.create.log.slice(-30);
  }

  async function generateDeck() {
    if (!state.create.brief.trim()) {
      toast("Ajoutez un brief avant de lancer la creation.", "error");
      return;
    }
    state.create.loading = true;
    addLog("User", state.create.brief);
    render();
    const systemPrompt = `You are MagicSlider, a senior presentation designer.
Create editable PowerPoint-like HTML slides. Return only strict JSON.
The JSON shape must be:
{
  "title": "deck title",
  "slides": [
    {
      "template": "title|section|bullets|two-column|image",
      "title": "short slide title",
      "subtitle": "optional short subtitle",
      "bullets": ["up to 6 concise bullets"],
      "notes": "speaker notes or design rationale"
    }
  ]
}
Rules:
- Generate exactly ${state.create.slideCount} slides.
- Use the requested topic and infer missing details.
- Keep text concise enough to fit a 16:9 slide.
- Prefer executive consulting style for Wavestone and technical contrast for Dark Cyber.
- Do not include markdown fences.`;
    const userPrompt = `Deck brief:\n${state.create.brief}\n\nGraphic style: ${STYLE_PRESETS[state.create.style]?.label || "Custom"}\nCustom CSS or visual constraints:\n${state.create.customCss || "None"}`;
    addLog("System", systemPrompt.slice(0, 900) + "...");
    try {
      const result = await llmGenerate(systemPrompt, userPrompt, 6500);
      addLog("Assistant", JSON.stringify(result, null, 2));
      const slides = (result.slides || []).slice(0, state.create.slideCount).map((item) => makeSlide(item.template || "bullets", item));
      if (!slides.length) throw new Error("The model returned no slides.");
      state.deck.title = result.title || "MagicSlider deck";
      state.deck.slides = slides;
      state.currentSlideId = slides[0].id;
      state.selectedIds = [];
      state.activeTab = "modify";
      saveLocal();
      toast("Deck cree. Vous pouvez le modifier.", "success");
    } catch (error) {
      const code = classifyLLMError(error);
      addLog("Error", errorMessage(code, error.message), true);
      toast(errorMessage(code), "error");
    } finally {
      state.create.loading = false;
      render();
    }
  }

  async function generateBrandCss() {
    if (!state.create.brandPrompt.trim()) {
      toast("Decrivez la charte graphique a generer.", "error");
      return;
    }
    state.create.styleLoading = true;
    render();
    try {
      const result = await llmGenerate(
        "You generate CSS for HTML slides. Return only JSON.",
        `Create a coherent CSS theme for .ms-slide, .ms-title, .ms-accent, .ms-footer based on this description: ${state.create.brandPrompt}
Return {"name":"short name","css":"valid CSS only, scoped to .ms-slide and descendants"}.`,
        2200
      );
      state.create.customCssName = result.name || "Custom theme";
      state.create.customCss = result.css || "";
      addLog("Assistant", `Generated CSS theme: ${state.create.customCssName}\n${state.create.customCss}`);
      toast("Charte graphique generee.", "success");
      saveLocal();
    } catch (error) {
      addLog("Error", errorMessage(classifyLLMError(error), error.message), true);
      toast("Generation de charte en echec.", "error");
    } finally {
      state.create.styleLoading = false;
      render();
    }
  }

  function elementStyle(element, scale = 1) {
    const css = [
      `left:${element.x * scale}px`,
      `top:${element.y * scale}px`,
      `width:${element.w * scale}px`,
      `height:${element.h * scale}px`,
      `z-index:${element.z || 1}`,
      `opacity:${element.opacity ?? 1}`,
      `transform:rotate(${element.rotate || 0}deg)`,
      `font-size:${(element.fontSize || 24) * scale}px`,
      `font-family:${element.fontFamily || "Inter, Arial, sans-serif"}`,
      `font-weight:${element.fontWeight || 500}`,
      `font-style:${element.fontStyle || "normal"}`,
      `color:${element.color || "#171321"}`,
      `background:${element.fill || "transparent"}`,
      `border:${(element.strokeWidth || 0) * scale}px solid ${element.stroke || "transparent"}`,
      `border-radius:${element.radius || "0"}`
    ];
    if (element.type === "line") css.push("border-width:0", `height:${Math.max(2, (element.strokeWidth || 3) * scale)}px`, `background:${element.stroke || element.fill || "#171321"}`);
    return css.join(";");
  }

  function renderSlideHtml(slide, options = {}) {
    const scale = options.scale || 1;
    const editable = Boolean(options.editable);
    const selected = new Set(state.selectedIds);
    const elements = slide.elements.map((element) => {
      const selectedClass = selected.has(element.id) ? (state.selectedIds.length > 1 ? " multi-selected" : " selected") : "";
      const handle = editable && selected.has(element.id) ? `<span class="resize-handle" data-resize="${element.id}"></span>` : "";
      const common = `class="slide-element ${element.type}${selectedClass}" data-element-id="${element.id}" style="${escapeAttr(elementStyle(element, scale))}"`;
      if (element.type === "text") {
        return `<div ${common} ${editable ? 'contenteditable="true" spellcheck="false"' : ""}>${escapeHtml(element.text || "")}${handle}</div>`;
      }
      if (element.type === "image") {
        return `<div ${common}><img src="${escapeAttr(element.url || "")}" alt="">${handle}</div>`;
      }
      return `<div ${common}>${handle}</div>`;
    }).join("");
    const empty = !slide.elements.length ? `<div class="slide-empty">Blank slide</div>` : "";
    return `<div class="slide-inner ms-slide" style="background:${escapeAttr(slide.background || "#fff")};">${elements}${empty}</div>`;
  }

  function renderMiniSlide(slide) {
    return `<div class="mini-slide ms-slide" style="background:${escapeAttr(slide.background || "#fff")}">${slide.elements.map((element) => {
      const style = elementStyle(element, 1);
      if (element.type === "text") return `<div class="slide-element text" style="${escapeAttr(style)}">${escapeHtml(element.text || "")}</div>`;
      if (element.type === "image") return `<div class="slide-element image" style="${escapeAttr(style)}"><img src="${escapeAttr(element.url || "")}" alt=""></div>`;
      return `<div class="slide-element ${element.type}" style="${escapeAttr(style)}"></div>`;
    }).join("")}</div>`;
  }

  function render() {
    const app = document.getElementById("app");
    app.innerHTML = `
      <style id="deck-style">${getStyleCss()}</style>
      <header class="topbar">
        <div class="brand"><div class="brand-mark">MS</div><div><span class="brand-title">MagicSlider</span><span class="brand-sub">HTML slides studio</span></div></div>
        <nav class="tabbar">
          ${tabButton("create", "Create")}
          ${tabButton("modify", "Modify")}
          ${tabButton("export", "Export")}
          ${tabButton("settings", "Settings")}
        </nav>
        <div class="provider-pill"><span class="status-dot ${isAIReady() ? "ok" : "warn"}"></span><span>${escapeHtml(providerSummary())}</span></div>
      </header>
      ${state.activeTab === "create" ? renderCreateTab() : ""}
      ${state.activeTab === "modify" ? renderModifyTab() : ""}
      ${state.activeTab === "export" ? renderExportTab() : ""}
      ${state.activeTab === "settings" ? renderSettingsTab() : ""}
    `;
  }

  function tabButton(id, label) {
    return `<button class="tab ${state.activeTab === id ? "active" : ""}" data-action="tab" data-tab="${id}">${label}</button>`;
  }

  function renderCreateTab() {
    const slide = currentSlide();
    return `
      <main class="workspace">
        <section class="panel">
          <div class="panel-header"><h2>Create</h2><span class="slide-count">${state.deck.slides.length} slides</span></div>
          <div class="panel-scroll">
            <label class="field">Brief de presentation
              <textarea data-bind-create="brief" placeholder="Ex: Cree une presentation executive de 6 slides sur la strategie Zero Trust d'un groupe bancaire europeen...">${escapeHtml(state.create.brief)}</textarea>
            </label>
            <label class="field">Style graphique
              <select data-bind-create="style">
                <option value="wavestone" ${state.create.style === "wavestone" ? "selected" : ""}>Wavestone</option>
                <option value="darkcyber" ${state.create.style === "darkcyber" ? "selected" : ""}>Dark Cyber</option>
              </select>
            </label>
            <div class="btn-row" style="margin-bottom:13px;">
              <button class="btn" data-action="load-css">Load CSS</button>
              <input id="css-file-input" type="file" accept=".css,text/css" hidden>
              <button class="btn" data-action="clear-css" ${state.create.customCss ? "" : "disabled"}>Clear CSS</button>
            </div>
            ${state.create.customCssName ? `<p class="helper" style="margin-top:-8px;margin-bottom:12px;">CSS actif: ${escapeHtml(state.create.customCssName)}</p>` : ""}
            <label class="field">Creer une charte graphique par description
              <textarea data-bind-create="brandPrompt" placeholder="Ex: Identite premium conseil, fond clair, accents verts, formes nettes, typographie sobre...">${escapeHtml(state.create.brandPrompt)}</textarea>
            </label>
            <button class="btn full" data-action="generate-brand" ${state.create.styleLoading || !isAIReady() ? "disabled" : ""}>${state.create.styleLoading ? '<span class="spinner"></span>' : ""}Generate CSS</button>
            <div class="field-row" style="margin-top:13px;">
              <label class="field">Nombre de slides
                <input type="number" min="1" max="40" step="1" data-bind-create="slideCount" value="${state.create.slideCount}">
              </label>
              <label class="field">Modele IA
                <input value="${escapeAttr(providerSummary())}" disabled>
              </label>
            </div>
            <button class="btn primary full" data-action="create-deck" ${state.create.loading || !isAIReady() ? "disabled" : ""}>${state.create.loading ? '<span class="spinner"></span>' : ""}Create</button>
            <p class="helper">${isAIReady() ? "La generation utilise le fournisseur configure dans Settings." : "Configurez et validez l'IA dans Settings pour activer la generation."}</p>
            <div class="llm-log">${state.create.log.length ? state.create.log.map((entry) => `<div class="log-entry"><span class="log-role ${entry.error ? "error" : ""}">${escapeHtml(entry.role)} - ${escapeHtml(entry.at)}</span>${escapeHtml(entry.message)}</div>`).join("") : '<div class="log-entry"><span class="log-role">System</span>Les echanges LLM apparaitront ici.</div>'}</div>
          </div>
        </section>
        <section class="stage-panel">
          <div class="stage-toolbar">
            <strong>${escapeHtml(state.deck.title)}</strong>
            <span class="spacer"></span>
            <button class="btn" data-action="prev-slide">Prev</button>
            <button class="btn" data-action="next-slide">Next</button>
          </div>
          <div class="preview-wrap">
            <div class="slide">${slide ? renderSlideHtml(slide) : '<div class="slide-empty">No slide</div>'}</div>
          </div>
        </section>
      </main>
    `;
  }

  function renderModifyTab() {
    const slide = currentSlide();
    return `
      <main class="workspace modify">
        <section class="panel">
          <div class="panel-header"><h3>Slides</h3><button class="btn" data-action="add-slide">Add</button></div>
          <div class="thumb-list">
            ${state.deck.slides.map((s, index) => `<button class="thumb ${s.id === state.currentSlideId ? "active" : ""}" data-action="select-slide" data-slide-id="${s.id}">
              <div class="thumb-preview">${renderMiniSlide(s)}</div>
              <div class="thumb-title">${index + 1}. ${escapeHtml(s.name || "Slide")}</div>
            </button>`).join("")}
          </div>
        </section>
        <section class="stage-panel">
          <div class="stage-toolbar">
            <button class="btn" data-action="add-text">Text</button>
            <button class="btn" data-action="add-rect">Rect</button>
            <button class="btn" data-action="add-ellipse">Ellipse</button>
            <button class="btn" data-action="add-line">Line</button>
            <button class="btn" data-action="add-image">Image URL</button>
            <span class="spacer"></span>
            <button class="btn" data-action="duplicate-selected" ${state.selectedIds.length ? "" : "disabled"}>Duplicate</button>
            <button class="btn danger" data-action="delete-selected" ${state.selectedIds.length ? "" : "disabled"}>Delete</button>
          </div>
          <div class="editor-wrap">
            <div class="slide" data-slide-canvas>${slide ? renderSlideHtml(slide, { editable: true }) : '<div class="slide-empty">No slide</div>'}</div>
          </div>
        </section>
        <aside class="side-panel">
          ${renderInspector(slide)}
        </aside>
      </main>
    `;
  }

  function renderInspector(slide) {
    const selected = currentElements();
    const one = selected.length === 1 ? selected[0] : null;
    return `
      <div class="inspector-section">
        <h3>Slide</h3>
        <label class="field">Name
          <input data-bind-slide="name" value="${escapeAttr(slide?.name || "")}">
        </label>
        <label class="field">Background
          <input type="color" data-bind-slide="background" value="${escapeAttr(normalizeColor(slide?.background || "#ffffff"))}">
        </label>
        <button class="btn danger full" data-action="delete-slide" ${state.deck.slides.length <= 1 ? "disabled" : ""}>Delete slide</button>
      </div>
      <div class="inspector-section">
        <h3>Add slide template</h3>
        <div class="template-grid">
          ${SLIDE_TEMPLATES.map((tpl) => `<button class="template-option ${state.currentTemplate === tpl.id ? "active" : ""}" data-action="choose-template" data-template="${tpl.id}">
            <span class="template-name">${escapeHtml(tpl.name)}</span><span class="template-desc">${escapeHtml(tpl.desc)}</span>
          </button>`).join("")}
        </div>
      </div>
      <div class="inspector-section">
        <h3>Selection ${selected.length ? `(${selected.length})` : ""}</h3>
        ${one ? renderElementInspector(one) : `<p class="helper">Selectionnez un bloc. Maintenez Shift pour une selection multiple.</p>`}
        ${selected.length > 1 ? renderMultiInspector() : ""}
      </div>
    `;
  }

  function renderElementInspector(element) {
    return `
      <div class="compact-grid">
        <label class="field">X<input type="number" data-bind-el="x" value="${Math.round(element.x)}"></label>
        <label class="field">Y<input type="number" data-bind-el="y" value="${Math.round(element.y)}"></label>
        <label class="field">W<input type="number" data-bind-el="w" value="${Math.round(element.w)}"></label>
        <label class="field">H<input type="number" data-bind-el="h" value="${Math.round(element.h)}"></label>
      </div>
      ${element.type === "text" ? `
        <label class="field" style="margin-top:10px;">Text
          <textarea data-bind-el="text">${escapeHtml(element.text || "")}</textarea>
        </label>
        <label class="field">Font
          <select data-bind-el="fontFamily">
            ${["Inter, Arial, sans-serif", "Poppins, Inter, sans-serif", "Georgia, serif", "Arial, sans-serif", "Courier New, monospace"].map((font) => `<option value="${escapeAttr(font)}" ${element.fontFamily === font ? "selected" : ""}>${escapeHtml(font.split(",")[0])}</option>`).join("")}
          </select>
        </label>
        <div class="compact-grid">
          <label class="field">Size<input type="number" data-bind-el="fontSize" value="${element.fontSize || 24}"></label>
          <label class="field">Color<input type="color" data-bind-el="color" value="${escapeAttr(normalizeColor(element.color || "#171321"))}"></label>
        </div>
        <div class="segmented" style="margin-top:10px;">
          <button data-action="toggle-bold" class="${Number(element.fontWeight) >= 700 ? "active" : ""}">B</button>
          <button data-action="toggle-italic" class="${element.fontStyle === "italic" ? "active" : ""}">I</button>
        </div>
      ` : ""}
      ${element.type !== "text" && element.type !== "image" ? `
        <div class="compact-grid" style="margin-top:10px;">
          <label class="field">Fill<input type="color" data-bind-el="fill" value="${escapeAttr(normalizeColor(element.fill || "#451dc7"))}"></label>
          <label class="field">Stroke<input type="color" data-bind-el="stroke" value="${escapeAttr(normalizeColor(element.stroke || "#451dc7"))}"></label>
        </div>
      ` : ""}
      ${element.type === "image" ? `<label class="field" style="margin-top:10px;">URL<input data-bind-el="url" value="${escapeAttr(element.url || "")}"></label>` : ""}
    `;
  }

  function renderMultiInspector() {
    return `
      <div class="compact-grid" style="margin-top:10px;">
        <button class="btn" data-action="align-left">Align left</button>
        <button class="btn" data-action="align-top">Align top</button>
        <button class="btn" data-action="bring-forward">Forward</button>
        <button class="btn" data-action="send-backward">Backward</button>
      </div>
    `;
  }

  function renderExportTab() {
    return `
      <main class="workspace export">
        <section class="panel">
          <div class="panel-header"><h2>Export</h2><span class="slide-count">${state.deck.slides.length} slides</span></div>
          <div class="panel-scroll">
            <div class="export-card">
              <h3>PPTX haute qualite</h3>
              <label class="field">Qualite screenshot
                <select data-bind-export="quality">
                  <option value="2" ${state.export.quality === 2 ? "selected" : ""}>High - 2x</option>
                  <option value="3" ${state.export.quality === 3 ? "selected" : ""}>Ultra - 3x</option>
                </select>
              </label>
              <button class="btn primary full" data-action="export-pptx">Export PPTX</button>
              <p class="helper">Chaque slide HTML est capturee en PNG puis placee plein format dans PowerPoint. Les photos externes doivent autoriser le chargement navigateur.</p>
            </div>
            <div class="export-card">
              <h3>HTML autonome</h3>
              <button class="btn full" data-action="export-html">Export HTML</button>
              <p class="helper">Genere un fichier HTML de presentation avec navigation clavier et styles embarques.</p>
            </div>
            <div class="llm-log">${state.export.log.length ? state.export.log.map((line) => `<div class="log-entry">${escapeHtml(line)}</div>`).join("") : '<div class="log-entry">Les exports apparaitront ici.</div>'}</div>
          </div>
        </section>
        <section class="stage-panel">
          <div class="stage-toolbar"><strong>Preview export</strong></div>
          <div class="export-preview-list">
            ${state.deck.slides.map((slide, index) => `<div class="export-preview"><div class="thumb-preview">${renderMiniSlide(slide)}</div><div class="thumb-title">${index + 1}. ${escapeHtml(slide.name)}</div></div>`).join("")}
          </div>
        </section>
      </main>
    `;
  }

  function renderSettingsTab() {
    const s = state.settings;
    const isAzure = s.ai_provider === "azure_openai";
    const models = availableModels();
    const catalogMsg = state.aiCatalog.provider === s.ai_provider
      ? state.aiCatalog.status === "loading" ? "Chargement des modeles..."
      : state.aiCatalog.status === "success" ? `${state.aiCatalog.models.length} modeles charges depuis le fournisseur.`
      : state.aiCatalog.status === "error" ? `Liste par defaut. API fournisseur: ${state.aiCatalog.error}`
      : state.aiCatalog.status === "missing-key" ? "Liste par defaut. Ajoutez une cle API pour charger les modeles."
      : "La liste peut etre chargee dynamiquement."
      : "La liste peut etre chargee dynamiquement.";
    return `
      <main class="workspace settings">
        <section class="panel">
          <div class="panel-header"><h2>Settings</h2><button class="btn" data-action="save-local">Save</button></div>
          <div class="panel-scroll">
            <div class="settings-card">
              <h3>AI connection</h3>
              <div class="warning-box">
                Pour des raisons de confidentialite, l'usage de l'IA et le fournisseur utilise doivent etre explicitement approuves par l'organisation concernee.
                <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-weight:800;">
                  <input type="checkbox" data-bind-settings="confidentiality_acknowledged" ${s.confidentiality_acknowledged ? "checked" : ""}> Je dispose d'une validation ecrite
                </label>
              </div>
              <label class="field">AI provider
                <select data-bind-settings="ai_provider">
                  <option value="anthropic" ${s.ai_provider === "anthropic" ? "selected" : ""}>Anthropic</option>
                  <option value="openai" ${s.ai_provider === "openai" ? "selected" : ""}>OpenAI</option>
                  <option value="azure_openai" ${s.ai_provider === "azure_openai" ? "selected" : ""}>Azure OpenAI</option>
                  <option value="google_gemini" ${s.ai_provider === "google_gemini" ? "selected" : ""}>Google Gemini</option>
                  <option value="mistral" ${s.ai_provider === "mistral" ? "selected" : ""}>Mistral</option>
                </select>
              </label>
              ${isAzure ? `
                <label class="field">Azure endpoint<input type="url" data-bind-settings="azure_endpoint" value="${escapeAttr(s.azure_endpoint)}" placeholder="https://resource.openai.azure.com/"></label>
                <label class="field">Deployment name<input data-bind-settings="azure_deployment" value="${escapeAttr(s.azure_deployment)}" placeholder="gpt-4o"></label>
                <label class="field">Azure API key<input type="password" data-bind-settings="azure_api_key" value="${escapeAttr(s.azure_api_key)}"></label>
              ` : `
                <label class="field">Model
                  <div class="btn-row" style="flex-wrap:nowrap;">
                    <select data-bind-settings="ai_model">${models.map((model) => `<option value="${escapeAttr(model)}" ${s.ai_model === model ? "selected" : ""}>${escapeHtml(model)}</option>`).join("")}</select>
                    <button class="btn" data-action="refresh-models" ${state.aiCatalog.status === "loading" ? "disabled" : ""}>Refresh</button>
                  </div>
                  <span class="helper">${escapeHtml(catalogMsg)}</span>
                </label>
                <label class="field">API key<input type="password" data-bind-settings="ai_api_key" value="${escapeAttr(s.ai_api_key)}" placeholder="Provider API key"></label>
              `}
              <div class="btn-row">
                <button class="btn primary" data-action="test-connection" ${state.connectionTest.status === "testing" ? "disabled" : ""}>${state.connectionTest.status === "testing" ? '<span class="spinner"></span>' : ""}Test connection</button>
                <button class="btn" data-action="save-local">Save locally</button>
              </div>
              ${state.connectionTest.status !== "idle" ? `<div class="status-box ${state.connectionTest.status}"><strong>${escapeHtml(state.connectionTest.status)}</strong><br>${escapeHtml(state.connectionTest.message)}</div>` : ""}
            </div>
          </div>
        </section>
        <section class="stage-panel">
          <div class="stage-toolbar"><strong>Current setup</strong></div>
          <div class="panel-scroll">
            <div class="settings-card">
              <h3>${escapeHtml(providerSummary())}</h3>
              <p class="helper">Les cles API sont stockees dans sessionStorage et ne sont pas exportees dans les fichiers HTML ou PPTX.</p>
            </div>
            <div class="settings-card">
              <h3>Standalone mode</h3>
              <p class="helper">Le projet peut etre ouvert localement depuis <code>index.html</code>. Les appels IA necessitent Internet et un fournisseur autorisant les appels depuis le navigateur.</p>
            </div>
          </div>
        </section>
      </main>
    `;
  }

  function normalizeColor(value) {
    const v = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    return "#000000";
  }

  function updateElementPatch(patch) {
    const slide = currentSlide();
    if (!slide) return;
    slide.elements.forEach((element) => {
      if (state.selectedIds.includes(element.id)) Object.assign(element, patch);
    });
    saveLocal();
    render();
  }

  function addElement(type) {
    const slide = currentSlide();
    if (!slide) return;
    let element;
    if (type === "image") {
      const url = prompt("Image URL");
      if (!url) return;
      element = createElement("image", { url, x: 120, y: 110, w: 360, h: 210, fill: "transparent", stroke: "transparent" });
    } else if (type === "rect") {
      element = createElement("rect", { fill: "#451dc7", stroke: "transparent" });
    } else if (type === "ellipse") {
      element = createElement("ellipse", { fill: "#04f06a", stroke: "transparent", radius: "50%" });
    } else if (type === "line") {
      element = createElement("line", { stroke: "#451dc7", fill: "#451dc7", h: 4 });
    } else {
      element = createElement("text");
    }
    slide.elements.push(element);
    state.selectedIds = [element.id];
    saveLocal();
    render();
  }

  function deleteSelected() {
    const slide = currentSlide();
    if (!slide || !state.selectedIds.length) return;
    slide.elements = slide.elements.filter((el) => !state.selectedIds.includes(el.id));
    state.selectedIds = [];
    saveLocal();
    render();
  }

  function duplicateSelected() {
    const slide = currentSlide();
    if (!slide || !state.selectedIds.length) return;
    const copies = slide.elements.filter((el) => state.selectedIds.includes(el.id)).map((el) => ({ ...JSON.parse(JSON.stringify(el)), id: uid("el"), x: el.x + 24, y: el.y + 24, z: Date.now() + Math.random() }));
    slide.elements.push(...copies);
    state.selectedIds = copies.map((el) => el.id);
    saveLocal();
    render();
  }

  function addSlide() {
    const slide = makeSlide(state.currentTemplate);
    const index = Math.max(0, state.deck.slides.findIndex((s) => s.id === state.currentSlideId));
    state.deck.slides.splice(index + 1, 0, slide);
    state.currentSlideId = slide.id;
    state.selectedIds = [];
    saveLocal();
    render();
  }

  function deleteSlide() {
    if (state.deck.slides.length <= 1) return;
    const index = state.deck.slides.findIndex((s) => s.id === state.currentSlideId);
    state.deck.slides.splice(index, 1);
    state.currentSlideId = state.deck.slides[Math.max(0, index - 1)].id;
    state.selectedIds = [];
    saveLocal();
    render();
  }

  function moveSlide(delta) {
    const index = state.deck.slides.findIndex((s) => s.id === state.currentSlideId);
    const next = clamp(index + delta, 0, state.deck.slides.length - 1);
    if (state.deck.slides[next]) {
      state.currentSlideId = state.deck.slides[next].id;
      state.selectedIds = [];
      render();
    }
  }

  function bindEvents() {
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "tab") {
        state.activeTab = button.dataset.tab;
        if (state.activeTab === "settings") fetchProviderModels(false);
        render();
      } else if (action === "create-deck") await generateDeck();
      else if (action === "generate-brand") await generateBrandCss();
      else if (action === "load-css") document.getElementById("css-file-input")?.click();
      else if (action === "clear-css") { state.create.customCss = ""; state.create.customCssName = ""; saveLocal(); render(); }
      else if (action === "prev-slide") moveSlide(-1);
      else if (action === "next-slide") moveSlide(1);
      else if (action === "select-slide") { state.currentSlideId = button.dataset.slideId; state.selectedIds = []; render(); }
      else if (action === "add-text") addElement("text");
      else if (action === "add-rect") addElement("rect");
      else if (action === "add-ellipse") addElement("ellipse");
      else if (action === "add-line") addElement("line");
      else if (action === "add-image") addElement("image");
      else if (action === "delete-selected") deleteSelected();
      else if (action === "duplicate-selected") duplicateSelected();
      else if (action === "add-slide") addSlide();
      else if (action === "delete-slide") deleteSlide();
      else if (action === "choose-template") { state.currentTemplate = button.dataset.template; render(); }
      else if (action === "toggle-bold") updateElementPatch({ fontWeight: Number(currentElements()[0]?.fontWeight) >= 700 ? 500 : 800 });
      else if (action === "toggle-italic") updateElementPatch({ fontStyle: currentElements()[0]?.fontStyle === "italic" ? "normal" : "italic" });
      else if (action === "align-left") alignSelected("x");
      else if (action === "align-top") alignSelected("y");
      else if (action === "bring-forward") updateElementPatch({ z: Date.now() });
      else if (action === "send-backward") updateElementPatch({ z: 1 });
      else if (action === "refresh-models") await fetchProviderModels(true);
      else if (action === "test-connection") await testConnection();
      else if (action === "save-local") { saveLocal(); toast("Sauvegarde locale effectuee.", "success"); }
      else if (action === "export-html") exportHtml();
      else if (action === "export-pptx") await exportPptx();
    });

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (target.matches("[data-bind-create]")) {
        const key = target.dataset.bindCreate;
        state.create[key] = key === "slideCount" ? clamp(target.value, 1, 40) : target.value;
        saveLocal();
      } else if (target.matches("[data-bind-settings]")) {
        const key = target.dataset.bindSettings;
        state.settings[key] = target.type === "checkbox" ? target.checked : target.value;
        if (key === "ai_provider") {
          state.settings.ai_model = (DEFAULT_MODELS[state.settings.ai_provider] || [])[0] || "";
          state.aiCatalog = { provider: "", status: "idle", models: [], error: "", requestId: 0 };
        }
        normalizeSettings();
        persistProviderSettings();
        render();
      } else if (target.matches("[data-bind-slide]")) {
        const slide = currentSlide();
        if (!slide) return;
        slide[target.dataset.bindSlide] = target.value;
        saveLocal();
      } else if (target.matches("[data-bind-el]")) {
        const key = target.dataset.bindEl;
        const numeric = ["x", "y", "w", "h", "fontSize"].includes(key);
        updateElementPatch({ [key]: numeric ? Number(target.value) : target.value });
      } else if (target.matches("[data-bind-export]")) {
        state.export[target.dataset.bindExport] = Number(target.value);
      } else if (target.matches("[contenteditable][data-element-id]")) {
        const slide = currentSlide();
        const element = slide?.elements.find((el) => el.id === target.dataset.elementId);
        if (element) {
          element.text = target.textContent || "";
          saveLocal();
        }
      }
    });

    document.addEventListener("change", async (event) => {
      if (event.target.id === "css-file-input" && event.target.files?.[0]) {
        const file = event.target.files[0];
        state.create.customCss = await file.text();
        state.create.customCssName = file.name;
        saveLocal();
        render();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      const resize = event.target.closest("[data-resize]");
      const elementNode = event.target.closest("[data-element-id]");
      const canvas = event.target.closest("[data-slide-canvas]");
      if (!canvas || (!resize && !elementNode)) return;
      if (event.target.isContentEditable && !resize) return;
      const id = resize ? resize.dataset.resize : elementNode.dataset.elementId;
      const slide = currentSlide();
      const element = slide?.elements.find((el) => el.id === id);
      if (!element) return;
      event.preventDefault();
      if (!state.selectedIds.includes(id)) {
        state.selectedIds = event.shiftKey ? [...state.selectedIds, id] : [id];
        render();
      }
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / BASE_W;
      state.drag = {
        mode: resize ? "resize" : "move",
        id,
        startX: event.clientX,
        startY: event.clientY,
        scale,
        originals: currentElements().map((el) => ({ id: el.id, x: el.x, y: el.y, w: el.w, h: el.h }))
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stopDrag, { once: true });
    });

    document.addEventListener("keydown", (event) => {
      if (event.target.matches("input, textarea, [contenteditable]")) return;
      if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); }
      if (event.key === "ArrowLeft") moveSlide(-1);
      if (event.key === "ArrowRight") moveSlide(1);
    });
  }

  function onPointerMove(event) {
    const drag = state.drag;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / drag.scale;
    const dy = (event.clientY - drag.startY) / drag.scale;
    const slide = currentSlide();
    drag.originals.forEach((original) => {
      const element = slide.elements.find((el) => el.id === original.id);
      if (!element) return;
      if (drag.mode === "resize" && original.id === drag.id) {
        element.w = clamp(original.w + dx, 12, BASE_W);
        element.h = clamp(original.h + dy, 4, BASE_H);
      } else if (drag.mode === "move") {
        element.x = clamp(original.x + dx, -BASE_W, BASE_W);
        element.y = clamp(original.y + dy, -BASE_H, BASE_H);
      }
    });
    const canvas = document.querySelector("[data-slide-canvas]");
    if (canvas && slide) canvas.innerHTML = renderSlideHtml(slide, { editable: true });
  }

  function stopDrag() {
    window.removeEventListener("pointermove", onPointerMove);
    state.drag = null;
    saveLocal();
    render();
  }

  function alignSelected(axis) {
    const selected = currentElements();
    if (selected.length < 2) return;
    const value = Math.min(...selected.map((el) => el[axis]));
    selected.forEach((el) => { el[axis] = value; });
    saveLocal();
    render();
  }

  async function exportPptx() {
    if (!window.PptxGenJS || !window.html2canvas) {
      toast("Bibliotheques PptxGenJS ou html2canvas manquantes.", "error");
      return;
    }
    state.export.log.push("Construction du PPTX editable...");
    render();
    try {
      const stage = document.createElement("div");
      stage.className = "export-stage";
      document.body.appendChild(stage);

      const pptx = new PptxGenJS();
      pptx.defineLayout({ name: "MS_16_9", width: 10, height: 5.625 });
      pptx.layout = "MS_16_9";
      pptx.author = "MagicSlider";
      pptx.company = "Wavestone";
      pptx.subject = "AI-generated editable HTML slides";
      pptx.title = state.deck.title || "MagicSlider deck";

      for (let i = 0; i < state.deck.slides.length; i += 1) {
        const slide = state.deck.slides[i];
        stage.innerHTML = `<style>${getStyleCss()}</style><div class="export-slide" style="width:${BASE_W}px;height:${BASE_H}px;">${renderSlideExport(slide, BASE_W)}</div>`;
        await waitForImages(stage);
        const pptSlide = pptx.addSlide();
        pptSlide.background = { color: hexForPpt(slide.background || "#ffffff") };
        await exportSlideObjectsToPptx(slide, pptSlide, stage, pptx.ShapeType || {});
        state.export.log.push(`Slide ${i + 1}/${state.deck.slides.length} reconstruite.`);
      }
      stage.remove();
      await pptx.writeFile({ fileName: `${slug(state.deck.title)}.pptx` });
      state.export.log.push("PPTX exporte.");
      toast("PPTX exporte.", "success");
    } catch (error) {
      state.export.log.push(`Erreur export PPTX: ${error.message}`);
      toast(`Export PPTX impossible: ${error.message}`, "error");
    }
    render();
  }

  async function exportSlideObjectsToPptx(slide, pptSlide, stage, shapeType) {
    const imageNodes = new Map([...stage.querySelectorAll("[data-export-image-id]")].map((node) => [node.dataset.exportImageId, node]));
    const sorted = [...slide.elements].sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const element of sorted) {
      const box = pptBox(element);
      if (element.type === "text") {
        pptSlide.addText(element.text || "", {
          ...box,
          fontFace: cleanFont(element.fontFamily),
          fontSize: pxToPt(element.fontSize || 24),
          color: hexForPpt(element.color || "#171321"),
          bold: Number(element.fontWeight || 400) >= 700,
          italic: element.fontStyle === "italic",
          margin: 0.04,
          breakLine: false,
          fit: "shrink",
          valign: "top",
          rotate: element.rotate || 0
        });
      } else if (element.type === "image") {
        const node = imageNodes.get(element.id);
        let dataUrl = null;
        if (node) {
          const canvas = await html2canvas(node, {
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            scale: state.export.quality,
            logging: false
          });
          dataUrl = canvas.toDataURL("image/png");
        }
        if (dataUrl) {
          pptSlide.addImage({ data: dataUrl, ...box, rotate: element.rotate || 0 });
        } else {
          pptSlide.addShape(pptxShape("rect", shapeType), { ...box, fill: { color: "F1EEFB" }, line: { color: "CFCCDC", width: 1 } });
          pptSlide.addText("Image unavailable", { ...box, fontSize: 10, color: "6B6580", align: "center", valign: "mid", margin: 0 });
        }
      } else if (element.type === "line") {
        pptSlide.addShape(pptxShape("rect", shapeType), {
          x: box.x,
          y: box.y,
          w: box.w,
          h: Math.max(0.02, (element.strokeWidth || 3) / 96),
          fill: { color: hexForPpt(element.stroke || element.fill || "#171321") },
          line: { type: "none" },
          rotate: element.rotate || 0
        });
      } else {
        pptSlide.addShape(pptxShape(element.type === "ellipse" ? "ellipse" : "rect", shapeType), {
          ...box,
          fill: pptFill(element.fill),
          line: pptLine(element.stroke, element.strokeWidth),
          rotate: element.rotate || 0
        });
      }
    }
  }

  function renderSlideExport(slide, width = 1280) {
    const scale = width / BASE_W;
    return `<div class="slide-inner ms-slide" style="background:${escapeAttr(slide.background || "#fff")};">${slide.elements.map((element) => {
      const style = elementStyle(element, scale);
      if (element.type === "text") return `<div class="slide-element text" style="${escapeAttr(style)}">${escapeHtml(element.text || "")}</div>`;
      if (element.type === "image") return `<div class="slide-element image" data-export-image-id="${escapeAttr(element.id)}" style="${escapeAttr(style)}"><img src="${escapeAttr(element.url || "")}" crossorigin="anonymous" alt=""></div>`;
      return `<div class="slide-element ${element.type}" style="${escapeAttr(style)}"></div>`;
    }).join("")}</div>`;
  }

  function pptxShape(kind, shapeType = {}) {
    if (kind === "ellipse") return shapeType.ellipse || shapeType.arc || "ellipse";
    return shapeType.rect || "rect";
  }

  function pptBox(element) {
    return {
      x: element.x / 96,
      y: element.y / 96,
      w: element.w / 96,
      h: Math.max(0.02, element.h / 96)
    };
  }

  function pxToPt(px) {
    return Math.max(4, Math.round(Number(px || 16) * 0.75));
  }

  function cleanFont(fontFamily) {
    return String(fontFamily || "Inter").split(",")[0].replace(/["']/g, "").trim() || "Inter";
  }

  function hexForPpt(color) {
    const hex = normalizeColor(color);
    return hex.replace("#", "").toUpperCase();
  }

  function pptFill(color) {
    if (!color || color === "transparent") return { type: "none" };
    return { color: hexForPpt(color), transparency: 0 };
  }

  function pptLine(color, width) {
    if (!color || color === "transparent" || Number(width || 0) <= 0) return { type: "none" };
    return { color: hexForPpt(color), width: Math.max(0.25, Number(width || 1)) };
  }

  function waitForImages(root) {
    const images = [...root.querySelectorAll("img")];
    return Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 3000);
    })));
  }

  function exportHtml() {
    const css = `${getStyleCss()}\n${document.querySelector('link[href="css/main.css"]') ? "" : ""}`;
    const slides = state.deck.slides.map((slide) => `<section class="deck-slide">${renderSlideExport(slide, BASE_W)}</section>`).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(state.deck.title)}</title><style>
      html,body{height:100%;margin:0;background:#111827;color:#fff;font-family:Inter,Arial,sans-serif;overflow:hidden;display:grid;place-items:center}.deck{position:relative;width:${BASE_W}px;height:${BASE_H}px;transform-origin:center center;box-shadow:0 34px 90px rgba(0,0,0,.5)}.deck-slide{display:none;position:absolute;inset:0;width:${BASE_W}px;height:${BASE_H}px;overflow:hidden;background:#fff}.deck-slide.active{display:block}.slide-inner,.export-slide{position:absolute;inset:0}.slide-element{position:absolute;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word}.slide-element.image img{width:100%;height:100%;object-fit:cover;display:block}.nav{position:fixed;left:16px;bottom:14px;background:rgba(0,0,0,.55);padding:7px 10px;border-radius:6px;font-size:12px}
      ${css}
    </style></head><body><main class="deck" id="stage">${slides}</main><div class="nav"><span id="idx">1</span> / ${state.deck.slides.length} - arrows / space</div><script>
      const stage=document.getElementById('stage');const slides=[...document.querySelectorAll('.deck-slide')];let i=0;function fit(){stage.style.transform='scale('+Math.min(innerWidth/${BASE_W},innerHeight/${BASE_H})+')'}function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach((s,k)=>s.classList.toggle('active',k===i));document.getElementById('idx').textContent=i+1;}document.addEventListener('keydown',e=>{if(['ArrowRight',' ','PageDown'].includes(e.key))show(i+1);if(['ArrowLeft','PageUp'].includes(e.key))show(i-1);});addEventListener('resize',fit);fit();show(0);
    </script></body></html>`;
    download(`${slug(state.deck.title)}.html`, new Blob([html], { type: "text/html;charset=utf-8" }));
    state.export.log.push("HTML autonome exporte.");
    toast("HTML exporte.", "success");
    render();
  }

  function slug(value) {
    return String(value || "magicslider").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "magicslider";
  }

  loadLocal();
  seedDeckIfNeeded();
  bindEvents();
  render();
})();
