(() => {
  "use strict";

  const STORAGE_KEY = "magicslider_html_autosave_v1";
  const LEGACY_STORAGE_KEY = "magicslider_autosave_v1";
  const SETTINGS_KEY = "magicslider_settings_v1";
  const SECRET_KEY = "magicslider_api_key";
  const AZURE_SECRET_KEY = "magicslider_azure_api_key";

  let htmlEditTimer = null;

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
      notes: "Deep indigo, acid green accents, strong white space, square geometry, Poppins/Inter typography, board-level executive polish.",
      guidance: []
    },
    wavestone2: {
      label: "Wavestone2",
      notes: "Reference-deck style extracted from the root PPTX: compact cyber-consulting layouts, full-bleed theme-adapted photography with indigo overlays, acid-green rules, tiny uppercase chapter chrome, large ghost numerals, and dense but disciplined executive cards.",
      guidance: [
        "Typography should feel closer to the PPTX than the default style: use Carlito or Calibri-like sans for main copy, Arial Narrow/Liberation Sans Narrow for oversized numerals, counters and metadata, with micro labels around 14px, body around 15-18px, titles around 38-56px, and chapter titles around 72-96px.",
        "Use the PPTX palette exactly and repeatedly: white #FFFFFF, deep ink #16121F, muted copy #6B6580 and #817C95, pale lavender #F1EEFB, border #E6E4EE, Wavestone indigo #451DC7, darker indigo #2D1380, acid green #04F06A, success green #088A42, teal #228D95, warning #C8861A, and critical red #D8412F.",
        "Compose slides with 56-72px margins, thin acid-green horizontal rules, small uppercase eyebrow bars, footer/page chrome, and huge translucent section numbers placed off-canvas or in corners as background structure.",
        "Use card blocks like the PPTX: compact rounded rectangles with 6-8px radius, thin #E6E4EE borders, colored left rails for severity, tiny badges, small glyph icons, and tight business-deck spacing. Do not make oversized app-style cards.",
        "Alternate layouts from the source deck: full-bleed cover photo with left indigo gradient overlay, 2x2 agenda grid, full-bleed chapter divider, dated timeline, split impact/lesson slide, incident case cards, 3x2 attack-surface matrix, and dense actor/mitigation matrix.",
        "For photos, favor real, topic-specific imagery adapted to the presentation theme: industry, people, places, products, environments or evidence that directly support the brief. Apply dark indigo or black-to-transparent overlays so text sits on the left while the image remains inspectable on the right.",
        "Use Wavestone2 as a concise board briefing style: information-dense, analytical, cyber-specific and source-like, avoiding generic neon cyber dashboards, decorative blobs, and loose marketing-page composition."
      ]
    },
    darkcyber: {
      label: "Dark Cyber",
      notes: "Dark cyber command-center feel, indigo/black backgrounds, neon green and cyan accents, threat maps, executive readability.",
      guidance: []
    }
  };

  const state = {
    activeTab: "create",
    aiCatalog: { provider: "", status: "idle", models: [], error: "", requestId: 0 },
    connectionTest: { status: "idle", message: "", checkedAt: null },
    create: {
      brief: "",
      slideCount: 10,
      style: "wavestone",
      powerPointCompatible: false,
      customCss: "",
      customCssName: "",
      brandPrompt: "",
      loading: false,
      styleLoading: false,
      log: []
    },
    export: { log: [] },
    settings: defaultSettings(),
    deck: {
      title: "MagicSlider HTML deck",
      html: ""
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

  function slug(value) {
    return String(value || "magicslider").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "magicslider";
  }

  function saveLocal() {
    const clean = {
      deck: state.deck,
      create: { ...state.create, loading: false, styleLoading: false },
      settings: { ...state.settings, ai_api_key: "", azure_api_key: "" }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    persistProviderSettings();
  }

  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.deck?.html) {
        state.deck = { title: saved.deck.title || extractHtmlTitle(saved.deck.html), html: saved.deck.html };
      } else {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
        if (legacy?.deck?.html) state.deck = { title: legacy.deck.title || extractHtmlTitle(legacy.deck.html), html: legacy.deck.html };
      }
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

  function isAIReady() {
    const s = state.settings;
    if (!s.confidentiality_acknowledged) return false;
    if (s.ai_provider === "azure_openai") return Boolean(s.azure_endpoint && s.azure_api_key && s.azure_deployment);
    return Boolean(s.ai_api_key && s.ai_model);
  }

  function providerSummary() {
    const s = state.settings;
    if (s.ai_provider === "azure_openai") return `Azure OpenAI / ${s.azure_deployment || "deployment not set"}`;
    const labels = { anthropic: "Anthropic", openai: "OpenAI", google_gemini: "Google Gemini", mistral: "Mistral" };
    return `${labels[s.ai_provider] || s.ai_provider} / ${s.ai_model || "model not set"}`;
  }

  function availableModels() {
    const provider = state.settings.ai_provider;
    const fallback = DEFAULT_MODELS[provider] || [];
    const dynamic = state.aiCatalog.provider === provider && state.aiCatalog.models.length ? state.aiCatalog.models : fallback;
    return [...new Set([state.settings.ai_model, ...dynamic].filter(Boolean))];
  }

  function extractHtmlTitle(html) {
    const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return "MagicSlider HTML deck";
    const node = document.createElement("textarea");
    node.innerHTML = match[1].trim();
    return node.value || "MagicSlider HTML deck";
  }

  function cleanGeneratedHtml(text) {
    const raw = String(text || "").trim();
    const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
    const html = (fenced ? fenced[1] : raw).trim();
    const docStart = html.search(/<!doctype html|<html\b/i);
    const cleaned = docStart > 0 ? html.slice(docStart).trim() : html;
    if (!/<html\b/i.test(cleaned) || !/<\/html>/i.test(cleaned)) {
      throw new Error("The model did not return a complete HTML document.");
    }
    return cleaned;
  }

  function deckSlideCount() {
    const html = state.deck.html || "";
    return Math.max(0, (html.match(/<section\b[^>]*class=["'][^"']*\bslide\b/gi) || html.match(/<section\b/gi) || []).length);
  }

  function htmlDeckPreview(html = state.deck.html) {
    const content = String(html || "").trim();
    if (!content) return '<div class="html-empty">No HTML deck generated yet.</div>';
    return `<iframe class="html-preview-frame" title="HTML deck preview" sandbox="allow-scripts allow-same-origin allow-popups" srcdoc="${escapeAttr(content)}"></iframe>`;
  }

  function scheduleHtmlPreviewSave() {
    clearTimeout(htmlEditTimer);
    htmlEditTimer = setTimeout(() => {
      const frame = document.querySelector(".html-preview-frame");
      if (frame) frame.srcdoc = state.deck.html;
      saveLocal();
    }, 450);
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

  async function llmComplete(userPrompt, maxTokens = 4000) {
    const s = state.settings;
    if (!isAIReady()) throw new Error("Configuration IA incomplete ou validation de confidentialite manquante.");
    if (s.ai_provider === "azure_openai") {
      const endpoint = s.azure_endpoint.replace(/\/+$/, "");
      const response = await fetch(`${endpoint}/openai/deployments/${encodeURIComponent(s.azure_deployment)}/chat/completions?api-version=2024-02-01`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": s.azure_api_key },
        body: JSON.stringify({ messages: [{ role: "user", content: userPrompt }], max_tokens: maxTokens })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Azure OpenAI HTTP ${response.status}`);
      return data.choices?.[0]?.message?.content || "";
    }
    if (s.ai_provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": s.ai_api_key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: s.ai_model, max_tokens: maxTokens, messages: [{ role: "user", content: userPrompt }] })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Anthropic HTTP ${response.status}`);
      return data.content?.[0]?.text || "";
    }
    if (s.ai_provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.ai_api_key}` },
        body: JSON.stringify({ model: s.ai_model, messages: [{ role: "user", content: userPrompt }], max_tokens: maxTokens })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `OpenAI HTTP ${response.status}`);
      return data.choices?.[0]?.message?.content || "";
    }
    if (s.ai_provider === "mistral") {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.ai_api_key}` },
        body: JSON.stringify({ model: s.ai_model, messages: [{ role: "user", content: userPrompt }], max_tokens: maxTokens })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Mistral HTTP ${response.status}`);
      return data.choices?.[0]?.message?.content || "";
    }
    if (s.ai_provider === "google_gemini") {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.ai_model)}:generateContent?key=${encodeURIComponent(s.ai_api_key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: userPrompt }] }], generationConfig: { maxOutputTokens: maxTokens } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Google Gemini HTTP ${response.status}`);
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
    throw new Error(`Unsupported provider: ${s.ai_provider}`);
  }

  async function testConnection() {
    state.connectionTest = { status: "testing", message: "Test en cours...", checkedAt: null };
    render();
    try {
      const result = await llmComplete('Reply with exactly: OK', 32);
      if (!String(result).toUpperCase().includes("OK")) throw new Error("Unexpected test response");
      state.connectionTest = { status: "success", message: "Connexion confirmee.", checkedAt: new Date().toISOString() };
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

  function designSystemPrompt() {
    const preset = STYLE_PRESETS[state.create.style] || STYLE_PRESETS.wavestone;
    const presetGuidance = Array.isArray(preset.guidance) && preset.guidance.length
      ? `\n- ${preset.guidance.join("\n- ")}`
      : "";
    const typographyGuidance = state.create.powerPointCompatible
      ? "Aptos/Calibri/Arial typography with strong Wavestone hierarchy and executive polish"
      : "Poppins/Inter typography";
    return `Design system to embed in the HTML:
- Follow the reference deck at https://gbillois.github.io/HowToWavestone/CTI.html: complete standalone HTML file, fixed 16:9 stage, rich CSS in <style>, slides as <section class="slide"> inside #stage, navigation/progress script in the file.
- Native slide size: 1280 x 720 px. Scale #stage to fit the viewport with JavaScript.
- Use the Wavestone design system at the root of the HowToWavestone repo: deep indigo, acid green, teal, ink neutrals, square geometry, ${typographyGuidance}, high-end consulting deck polish.
- Use these Wavestone root tokens directly in <style>: --ws-indigo-50:#F1EEFB; --ws-indigo-100:#D1CAF2; --ws-indigo-600:#451DC7; --ws-indigo-700:#36169B; --ws-indigo-800:#2D1380; --ws-indigo-900:#1E0D57; --ws-green-50:#E1FDED; --ws-green-300:#5CF59E; --ws-green-400:#04F06A; --ws-green-700:#088A42; --ws-teal-500:#228D95; --ws-danger:#D8412F; --ws-warning:#C8861A; --ws-ink-50:#F5F4F9; --ws-ink-100:#E6E4EE; --ws-ink-200:#CFCCDC; --ws-ink-500:#6B6580; --ws-ink-900:#16121F; --ws-white:#FFFFFF.
- Selected style: ${preset.label}. ${preset.notes}${presetGuidance}
- Custom CSS or visual constraints from the user: ${state.create.customCss || "None"}.
- Use cinematic HTML composition: CSS grid, flex layouts, badges, timelines, cards, stats, SVG accents, remote photos, icons, dark/bright alternation, and subtle build fragments when useful.
- Keep it directly editable as HTML: meaningful class names, semantic slide content, no external build step, no structured data output.`;
  }

  function powerpointCompatibilityPrompt() {
    if (!state.create.powerPointCompatible) return "";
    return `
PowerPoint-compatible generation mode is ON.
Optimize the HTML so it can be converted into a clean, editable PowerPoint deck while still looking premium and executive-level:
- Use only PowerPoint-safe fonts: Aptos, Calibri, Arial, Arial Narrow, Segoe UI, Georgia, Times New Roman, Trebuchet MS, Verdana. Prefer Aptos/Calibri/Arial for consulting slides. Do not use Google Fonts, @import, @font-face, Poppins, Inter, custom web fonts or niche fonts.
- This compatibility profile overrides any selected style preset or custom CSS that asks for web fonts, gradients or conversion-hostile effects. Reinterpret those requests into solid fills, safe fonts and simple editable shapes.
- Do not use CSS gradients anywhere: no linear-gradient, radial-gradient, conic-gradient, gradient overlays, gradient text or gradient borders. Use layered solid-color rectangles, translucent blocks, photo crops and crisp accent rules instead.
- Avoid conversion-hostile CSS: no backdrop-filter, mix-blend-mode, clip-path, mask, CSS filters, complex shadows, animated effects, video, canvas, 3D transforms or CSS-only decorative pseudo-elements.
- Keep shapes PowerPoint-like: solid fills, simple borders, straight rules, rectangles, circles, pills, tables, timelines, callout bands, icon rows and clean data cards.
- Use images as actual <img> elements with stable HTTPS URLs. If text sits on images, place a solid semi-transparent rectangle behind it rather than a gradient overlay.
- Keep every title, label, number and bullet as live HTML text, not embedded in SVG or images. SVG icons and simple geometric SVG diagrams are allowed, but avoid putting core text inside SVG.
- Maintain a high-end visual standard through layout, hierarchy, spacing, photography, restrained color contrast and editorial composition instead of effects that PowerPoint cannot reproduce.`;
  }

  function generationPrompt() {
    return `Create the most visually polished executive slide deck possible from this brief.

Brief:
${state.create.brief}

Required output:
- Return one complete standalone HTML document only.
- Do not return structured data.
- Do not wrap the answer in markdown fences.
- Generate exactly ${state.create.slideCount} HTML slides.
- The deck will be edited and saved as HTML, so every slide must be real HTML content.

${designSystemPrompt()}
${powerpointCompatibilityPrompt()}

Find and select photos by yourself during the deck-building phase, based on the exact presentation theme and slide content. Pick high-quality, topic-specific, inspectable images with direct HTTPS URLs. Prefer reputable open image sources such as Unsplash, Wikimedia Commons, official company/media pages or other stable public URLs. Do not rely on a fixed fallback image library.

HTML requirements:
- Include <!DOCTYPE html>, <html>, <head>, <style>, <body>, #stage and <script>.
- Each slide must be a <section class="slide"> and the first slide must also have class "active".
- Include keyboard navigation like PowerPoint: arrows, space, Home/End, visible slide counter, progress indicator, viewport scaling.
${state.create.powerPointCompatible ? "- Embed all CSS and JavaScript in the file. Remote images are allowed, but do not load external fonts." : "- Embed all CSS and JavaScript in the file. External fonts and remote images are allowed."}
- Build it for later PPTX conversion: fixed 1280x720 slide geometry, no responsive reflow inside slides, print CSS with one slide per page.
- Include photos, icons, images or SVG visuals when useful. Do not produce generic bullet-only slides.
- Make the result feel at least as ambitious as https://gbillois.github.io/HowToWavestone/CTI.html.`;
  }

  async function generateDeck() {
    if (!state.create.brief.trim()) {
      toast("Ajoutez un brief avant de lancer la creation.", "error");
      return;
    }
    state.create.loading = true;
    addLog("User", state.create.brief);
    render();
    const prompt = generationPrompt();
    addLog("Prompt", prompt.slice(0, 1800) + "...");
    try {
      const html = cleanGeneratedHtml(await llmComplete(prompt, Math.min(32000, Math.max(12000, state.create.slideCount * 2600))));
      state.deck.title = extractHtmlTitle(html);
      state.deck.html = html;
      state.activeTab = "modify";
      addLog("Assistant", html.slice(0, 4000) + (html.length > 4000 ? "\n..." : ""));
      saveLocal();
      toast("Deck HTML cree. Vous pouvez le modifier.", "success");
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
      const css = await llmComplete(`Generate only CSS, no markdown, no explanation.
The CSS will be embedded in an HTML slide deck generated by MagicSlider.
Scope it to presentation HTML such as body, #stage, .slide, .card, .eyebrow, .head, .badge and descendants.
Use this brand description:
${state.create.brandPrompt}`, 2600);
      state.create.customCssName = "Generated CSS";
      state.create.customCss = css.replace(/```(?:css)?|```/gi, "").trim();
      addLog("Assistant", `Generated CSS theme:\n${state.create.customCss}`);
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

  function svgFolder() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>';
  }

  function svgPen() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
  }

  function svgSave() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
  }

  function svgGear() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
  }

  function tabButton(tab, label, icon) {
    return `<button class="tab ${state.activeTab === tab ? "active" : ""}" data-action="tab" data-tab="${tab}">${icon}<span>${escapeHtml(label)}</span></button>`;
  }

  function render() {
    const app = document.getElementById("app");
    app.innerHTML = `
      <header class="topbar">
        <div class="brand"><div class="brand-mark">MS</div><div><span class="brand-title">MagicSlider</span><span class="brand-sub">HTML slides studio</span></div></div>
        <nav class="tabbar" aria-label="Main navigation">
          ${tabButton("create", "Create", svgFolder())}
          ${tabButton("modify", "Modify", svgPen())}
          ${tabButton("export", "Export", svgSave())}
          ${tabButton("settings", "Settings", svgGear())}
        </nav>
        <div class="provider-pill"><span class="status-dot ${isAIReady() ? "ok" : "warn"}"></span>${escapeHtml(providerSummary())}</div>
      </header>
      ${state.activeTab === "create" ? renderCreateTab() : ""}
      ${state.activeTab === "modify" ? renderModifyTab() : ""}
      ${state.activeTab === "export" ? renderExportTab() : ""}
      ${state.activeTab === "settings" ? renderSettingsTab() : ""}
    `;
  }

  function renderCreateTab() {
    const styleOptions = Object.entries(STYLE_PRESETS).map(([value, preset]) =>
      `<option value="${escapeAttr(value)}" ${state.create.style === value ? "selected" : ""}>${escapeHtml(preset.label)}</option>`
    ).join("");
    return `
      <main class="workspace">
        <section class="panel">
          <div class="panel-header"><h2>Create</h2><span class="slide-count">${deckSlideCount()} slides</span></div>
          <div class="panel-scroll">
            <label class="field">Brief de presentation
              <textarea data-bind-create="brief" placeholder="Ex: Create a cyber threat landscape presentation for the automobile sector...">${escapeHtml(state.create.brief)}</textarea>
            </label>
            <label class="field">Style graphique
              <select data-bind-create="style">
                ${styleOptions}
              </select>
            </label>
            <label class="compat-option">
              <input type="checkbox" data-bind-create="powerPointCompatible" ${state.create.powerPointCompatible ? "checked" : ""}>
              <span><strong>PowerPoint compatible</strong><small>Generation sans gradients, fontes web/exotiques ni effets CSS difficiles a convertir, avec une direction artistique premium.</small></span>
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
            <button class="btn primary full" data-action="create-deck" ${state.create.loading || !isAIReady() ? "disabled" : ""}>${state.create.loading ? '<span class="spinner"></span>' : ""}Create HTML</button>
            <p class="helper">${isAIReady() ? "La generation demande au modele un fichier HTML complet, pas une structure intermediaire." : "Configurez et validez l'IA dans Settings pour activer la generation."}</p>
            <div class="llm-log">${state.create.log.length ? state.create.log.map((entry) => `<div class="log-entry"><span class="log-role ${entry.error ? "error" : ""}">${escapeHtml(entry.role)} - ${escapeHtml(entry.at)}</span>${escapeHtml(entry.message)}</div>`).join("") : '<div class="log-entry"><span class="log-role">System</span>Les echanges LLM apparaitront ici.</div>'}</div>
          </div>
        </section>
        <section class="stage-panel">
          <div class="stage-toolbar">
            <strong>${escapeHtml(state.deck.title)}</strong>
            <span class="slide-count">${deckSlideCount()} slides</span>
          </div>
          <div class="html-preview-wrap">${htmlDeckPreview()}</div>
        </section>
      </main>
    `;
  }

  function renderModifyTab() {
    return `
      <main class="workspace html-workspace">
        <section class="panel html-code-panel">
          <div class="panel-header">
            <h3>HTML</h3>
            <button class="btn" data-action="save-local">Save</button>
          </div>
          <textarea class="html-code-editor" data-bind-html spellcheck="false">${escapeHtml(state.deck.html || "")}</textarea>
        </section>
        <section class="stage-panel">
          <div class="stage-toolbar">
            <strong>${escapeHtml(state.deck.title)}</strong>
            <span class="slide-count">${deckSlideCount()} slides</span>
            <span class="spacer"></span>
            <button class="btn" data-action="export-html">Export HTML</button>
          </div>
          <div class="html-preview-wrap">${htmlDeckPreview()}</div>
        </section>
      </main>
    `;
  }

  function renderExportTab() {
    return `
      <main class="workspace export">
        <section class="panel">
          <div class="panel-header"><h2>Export</h2><span class="slide-count">${deckSlideCount()} slides</span></div>
          <div class="panel-scroll">
            <div class="export-card">
              <h3>HTML autonome</h3>
              <button class="btn primary full" data-action="export-html" ${state.deck.html.trim() ? "" : "disabled"}>Export HTML</button>
              <p class="helper">Telecharge le fichier HTML source exact, avec styles et navigation embarques.</p>
            </div>
            <div class="llm-log">${state.export.log.length ? state.export.log.map((line) => `<div class="log-entry">${escapeHtml(line)}</div>`).join("") : '<div class="log-entry">Les exports apparaitront ici.</div>'}</div>
          </div>
        </section>
        <section class="stage-panel">
          <div class="stage-toolbar"><strong>Preview export</strong></div>
          <div class="html-preview-wrap">${htmlDeckPreview()}</div>
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
              <p class="helper">Les cles API sont stockees dans sessionStorage et ne sont pas exportees dans les fichiers HTML.</p>
            </div>
            <div class="settings-card">
              <h3>HTML-only engine</h3>
              <p class="helper">MagicSlider genere, edite, sauvegarde et exporte directement un document HTML complet. Aucun moteur de slides par objets intermediaires n'est utilise.</p>
            </div>
          </div>
        </section>
      </main>
    `;
  }

  function exportHtml() {
    try {
      const html = cleanGeneratedHtml(state.deck.html);
      state.deck.title = extractHtmlTitle(html);
      download(`${slug(state.deck.title)}.html`, new Blob([html], { type: "text/html;charset=utf-8" }));
      state.export.log.push("HTML source exporte.");
      toast("HTML exporte.", "success");
      saveLocal();
      render();
    } catch (error) {
      state.export.log.push(`Erreur export HTML: ${error.message}`);
      toast(`HTML incomplet: ${error.message}`, "error");
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
      else if (action === "refresh-models") await fetchProviderModels(true);
      else if (action === "test-connection") await testConnection();
      else if (action === "save-local") { saveLocal(); toast("Sauvegarde locale effectuee.", "success"); }
      else if (action === "export-html") exportHtml();
    });

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (target.matches("[data-bind-create]")) {
        const key = target.dataset.bindCreate;
        state.create[key] = target.type === "checkbox" ? target.checked : key === "slideCount" ? clamp(target.value, 1, 40) : target.value;
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
      } else if (target.matches("[data-bind-html]")) {
        state.deck.html = target.value;
        state.deck.title = extractHtmlTitle(state.deck.html);
        scheduleHtmlPreviewSave();
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
  }

  function seedIfNeeded() {
    if (state.deck.html.trim()) return;
    state.deck.html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MagicSlider HTML deck</title>
<style>
html,body{height:100%;margin:0;background:#0c0820;color:#fff;font-family:Inter,Arial,sans-serif;overflow:hidden;display:grid;place-items:center}
#stage{width:1280px;height:720px;position:relative;transform-origin:center center;box-shadow:0 40px 120px rgba(0,0,0,.5)}
.slide{position:absolute;inset:0;background:#fff;color:#16121F;display:none;overflow:hidden;padding:72px}
.slide.active{display:block}
h1{font:800 64px/1.05 Poppins,Inter,sans-serif;color:#451DC7;margin:0}
p{font-size:24px;line-height:1.4;color:#6B6580;max-width:780px}
.accent{width:220px;height:18px;background:#04F06A;margin-top:42px}
.nav{position:fixed;left:16px;bottom:14px;background:rgba(0,0,0,.55);padding:7px 10px;font-size:12px}
</style>
</head>
<body>
<main id="stage">
<section class="slide active">
  <h1>MagicSlider</h1>
  <p>Generate, edit and export beautiful HTML slide decks directly.</p>
  <div class="accent"></div>
</section>
</main>
<div class="nav">1 / 1</div>
<script>
const stage=document.getElementById('stage');
function fit(){stage.style.transform='scale('+Math.min(innerWidth/1280,innerHeight/720)+')'}
addEventListener('resize',fit);fit();
</script>
</body>
</html>`;
  }

  loadLocal();
  seedIfNeeded();
  bindEvents();
  render();
})();
