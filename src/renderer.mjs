import { CreateWebWorkerMLCEngine } from "../node_modules/@mlc-ai/web-llm/lib/index.js";
import {
  addPracticeXp,
  completedPairs,
  defaultProfile,
  migrateProfile,
  profileSummary,
  recentActivity,
  recordLessonCompletion,
  resetProgress,
  setupProfile
} from "./utils/profile.mjs";
import {
  completionRatio,
  firstUnseen,
  flattenLessons,
  getLesson,
  unitProgress
} from "./utils/lessons.mjs";
import { wrapStageHtml } from "./utils/content.mjs";
import {
  buildExplainUserPrompt,
  buildSystemPrompt,
  explainPrompt,
  modeLabels
} from "./utils/prompts.mjs";
import {
  WEBLLM_CUSTOM_QWEN35_ID,
  buildWebLLMEngineConfig,
  getDefaultWebLLMModel,
  getWebLLMModelChoices,
  getWebLLMModelLabel,
  isCustomWebLLMModel
} from "./utils/inference.mjs";

const avatarMap = {
  tutor: "../assets/svg/tutor.svg",
  abacus: "../assets/svg/abacus.svg",
  calculator: "../assets/svg/calculator.svg",
  fraction: "../assets/svg/fraction.svg"
};

const iconMap = {
  numbers: "../assets/svg/numberline.svg",
  geometry: "../assets/svg/geometry.svg",
  fraction: "../assets/svg/fraction.svg",
  calculator: "../assets/svg/calculator.svg",
  abacus: "../assets/svg/abacus.svg"
};

const pageMeta = {
  lessons: {
    title: "Lecciones",
    subtitle: "Explora rutas visuales y navega por etapas dentro del lector."
  },
  practice: {
    title: "Estudio guiado",
    subtitle: "Practica con el runtime local activo y cambia el modo de respuesta."
  },
  profile: {
    title: "Perfil",
    subtitle: "Onboarding, progreso tipo ruta y actividad reciente."
  }
};

const WEBLLM_DEFAULT_MODEL = getDefaultWebLLMModel();
const WEBLLM_CHOICES = getWebLLMModelChoices();
const DEFAULT_SETTINGS = {
  inferenceProvider: "ollama",
  currentModel: "",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaModel: "",
  webllmModel: WEBLLM_DEFAULT_MODEL,
  webllmCustomModelId: WEBLLM_CUSTOM_QWEN35_ID,
  webllmCustomModelUrl: "",
  webllmCustomModelLibUrl: "",
  responseMode: "coach",
  theme: "light"
};

const state = {
  lessons: [],
  profile: migrateProfile(defaultProfile),
  settings: { ...DEFAULT_SETTINGS },
  availableModels: [],
  ollama: { ok: false, message: "Sin conexion con Ollama." },
  webllm: createWebLLMState(),
  page: "lessons",
  selectedUnit: null,
  currentLesson: null,
  stageIndex: 0,
  practiceMode: "coach",
  chatMessages: [],
  isThinking: false,
  explanation: { open: false, busy: false, cards: [] },
  settingsOpen: false,
  settingsDraft: null,
  profileDraft: migrateProfile(defaultProfile),
  onboardingStep: 0,
  selectedText: "",
  scrollTarget: null,
  loadingPanel: {
    open: true,
    title: "Preparando TutorMate",
    detail: "Un momento. Estoy acomodando tus lecciones y despertando el modelo."
  }
};

const root = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
let webllmRuntime = { engine: null, worker: null, signature: "" };

render();
await bootstrap();
document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("submit", handleSubmit);

function createWebLLMState() {
  const supported = typeof navigator !== "undefined" && "gpu" in navigator;
  return {
    supported,
    ok: supported,
    loading: false,
    message: supported
      ? "WebGPU detectado. WebLLM puede cargar modelos en un worker local."
      : "WebGPU no esta disponible en este runtime de Electron.",
    loadedModel: "",
    progress: ""
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function lessonIcon(text = "") {
  const lowered = String(text).toLowerCase();
  if (lowered.includes("triang") || lowered.includes("geom")) return iconMap.geometry;
  if (lowered.includes("fracci")) return iconMap.fraction;
  if (lowered.includes("abaco")) return iconMap.abacus;
  if (lowered.includes("patr") || lowered.includes("numer")) return iconMap.numbers;
  return iconMap.calculator;
}

function formatRichText(text = "") {
  return escapeHtml(text).replaceAll("\n", "<br>");
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function stripCodeFence(text = "") {
  return String(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function fallbackExplanationCards(text = "", selection = "") {
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  return [
    {
      title: "Concepto general",
      body: paragraphs[0] || "No se genero un resumen del concepto."
    },
    {
      title: "Ejemplo guiado",
      body: paragraphs[1] || "No se genero un ejemplo. Intenta volver a pedir la explicacion."
    },
    {
      title: "Respuesta concreta",
      body: paragraphs.slice(2).join("\n\n") || selection || "No se genero una respuesta directa."
    }
  ];
}

function parseExplanationCards(text = "", selection = "") {
  const cleaned = stripCodeFence(text);

  try {
    const parsed = JSON.parse(cleaned);
    const concept = parsed?.concept?.trim();
    const example = parsed?.example?.trim();
    const answer = parsed?.answer?.trim();

    if (concept || example || answer) {
      return [
        {
          title: "Concepto general",
          body: concept || "No se genero un resumen del concepto."
        },
        {
          title: "Ejemplo guiado",
          body: example || "No se genero un ejemplo."
        },
        {
          title: "Respuesta concreta",
          body: answer || selection || "No se genero una respuesta directa."
        }
      ];
    }
  } catch {
    // Fall back to plain-text parsing below.
  }

  return fallbackExplanationCards(cleaned, selection);
}

function renderExplanationCards(cards = []) {
  if (!cards.length) {
    return `<div class="empty-state">No hay explicacion activa.</div>`;
  }

  return `
    <div class="explanation-cards">
      ${cards.map((card) => `
        <article class="card explanation-card">
          <p class="tag">${escapeHtml(card.title)}</p>
          <div class="explanation-copy">${formatRichText(card.body)}</div>
        </article>
      `).join("")}
    </div>
  `;
}

function providerLabel(provider = state.settings.inferenceProvider) {
  return provider === "webllm" ? "WebLLM" : "Ollama";
}

function activeModelId(settings = state.settings) {
  if (settings.inferenceProvider !== "webllm") {
    return settings.ollamaModel || "";
  }
  if (isCustomWebLLMModel(settings.webllmModel)) {
    return settings.webllmCustomModelId?.trim() || WEBLLM_CUSTOM_QWEN35_ID;
  }
  return settings.webllmModel || "";
}

function activeModelLabel(settings = state.settings) {
  if (settings.inferenceProvider !== "webllm") {
    return settings.ollamaModel || "";
  }
  if (isCustomWebLLMModel(settings.webllmModel)) {
    return settings.webllmCustomModelId?.trim() || "Qwen3.5 / Custom MLC";
  }
  return getWebLLMModelLabel(settings.webllmModel);
}

function activeRuntimeStatus() {
  return state.settings.inferenceProvider === "webllm" ? state.webllm : state.ollama;
}

function runtimeBadgeLabel() {
  if (state.settings.inferenceProvider === "webllm") {
    if (!state.webllm.supported) return "WebGPU no disponible";
    if (state.webllm.loading) return state.webllm.progress ? `Cargando ${state.webllm.progress}` : "Cargando modelo";
    return state.webllm.loadedModel ? "Modelo listo" : "WebGPU listo";
  }
  if (state.ollama.ok) {
    return state.availableModels.length ? `${state.availableModels.length} modelos` : "Ollama conectado";
  }
  return "Ollama no disponible";
}

function selectedWebLLMChoice(settings = state.settings) {
  return WEBLLM_CHOICES.find((item) => item.modelId === settings.webllmModel) || null;
}

function buildActiveWebLLMConfig(settings = state.settings) {
  return buildWebLLMEngineConfig({
    ...settings,
    currentModel: settings.webllmModel || WEBLLM_DEFAULT_MODEL
  });
}

function webllmSignature(settings = state.settings) {
  const config = buildActiveWebLLMConfig(settings);
  return config.ok ? config.signature : "";
}

function inferenceReadiness(settings = state.settings) {
  if (settings.inferenceProvider === "ollama") {
    return {
      ready: Boolean(settings.ollamaModel),
      reason: settings.ollamaModel ? "" : "Selecciona un modelo de Ollama."
    };
  }

  if (!state.webllm.supported) {
    return {
      ready: false,
      reason: "WebGPU no esta disponible en este runtime."
    };
  }

  const config = buildActiveWebLLMConfig(settings);
  return {
    ready: config.ok,
    reason: config.reason || ""
  };
}

function normalizeSettings(raw = {}, availableModels = state.availableModels) {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  const knownWebLLMIds = new Set(WEBLLM_CHOICES.map((item) => item.modelId));

  if (!merged.webllmCustomModelId) {
    merged.webllmCustomModelId = WEBLLM_CUSTOM_QWEN35_ID;
  }

  if (!merged.ollamaModel && merged.inferenceProvider === "ollama" && merged.currentModel) {
    merged.ollamaModel = merged.currentModel;
  }

  if (!merged.webllmModel && merged.inferenceProvider === "webllm" && merged.currentModel) {
    if (knownWebLLMIds.has(merged.currentModel)) {
      merged.webllmModel = merged.currentModel;
    } else {
      merged.webllmModel = WEBLLM_CUSTOM_QWEN35_ID;
      merged.webllmCustomModelId = merged.webllmCustomModelId || merged.currentModel;
    }
  }

  if (!merged.ollamaModel && availableModels[0]?.name) {
    merged.ollamaModel = availableModels[0].name;
  }

  if (!merged.webllmModel) {
    merged.webllmModel = WEBLLM_DEFAULT_MODEL;
  }

  merged.currentModel = activeModelId(merged);
  return merged;
}

function cloneSettings(source = state.settingsDraft || state.settings) {
  return normalizeSettings({ ...source }, state.availableModels);
}

function openLoadingPanel({ title, detail }) {
  state.loadingPanel = {
    open: true,
    title: title || "Cargando modelo",
    detail: detail || "Estoy preparando tu tutor local."
  };
  render();
}

function updateLoadingPanel({ title, detail } = {}) {
  if (!state.loadingPanel.open) return;
  state.loadingPanel = {
    ...state.loadingPanel,
    title: title || state.loadingPanel.title,
    detail: detail || state.loadingPanel.detail
  };
  render();
}

function closeLoadingPanel() {
  if (!state.loadingPanel.open) return;
  state.loadingPanel = {
    ...state.loadingPanel,
    open: false
  };
  render();
}

async function bootstrap() {
  openLoadingPanel({
    title: "Preparando TutorMate",
    detail: "Estoy revisando tus lecciones y conectando el runtime local."
  });

  const payload = await window.bridge.bootstrap();
  state.lessons = payload.lessons || [];
  state.profile = migrateProfile(payload.profile || defaultProfile);
  state.availableModels = payload.availableModels || [];
  state.ollama = payload.ollama || state.ollama;
  state.settings = normalizeSettings(payload.settings || {}, state.availableModels);
  state.profileDraft = migrateProfile(state.profile);
  state.practiceMode = state.settings.responseMode;
  state.selectedUnit = state.lessons[0]?.unit || null;
  state.page = state.profile.onboardingCompleted ? "lessons" : "profile";

  try {
    await window.bridge.saveSettings(state.settings);
  } catch {
    // Render even when persistence is not available.
  }

  if (state.settings.inferenceProvider === "webllm" && inferenceReadiness().ready) {
    try {
      await ensureWebLLMEngine();
    } catch {
      closeLoadingPanel();
    }
  } else {
    await sleep(500);
    closeLoadingPanel();
  }

  render();
}

function currentSummary() {
  return profileSummary(state.profile);
}

function currentCompletedSet() {
  return completedPairs(state.profile);
}

function currentSuggestion() {
  return firstUnseen(state.lessons, currentCompletedSet());
}

function render() {
  root.innerHTML = renderShell();
  modalRoot.innerHTML = [
    state.settingsOpen ? renderSettingsModal() : "",
    state.loadingPanel.open ? renderLoadingPanel() : ""
  ].join("");
  wireLessonFrame();
  enhanceMath(document.querySelector(".page-content"));
  enhanceMath(document.querySelector(".chat-feed"));
  scrollPendingTarget();
}

function scrollPendingTarget() {
  if (!state.scrollTarget) return;
  const target = document.getElementById(state.scrollTarget);
  state.scrollTarget = null;
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderShell() {
  const summary = currentSummary();
  const meta = pageMeta[state.page];
  const runtime = activeRuntimeStatus();
  const modelLabel = activeModelLabel() || "Sin modelo";

  return `
    <div class="app-shell">
      <aside class="rail">
        <div>
          <h1 class="brand-title">TutorMate</h1>
          <p class="muted">Electron con Ollama o WebLLM para un tutor local sin backend Python.</p>
        </div>
        <div class="stack">
          ${renderNavButton("lessons", "Lecciones")}
          ${renderNavButton("practice", "Estudio")}
          ${renderNavButton("profile", "Perfil")}
        </div>
        <section class="summary-card">
          <div class="tag">${escapeHtml(summary.displayName)}</div>
          <p><strong>${summary.xp} XP</strong> - Nivel ${summary.level}</p>
          <p class="muted">Racha ${summary.streakDays} dias - Meta ${summary.dailyGoalProgress}/${summary.dailyGoal} XP</p>
          <p class="muted">Runtime: ${escapeHtml(providerLabel())}</p>
          <p class="muted">Modelo: ${escapeHtml(modelLabel)}</p>
        </section>
      </aside>
      <main class="main-card">
        <header class="header">
          <div>
            <h2>${meta.title}</h2>
            <p class="muted">${meta.subtitle}</p>
          </div>
          <div class="header-actions">
            <span class="tag">${escapeHtml(providerLabel())}</span>
            <span class="tag">${escapeHtml(modelLabel)}</span>
            <span class="tag ${runtime.ok && !runtime.loading ? "good" : ""}">${escapeHtml(runtimeBadgeLabel())}</span>
            <button class="btn secondary" data-action="open-settings">Preferencias</button>
          </div>
        </header>
        <section class="page-content">
          ${state.page === "lessons" ? renderLessonsPage() : ""}
          ${state.page === "practice" ? renderPracticePage() : ""}
          ${state.page === "profile" ? renderProfilePage() : ""}
        </section>
      </main>
    </div>
  `;
}

function renderNavButton(key, label) {
  return `<button class="nav-btn ${state.page === key ? "active" : ""}" data-action="nav" data-page="${key}">${label}</button>`;
}

function renderLessonsPage() {
  if (state.currentLesson) {
    return renderLessonReader();
  }

  const completed = currentCompletedSet();
  const ratio = completionRatio(state.lessons, completed);
  const lessons = state.lessons.find((item) => item.unit === state.selectedUnit)?.lessons || [];
  const unitRatio = state.selectedUnit
    ? unitProgress(state.lessons, state.selectedUnit, completed)
    : { done: 0, total: 0 };
  const next = currentSuggestion();

  return `
    <div class="stack">
      <section class="hero-card">
        <div class="row">
          <div class="hero-copy">
            <h2>Rutas de aprendizaje</h2>
            <p class="muted">Los datos de lecciones siguen viniendo del JSON local y la ayuda contextual usa el runtime activo.</p>
          </div>
          <span class="tag">${ratio.done}/${ratio.total} completadas</span>
        </div>
        <div class="progress-bar"><span style="width:${ratio.total ? (ratio.done / ratio.total) * 100 : 0}%"></span></div>
      </section>
      <section class="lesson-browser">
        <div class="card stack">
          <div class="card-head">
            <div>
              <h3 style="margin:0;">Unidades</h3>
              <p class="muted">Selecciona una ruta para ver sus lecciones sin salir de esta pantalla.</p>
            </div>
            <span class="tag">${state.lessons.length} rutas</span>
          </div>
          <div class="unit-list">
            ${state.lessons.map((unit) => {
              const progress = unitProgress(state.lessons, unit.unit, completed);
              return `
                <button class="unit-card ${unit.unit === state.selectedUnit ? "active" : ""}" data-action="select-unit" data-unit="${escapeHtml(unit.unit)}">
                  <div class="card-head">
                    <span class="tag">${progress.done}/${progress.total}</span>
                    <div class="icon-circle"><img src="${lessonIcon(unit.unit)}" alt="" /></div>
                  </div>
                  <div class="card-title">${escapeHtml(unit.unit)}</div>
                  <p class="muted">Abre esta ruta para listar y navegar sus lecciones.</p>
                </button>
              `;
            }).join("")}
          </div>
        </div>
        <section class="card stack" id="selected-unit-panel">
          <div class="card-head">
            <div>
              <h3 style="margin:0;">${escapeHtml(state.selectedUnit || "Selecciona una unidad")}</h3>
              <p class="muted">Siguiente sugerencia: ${next ? `${escapeHtml(next.title)} (${escapeHtml(next.unit)})` : "Ruta completa"}</p>
            </div>
            <span class="tag">${unitRatio.done}/${unitRatio.total} en esta unidad</span>
          </div>
          <div class="lesson-grid">
            ${lessons.map((lesson) => {
              const key = `${state.selectedUnit}::${lesson.title}`;
              const status = completed.has(key)
                ? "done"
                : next && next.unit === state.selectedUnit && next.title === lesson.title
                  ? "current"
                  : "";
              return `
                <button class="lesson-card ${status}" data-action="open-lesson" data-unit="${escapeHtml(state.selectedUnit)}" data-lesson="${escapeHtml(lesson.title)}">
                  <div class="card-head">
                    <span class="tag">${status === "done" ? "Completada" : status === "current" ? "Siguiente" : "Leccion"}</span>
                    <div class="icon-circle"><img src="${lessonIcon(lesson.title)}" alt="" /></div>
                  </div>
                  <div class="card-title">${escapeHtml(lesson.title)}</div>
                  <p class="muted">${escapeHtml(lesson.description || "Leccion disponible en la ruta.")}</p>
                  <p class="muted">${(lesson.stages || []).length} etapas</p>
                </button>
              `;
            }).join("") || `<div class="empty-state">Esta unidad aun no tiene lecciones cargadas.</div>`}
          </div>
        </section>
      </section>
    </div>
  `;
}

function renderLessonReader() {
  const lesson = state.currentLesson;
  const stages = lesson.stages || [];
  const stage = stages[state.stageIndex] || { html: "<p>Sin contenido.</p>" };
  const iframeHtml = wrapStageHtml(stage.html, lesson.title, state.stageIndex + 1, stages.length);

  return `
    <div class="reader-panel">
      <section class="reader-card">
        <div class="stack reader-stage">
          <div class="card-head">
            <div>
              <div class="tag">Etapa ${state.stageIndex + 1}/${stages.length}</div>
              <h3 style="margin:10px 0 4px;">${escapeHtml(lesson.title)}</h3>
              <p class="muted">${escapeHtml(state.selectedUnit || "")}</p>
            </div>
            <div class="row">
              <button class="btn secondary" data-action="close-lesson">Volver</button>
              <button class="btn secondary" data-action="explain-selection" ${state.selectedText ? "" : "disabled"}>Explica la seleccion</button>
            </div>
          </div>
          <div class="progress-bar"><span style="width:${((state.stageIndex + 1) / stages.length) * 100}%"></span></div>
          <iframe id="lesson-frame" title="Leccion" data-srcdoc="${encodeURIComponent(iframeHtml)}"></iframe>
          <div class="row">
            <button class="btn secondary" data-action="lesson-prev" ${state.stageIndex === 0 ? "disabled" : ""}>Anterior</button>
            ${state.stageIndex < stages.length - 1
              ? `<button class="btn primary" data-action="lesson-next">Siguiente</button>`
              : `<button class="btn primary" data-action="lesson-finish">Completar leccion</button>`}
          </div>
        </div>
      </section>
      <aside class="explanation-panel">
        <h3 style="margin-top:0;">Ayuda contextual</h3>
        <p class="muted">Selecciona texto dentro del lector y recibe tres tarjetas: concepto, ejemplo y respuesta directa.</p>
        ${state.explanation.open
          ? state.explanation.busy
            ? `<div class="typing"><span></span><span></span><span></span></div>`
            : renderExplanationCards(state.explanation.cards)
          : `<div class="empty-state">No hay explicacion activa.</div>`}
      </aside>
    </div>
  `;
}

function renderPracticePage() {
  const runtime = activeRuntimeStatus();
  const readiness = inferenceReadiness();
  const provider = providerLabel();
  const runtimeCopy = state.settings.inferenceProvider === "webllm"
    ? "WebLLM corre dentro del renderer y carga el modelo en un worker con WebGPU."
    : "Electron llama al API local de Ollama desde el proceso principal.";
  const workflow = state.settings.inferenceProvider === "webllm"
    ? "1. Se valida WebGPU. 2. WebLLM carga o reutiliza el modelo. 3. Se genera respuesta y se guarda XP."
    : "1. Se arma el prompt. 2. Electron llama a Ollama. 3. Se actualiza el perfil con XP.";

  return `
    <div class="stack">
      <section class="hero-card">
        <div class="row">
          <div>
            <h2>Estudio guiado con ${escapeHtml(provider)}</h2>
            <p class="muted">${runtimeCopy}</p>
          </div>
          <span class="tag ${runtime.ok && !runtime.loading ? "good" : ""}">${escapeHtml(activeModelLabel() || "Sin modelo")}</span>
        </div>
        <div class="row">
          ${Object.entries(modeLabels).map(([key, label]) => `
            <button class="chip-btn ${state.practiceMode === key ? "active" : ""}" data-action="practice-mode" data-mode="${key}">${label}</button>
          `).join("")}
        </div>
        <p class="muted">${escapeHtml(runtime.message || readiness.reason || "")}</p>
      </section>
      <section class="split">
        <div class="chat-card">
          <div class="chat-feed">
            ${state.chatMessages.length
              ? state.chatMessages.map((message) => `
                  <div class="message ${message.role === "user" ? "user" : "bot"}">${formatRichText(message.text)}</div>
                `).join("")
              : `<div class="empty-state">Pregunta algo sobre matematicas. Las respuestas se renderizan con KaTeX y la app suma XP por practica.</div>`}
            ${state.isThinking ? `<div class="typing"><span></span><span></span><span></span></div>` : ""}
          </div>
          ${!readiness.ready ? `<div class="empty-state">${escapeHtml(readiness.reason)}</div>` : ""}
          <form class="composer" data-form="chat">
            <textarea id="chat-input" name="question" placeholder="Escribe una pregunta matematica en espanol..." ${(state.isThinking || !readiness.ready || state.webllm.loading) ? "disabled" : ""}></textarea>
            <button class="btn primary" type="submit" ${(state.isThinking || !readiness.ready || state.webllm.loading) ? "disabled" : ""}>${state.webllm.loading && state.settings.inferenceProvider === "webllm" ? "Cargando..." : "Preguntar"}</button>
          </form>
        </div>
        <aside class="workflow-card stack">
          <div>
            <h3 style="margin-top:0;">Workflow activo</h3>
            <p class="muted">${workflow}</p>
          </div>
          <div class="card">
            <strong>${escapeHtml(provider)} activo</strong>
            <p class="muted">${escapeHtml(runtime.message || "Sin estado de runtime.")}</p>
          </div>
          ${[
            "Explicame como comparar fracciones",
            "Dame una pista para un problema de triangulos",
            "Resuelve paso a paso una ecuacion simple"
          ].map((prompt) => `
            <button class="btn secondary" data-action="quick-prompt" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>
          `).join("")}
        </aside>
      </section>
    </div>
  `;
}

function renderProfilePage() {
  const summary = currentSummary();
  if (!summary.onboardingCompleted) {
    return renderOnboarding();
  }

  const suggestion = currentSuggestion();
  const pathItems = flattenLessons(state.lessons).map((lesson) => {
    const done = currentCompletedSet().has(`${lesson.unit}::${lesson.title}`);
    const current = suggestion && suggestion.unit === lesson.unit && suggestion.title === lesson.title;
    return { ...lesson, state: done ? "done" : current ? "current" : "" };
  });

  return `
    <div class="stack">
      <section class="hero-card">
        <div class="card-head">
          <div class="profile-head">
            <span class="tag">${escapeHtml(summary.focusArea)}</span>
            <h2>${escapeHtml(summary.displayName)}</h2>
            <p class="muted">${escapeHtml(summary.grade)} - Meta ${summary.dailyGoal} XP - ${escapeHtml(modeLabels[summary.responseMode])}</p>
          </div>
          <div class="row">
            <button class="btn secondary" data-action="edit-profile">Editar perfil</button>
            <button class="btn primary" data-action="continue-suggestion" ${suggestion ? "" : "disabled"}>${suggestion ? "Continuar mision" : "Ruta completa"}</button>
          </div>
        </div>
        <p class="muted">Meta diaria: ${summary.dailyGoalProgress}/${summary.dailyGoal} XP</p>
        <div class="progress-bar"><span style="width:${(summary.dailyGoalProgress / summary.dailyGoal) * 100}%"></span></div>
      </section>
      <section class="stats-row">
        <article class="stats-card"><p class="muted">Nivel</p><strong>${summary.level}</strong><span class="muted">Faltan ${summary.xpToNextLevel} XP</span></article>
        <article class="stats-card"><p class="muted">Racha</p><strong>${summary.streakDays}</strong><span class="muted">dias seguidos</span></article>
        <article class="stats-card"><p class="muted">Lecciones</p><strong>${summary.lessonsCompleted}</strong><span class="muted">misiones cerradas</span></article>
        <article class="stats-card"><p class="muted">XP</p><strong>${summary.xp}</strong><span class="muted">experiencia total</span></article>
      </section>
      <section class="profile-layout">
        <div class="path-card stack">
          <h3 style="margin:0;">Camino de aprendizaje</h3>
          ${pathItems.map((item) => `
            <div class="path-node ${item.state}">
              <div class="card-head">
                <div>
                  <div class="card-title">${escapeHtml(item.title)}</div>
                  <p class="muted">${escapeHtml(item.unit)} - ${item.stageCount} etapas</p>
                </div>
                <button class="btn ${item.state === "current" ? "primary" : "secondary"}" data-action="open-lesson" data-unit="${escapeHtml(item.unit)}" data-lesson="${escapeHtml(item.title)}">Abrir</button>
              </div>
            </div>
          `).join("")}
        </div>
        <aside class="activity-card stack">
          <h3 style="margin:0;">Actividad reciente</h3>
          ${recentActivity(state.profile).length
            ? recentActivity(state.profile).map((item) => `
                <div class="card">
                  <strong>${item.kind === "lesson" ? `Leccion: ${escapeHtml(item.title)}` : "Practica en chat"}</strong>
                  <p class="muted">${item.kind === "lesson" ? escapeHtml(item.unit) : `+${item.xp} XP`}</p>
                </div>
              `).join("")
            : `<div class="empty-state">Todavia no hay actividad guardada.</div>`}
          <button class="btn secondary" data-action="reset-progress">Reiniciar progreso</button>
        </aside>
      </section>
    </div>
  `;
}

function renderOnboarding() {
  const draft = state.profileDraft;
  const step = state.onboardingStep;

  return `
    <section class="hero-card stack">
      <div class="stepper">
        <span class="${step === 0 ? "active" : ""}"></span>
        <span class="${step === 1 ? "active" : ""}"></span>
        <span class="${step === 2 ? "active" : ""}"></span>
      </div>
      <div>
        <h2>Crea tu perfil de estudio</h2>
        <p class="muted">Onboarding gamificado y persistencia local, ahora completamente en Electron.</p>
      </div>
      ${step === 0 ? `
        <input data-draft-field="name" value="${escapeHtml(draft.name || "")}" placeholder="Tu nombre o alias" />
        <div class="choice-grid">
          ${Object.entries(avatarMap).map(([key, src]) => `
            <button class="choice-card ${draft.avatar === key ? "active" : ""}" data-action="choose-avatar" data-value="${key}">
              <img src="${src}" alt="" />
              <div class="card-title">${key}</div>
              <p class="muted">Avatar para tu ruta.</p>
            </button>
          `).join("")}
        </div>
      ` : ""}
      ${step === 1 ? `
        <select data-draft-field="grade">
          ${["3.o", "4.o", "5.o", "6.o", "Secundaria"].map((grade) => `
            <option value="${grade}" ${draft.grade === grade ? "selected" : ""}>${grade}</option>
          `).join("")}
        </select>
        <div class="row">
          ${[10, 20, 30].map((goal) => `
            <button class="chip-btn ${Number(draft.dailyGoal) === goal ? "active" : ""}" data-action="choose-goal" data-value="${goal}">${goal} XP</button>
          `).join("")}
        </div>
      ` : ""}
      ${step === 2 ? `
        <div class="row">
          ${["Aritmetica", "Geometria", "Fracciones", "Resolucion de problemas"].map((focus) => `
            <button class="chip-btn ${draft.focusArea === focus ? "active" : ""}" data-action="choose-focus" data-value="${focus}">${focus}</button>
          `).join("")}
        </div>
        <div class="row">
          ${Object.entries(modeLabels).map(([key, label]) => `
            <button class="chip-btn ${draft.responseMode === key ? "active" : ""}" data-action="choose-response-mode" data-value="${key}">${label}</button>
          `).join("")}
        </div>
      ` : ""}
      <div class="row">
        <button class="btn secondary" data-action="onboarding-prev" ${step === 0 ? "disabled" : ""}>Atras</button>
        ${step < 2
          ? `<button class="btn primary" data-action="onboarding-next">Siguiente</button>`
          : `<button class="btn primary" data-action="save-profile">Guardar perfil</button>`}
      </div>
    </section>
  `;
}

function renderSettingsModal() {
  const draft = cloneSettings();
  const provider = draft.inferenceProvider;
  const activeChoice = selectedWebLLMChoice(draft);
  const webllmConfig = buildActiveWebLLMConfig(draft);
  const readiness = inferenceReadiness(draft);

  return `
    <div class="modal">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h3 style="margin:0;">Preferencias</h3>
            <p class="muted">Selecciona el runtime local, el modelo activo y el modo por defecto.</p>
          </div>
          <button class="ghost-btn" data-action="close-settings">Cerrar</button>
        </div>
        <div class="stack">
          <label>
            <span class="muted">Motor de inferencia</span>
            <select data-settings-field="inferenceProvider">
              <option value="ollama" ${provider === "ollama" ? "selected" : ""}>Ollama</option>
              <option value="webllm" ${provider === "webllm" ? "selected" : ""}>WebLLM</option>
            </select>
          </label>
          ${provider === "ollama" ? `
            <div class="card stack">
              <div>
                <strong>Ollama local</strong>
                <p class="muted">Usa el proceso principal de Electron para llamar a /api/tags y /api/chat.</p>
              </div>
              <label>
                <span class="muted">URL de Ollama</span>
                <input data-settings-field="ollamaBaseUrl" value="${escapeHtml(draft.ollamaBaseUrl)}" />
              </label>
              <label>
                <span class="muted">Modelo de Ollama</span>
                <select data-settings-field="ollamaModel">
                  <option value="">Selecciona un modelo</option>
                  ${state.availableModels.map((model) => `
                    <option value="${escapeHtml(model.name)}" ${draft.ollamaModel === model.name ? "selected" : ""}>${escapeHtml(model.name)}</option>
                  `).join("")}
                </select>
              </label>
              <p class="muted">${escapeHtml(state.ollama.message)}</p>
              <div class="row">
                <button class="btn secondary" data-action="refresh-models">Actualizar modelos</button>
              </div>
            </div>
          ` : ""}
          ${provider === "webllm" ? `
            <div class="card stack">
              <div>
                <strong>WebLLM local</strong>
                <p class="muted">Usa WebGPU y un worker del renderer para ejecutar el modelo dentro de Electron.</p>
              </div>
              <p class="muted">${escapeHtml(state.webllm.supported ? "WebGPU disponible en este runtime." : "WebGPU no esta disponible. WebLLM no podra cargar modelos.")}</p>
              <label>
                <span class="muted">Modelo WebLLM</span>
                <select data-settings-field="webllmModel">
                  ${WEBLLM_CHOICES.map((choice) => `
                    <option value="${escapeHtml(choice.modelId)}" ${draft.webllmModel === choice.modelId ? "selected" : ""}>
                      ${escapeHtml(choice.label)}${choice.builtIn ? "" : " (custom)"}
                    </option>
                  `).join("")}
                </select>
              </label>
              <p class="muted">${escapeHtml(activeChoice?.note || "Selecciona un preset de WebLLM o define un modelo MLC custom.")}</p>
              ${isCustomWebLLMModel(draft.webllmModel) ? `
                <label>
                  <span class="muted">ID del modelo custom</span>
                  <input data-settings-field="webllmCustomModelId" value="${escapeHtml(draft.webllmCustomModelId)}" />
                </label>
                <label>
                  <span class="muted">URL del modelo MLC</span>
                  <input data-settings-field="webllmCustomModelUrl" value="${escapeHtml(draft.webllmCustomModelUrl)}" placeholder="https://..." />
                </label>
                <label>
                  <span class="muted">URL del model_lib wasm</span>
                  <input data-settings-field="webllmCustomModelLibUrl" value="${escapeHtml(draft.webllmCustomModelLibUrl)}" placeholder="https://..." />
                </label>
              ` : ""}
              <p class="muted">${escapeHtml(state.webllm.loading ? state.webllm.message : readiness.reason || webllmConfig.reason || state.webllm.message)}</p>
            </div>
          ` : ""}
          <label>
            <span class="muted">Modo de respuesta por defecto</span>
            <select data-settings-field="responseMode">
              ${Object.entries(modeLabels).map(([key, label]) => `
                <option value="${key}" ${draft.responseMode === key ? "selected" : ""}>${label}</option>
              `).join("")}
            </select>
          </label>
          <div class="row">
            <button class="btn primary" data-action="save-settings">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLoadingPanel() {
  return `
    <div class="modal loading-modal">
      <div class="modal-card loading-card">
        <div class="loading-scene">
          <div class="loading-orbit orbit-a"></div>
          <div class="loading-orbit orbit-b"></div>
          <div class="loading-mascot">
            <span class="loading-eye eye-left"></span>
            <span class="loading-eye eye-right"></span>
            <span class="loading-mouth"></span>
          </div>
        </div>
        <div class="stack">
          <span class="tag">Cargando modelo</span>
          <h3 style="margin:0;">${escapeHtml(state.loadingPanel.title)}</h3>
          <p class="muted">${escapeHtml(state.loadingPanel.detail)}</p>
        </div>
      </div>
    </div>
  `;
}

function handleInput(event) {
  const target = event.target;

  if (target.dataset.draftField) {
    state.profileDraft = { ...state.profileDraft, [target.dataset.draftField]: target.value };
  }

  if (target.dataset.settingsField) {
    state.settingsDraft = normalizeSettings({
      ...(state.settingsDraft || state.settings),
      [target.dataset.settingsField]: target.value
    }, state.availableModels);

    if (target.tagName === "SELECT") {
      render();
    }
  }
}

async function handleSubmit(event) {
  if (event.target.dataset.form !== "chat") return;
  event.preventDefault();

  const question = event.target.question.value.trim();
  const readiness = inferenceReadiness();
  if (!question || state.isThinking || !readiness.ready || state.webllm.loading) return;

  event.target.reset();
  state.chatMessages.push({ role: "user", text: question });
  state.isThinking = true;
  render();

  try {
    const answer = await askModel([
      { role: "system", content: buildSystemPrompt(state.practiceMode) },
      { role: "user", content: question }
    ]);
    state.chatMessages.push({ role: "bot", text: answer || "(sin respuesta)" });
    state.profile = addPracticeXp(state.profile, 1);
    await window.bridge.saveProfile(state.profile);
  } catch (error) {
    state.chatMessages.push({ role: "bot", text: `[Error] ${error.message}` });
  } finally {
    state.isThinking = false;
    render();
  }
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "nav") {
    state.page = button.dataset.page;
  }

  if (action === "select-unit") {
    state.selectedUnit = button.dataset.unit;
    state.scrollTarget = "selected-unit-panel";
  }

  if (action === "open-lesson") {
    const lesson = getLesson(state.lessons, button.dataset.unit, button.dataset.lesson);
    if (lesson) {
      state.selectedUnit = button.dataset.unit;
      state.currentLesson = lesson;
      state.stageIndex = 0;
      state.selectedText = "";
      state.explanation = { open: false, busy: false, cards: [] };
      state.page = "lessons";
    }
  }

  if (action === "close-lesson") {
    state.currentLesson = null;
    state.stageIndex = 0;
    state.selectedText = "";
    state.explanation = { open: false, busy: false, cards: [] };
  }

  if (action === "lesson-prev" && state.stageIndex > 0) {
    state.stageIndex -= 1;
    state.selectedText = "";
  }

  if (action === "lesson-next" && state.currentLesson) {
    state.stageIndex = Math.min(state.stageIndex + 1, state.currentLesson.stages.length - 1);
    state.selectedText = "";
  }

  if (action === "lesson-finish" && state.currentLesson) {
    state.profile = recordLessonCompletion(state.profile, state.selectedUnit, state.currentLesson.title, 5);
    await window.bridge.saveProfile(state.profile);
    state.currentLesson = null;
    state.stageIndex = 0;
  }

  if (action === "practice-mode") {
    state.practiceMode = button.dataset.mode;
  }

  if (action === "quick-prompt") {
    const input = document.getElementById("chat-input");
    if (input) {
      input.value = button.dataset.prompt;
      input.focus();
      return;
    }
  }

  if (action === "continue-suggestion") {
    const suggestion = currentSuggestion();
    if (suggestion) {
      const lesson = getLesson(state.lessons, suggestion.unit, suggestion.title);
      if (lesson) {
        state.selectedUnit = suggestion.unit;
        state.currentLesson = lesson;
        state.stageIndex = 0;
        state.page = "lessons";
      }
    }
  }

  if (action === "reset-progress") {
    state.profile = resetProgress(state.profile);
    await window.bridge.saveProfile(state.profile);
  }

  if (action === "edit-profile") {
    state.profileDraft = migrateProfile(state.profile);
    state.profile = { ...state.profile, onboardingCompleted: false };
    state.onboardingStep = 0;
  }

  if (action === "onboarding-prev") {
    state.onboardingStep = Math.max(0, state.onboardingStep - 1);
  }

  if (action === "onboarding-next") {
    state.onboardingStep = Math.min(2, state.onboardingStep + 1);
  }

  if (action === "choose-avatar") {
    state.profileDraft = { ...state.profileDraft, avatar: button.dataset.value };
  }

  if (action === "choose-goal") {
    state.profileDraft = { ...state.profileDraft, dailyGoal: Number(button.dataset.value) };
  }

  if (action === "choose-focus") {
    state.profileDraft = { ...state.profileDraft, focusArea: button.dataset.value };
  }

  if (action === "choose-response-mode") {
    state.profileDraft = { ...state.profileDraft, responseMode: button.dataset.value };
  }

  if (action === "save-profile") {
    state.profile = setupProfile(state.profile, {
      name: state.profileDraft.name,
      avatar: state.profileDraft.avatar || "tutor",
      grade: state.profileDraft.grade || "5.o",
      dailyGoal: state.profileDraft.dailyGoal || 20,
      focusArea: state.profileDraft.focusArea || "Resolucion de problemas",
      responseMode: state.profileDraft.responseMode || "coach"
    });
    state.settings = normalizeSettings({ ...state.settings, responseMode: state.profile.responseMode }, state.availableModels);
    state.practiceMode = state.profile.responseMode;
    state.profileDraft = migrateProfile(state.profile);
    await window.bridge.saveProfile(state.profile);
    await window.bridge.saveSettings(state.settings);
    state.page = "lessons";
  }

  if (action === "open-settings") {
    state.settingsDraft = cloneSettings(state.settings);
    state.settingsOpen = true;
  }

  if (action === "close-settings") {
    state.settingsOpen = false;
    state.settingsDraft = null;
  }

  if (action === "refresh-models" && state.settingsDraft) {
    await refreshOllamaModels(state.settingsDraft.ollamaBaseUrl);
  }

  if (action === "save-settings" && state.settingsDraft) {
    const nextSettings = normalizeSettings(state.settingsDraft, state.availableModels);
    const providerChanged = nextSettings.inferenceProvider !== state.settings.inferenceProvider;
    const modelChanged = activeModelId(nextSettings) !== activeModelId(state.settings);
    const shouldResetWebLLM =
      providerChanged ||
      webllmSignature(nextSettings) !== webllmSignature(state.settings);
    const shouldShowLoading = providerChanged || modelChanged;

    if (shouldShowLoading) {
      openLoadingPanel({
        title: "Preparando el modelo",
        detail: nextSettings.inferenceProvider === "webllm"
          ? `Espera un momento mientras cargo ${activeModelLabel(nextSettings)}.`
          : `Espera un momento mientras preparo ${activeModelLabel(nextSettings) || "la sesion"} en Ollama.`
      });
    }

    if (shouldResetWebLLM) {
      await teardownWebLLMEngine(true);
    }

    state.settings = nextSettings;
    state.practiceMode = state.settings.responseMode;
    await window.bridge.saveSettings(state.settings);
    state.settingsOpen = false;
    state.settingsDraft = null;

    if (state.settings.inferenceProvider === "webllm" && inferenceReadiness().ready) {
      try {
        await ensureWebLLMEngine();
      } catch {
        closeLoadingPanel();
      }
    } else if (state.settings.inferenceProvider === "webllm" && shouldShowLoading) {
      await sleep(500);
      closeLoadingPanel();
    } else if (shouldShowLoading) {
      await refreshOllamaModels(state.settings.ollamaBaseUrl);
      await sleep(650);
      closeLoadingPanel();
    }
  }

  if (action === "explain-selection" && state.selectedText && inferenceReadiness().ready) {
    state.explanation = { open: true, busy: true, cards: [] };
    render();
    try {
      const answer = await askModel([
        { role: "system", content: explainPrompt },
        { role: "user", content: buildExplainUserPrompt(state.selectedText) }
      ]);
      state.explanation = {
        open: true,
        busy: false,
        cards: parseExplanationCards(answer, state.selectedText)
      };
    } catch (error) {
      state.explanation = {
        open: true,
        busy: false,
        cards: fallbackExplanationCards(`[Error] ${error.message}`, state.selectedText)
      };
    }
  }

  render();
}

async function refreshOllamaModels(baseUrl) {
  try {
    state.availableModels = await window.bridge.listModels(baseUrl);
    state.ollama = {
      ok: true,
      message: state.availableModels.length
        ? `${state.availableModels.length} modelos detectados en Ollama.`
        : "Ollama responde, pero no hay modelos descargados."
    };
    state.settings = normalizeSettings(state.settings, state.availableModels);
    if (state.settingsDraft) {
      state.settingsDraft = normalizeSettings(state.settingsDraft, state.availableModels);
    }
  } catch (error) {
    state.ollama = { ok: false, message: error.message };
  }
}

async function askModel(messages) {
  if (state.settings.inferenceProvider === "webllm") {
    return askWithWebLLM(messages);
  }
  return askWithOllama(messages);
}

async function askWithOllama(messages) {
  if (!state.settings.ollamaModel) {
    throw new Error("Selecciona un modelo de Ollama.");
  }

  return window.bridge.chat({
    baseUrl: state.settings.ollamaBaseUrl,
    model: state.settings.ollamaModel,
    messages
  });
}

async function ensureWebLLMEngine() {
  if (!state.webllm.supported) {
    throw new Error("WebGPU no esta disponible en este runtime.");
  }

  const config = buildActiveWebLLMConfig(state.settings);
  if (!config.ok) {
    throw new Error(config.reason);
  }

  if (webllmRuntime.engine && webllmRuntime.signature === config.signature) {
    return webllmRuntime.engine;
  }

  await teardownWebLLMEngine(false);
  openLoadingPanel({
    title: "Cargando modelo local",
    detail: `${activeModelLabel()} necesita unos segundos para despertar en WebLLM.`
  });

  state.webllm = {
    ...state.webllm,
    loading: true,
    ok: true,
    message: `Cargando ${activeModelLabel()}...`,
    progress: "",
    loadedModel: ""
  };
  render();

  const worker = new Worker(new URL("./workers/webllm-worker.mjs", import.meta.url), { type: "module" });

  try {
    const engine = await CreateWebWorkerMLCEngine(worker, config.selectedModel, {
      appConfig: config.appConfig,
      initProgressCallback: (report) => {
        const percent = typeof report.progress === "number" ? `${Math.round(report.progress * 100)}%` : "";
        state.webllm = {
          ...state.webllm,
          loading: true,
          ok: true,
          message: [report.text, percent].filter(Boolean).join(" ") || `Cargando ${config.selectedModel}...`,
          progress: percent
        };
        updateLoadingPanel({
          detail: [report.text, percent].filter(Boolean).join(" ") || `Cargando ${config.selectedModel}...`
        });
        render();
      }
    });

    webllmRuntime = {
      engine,
      worker,
      signature: config.signature
    };

    state.webllm = {
      ...state.webllm,
      loading: false,
      ok: true,
      message: `${activeModelLabel()} listo para inferencia local.`,
      progress: "",
      loadedModel: config.selectedModel
    };
    updateLoadingPanel({
      title: "Modelo listo",
      detail: `${activeModelLabel()} ya esta preparado.`
    });
    await sleep(450);
    closeLoadingPanel();
    render();
    return engine;
  } catch (error) {
    worker.terminate();
    state.webllm = {
      ...state.webllm,
      loading: false,
      ok: false,
      message: error.message || "No se pudo cargar WebLLM.",
      progress: "",
      loadedModel: ""
    };
    updateLoadingPanel({
      title: "No se pudo cargar el modelo",
      detail: error.message || "No se pudo cargar WebLLM."
    });
    await sleep(1200);
    closeLoadingPanel();
    render();
    throw error;
  }
}

async function teardownWebLLMEngine(resetState = false) {
  const runtime = webllmRuntime;
  webllmRuntime = { engine: null, worker: null, signature: "" };

  if (runtime.engine?.unload) {
    try {
      await runtime.engine.unload();
    } catch {
      // Ignore unload failures; the worker will still be terminated.
    }
  }

  if (runtime.worker) {
    runtime.worker.terminate();
  }

  if (resetState) {
    state.webllm = createWebLLMState();
  }
}

function extractAssistantText(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("\n")
      .trim();
  }

  return "";
}

async function askWithWebLLM(messages) {
  const engine = await ensureWebLLMEngine();
  await engine.resetChat?.();
  const response = await engine.chat.completions.create({ messages });
  return extractAssistantText(response.choices?.[0]?.message?.content);
}

function wireLessonFrame() {
  const frame = document.getElementById("lesson-frame");
  if (!frame) return;

  frame.srcdoc = decodeURIComponent(frame.dataset.srcdoc);
  frame.addEventListener("load", () => {
    const updateSelection = () => {
      state.selectedText = frame.contentWindow?.getSelection?.().toString().trim() || "";
      const explainButton = document.querySelector('[data-action="explain-selection"]');
      if (explainButton) {
        explainButton.disabled = !state.selectedText;
      }
    };

    frame.contentDocument?.addEventListener("mouseup", updateSelection);
    frame.contentDocument?.addEventListener("keyup", updateSelection);
  }, { once: true });
}

function enhanceMath(node) {
  if (!node || !window.renderMathInElement) return;
  window.renderMathInElement(node, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\[", right: "\\]", display: true },
      { left: "\\(", right: "\\)", display: false }
    ],
    throwOnError: false
  });
}
