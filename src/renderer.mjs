import {
  addPracticeXp,
  completedPairs,
  defaultProfile,
  hasStudiedConcept,
  knownConcepts,
  migrateProfile,
  profileSummary,
  recentActivity,
  recordLessonCompletion,
  resetProgress,
  setupProfile,
  trackConceptStudy
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
  buildClassifierUserPrompt,
  buildExerciseTutorUserPrompt,
  buildExplainImageUserPrompt,
  buildExplainUserPrompt,
  buildStudyDeckUserPrompt,
  explainPrompt,
  exerciseTutorPrompt,
  modeLabels,
  studyClassifierPrompt,
  studyDeckPrompt,
  visionExplainPrompt
} from "./utils/prompts.mjs";

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
    subtitle: "Explora rutas visuales y activa ayuda contextual sobre texto o imagen."
  },
  practice: {
    title: "Estudio guiado",
    subtitle: "El tutor clasifica la pregunta y arma un recorrido de concepto o ejercicio."
  },
  profile: {
    title: "Perfil",
    subtitle: "Onboarding, progreso tipo ruta y conceptos registrados del estudiante."
  }
};

const DEFAULT_SETTINGS = {
  currentModel: "",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  responseMode: "coach",
  theme: "light"
};

const PRACTICE_KIND_LABELS = {
  concept: "Concepto",
  exercise: "Ejercicio",
  non_math: "No relacionado"
};

const VISION_MODEL_PATTERNS = [
  "llava",
  "bakllava",
  "vision",
  "moondream",
  "minicpm-v",
  "minicpmv",
  "qwen2.5vl",
  "qwen2vl",
  "gemma3",
  "llama3.2-vision",
  "phi4-multimodal",
  "granite-vision"
];

const state = {
  lessons: [],
  profile: migrateProfile(defaultProfile),
  settings: { ...DEFAULT_SETTINGS },
  availableModels: [],
  ollama: { ok: false, message: "Sin conexion con Ollama." },
  page: "lessons",
  selectedUnit: null,
  currentLesson: null,
  stageIndex: 0,
  practiceMode: "coach",
  chatMessages: [],
  practiceSession: null,
  isThinking: false,
  explanation: { open: false, busy: false, cards: [] },
  settingsOpen: false,
  settingsDraft: null,
  profileDraft: migrateProfile(defaultProfile),
  onboardingStep: 0,
  selectedText: "",
  scrollTarget: null,
  lessonUi: {
    scroll: { x: 0, y: 0 },
    contextMenu: { open: false, x: 20, y: 20 },
    cropMode: false,
    dragStart: null,
    cropRect: null,
    cropAction: { open: false, x: 20, y: 20 }
  },
  loadingPanel: {
    open: true,
    title: "Preparando TutorMate",
    detail: "Un momento. Estoy acomodando tus lecciones y conectando Ollama."
  }
};

const root = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");

render();
await bootstrap();
document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("submit", handleSubmit);
document.addEventListener("dragstart", handleDragStart);
document.addEventListener("dragover", handleDragOver);
document.addEventListener("drop", handleDrop);

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

function stripAccents(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value = "") {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLooseAnswer(value = "") {
  return stripAccents(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,;:!?¿¡'"]/g, "")
    .trim();
}

function safeJsonParse(text = "", fallback = null) {
  try {
    return JSON.parse(stripCodeFence(text));
  } catch {
    return fallback;
  }
}

function uniqueList(values = []) {
  const seen = new Set();
  const items = [];

  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = slugify(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(text);
  }

  return items;
}

function shuffle(values = []) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
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

function inferenceReadiness(settings = state.settings) {
  return {
    ready: Boolean(settings.currentModel),
    reason: settings.currentModel ? "" : "Selecciona un modelo de Ollama."
  };
}

function normalizeSettings(raw = {}, availableModels = state.availableModels) {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  if (!merged.currentModel && merged.ollamaModel) {
    merged.currentModel = merged.ollamaModel;
  }
  if (!merged.currentModel && availableModels[0]?.name) {
    merged.currentModel = availableModels[0].name;
  }
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
    detail: "Estoy revisando tus lecciones y conectando Ollama local."
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

  await sleep(450);
  closeLoadingPanel();
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

function currentModelInfo() {
  return state.availableModels.find((item) => item.name === state.settings.currentModel) || null;
}

function currentModelSupportsVision() {
  const model = currentModelInfo();
  const haystack = [
    state.settings.currentModel,
    model?.details?.family,
    ...(model?.details?.families || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return VISION_MODEL_PATTERNS.some((pattern) => haystack.includes(pattern));
}

function resetLessonAssistState() {
  state.selectedText = "";
  state.explanation = { open: false, busy: false, cards: [] };
  state.lessonUi = {
    scroll: { x: 0, y: 0 },
    contextMenu: { open: false, x: 20, y: 20 },
    cropMode: false,
    dragStart: null,
    cropRect: null,
    cropAction: { open: false, x: 20, y: 20 }
  };
}

function closeLessonMenus({ clearCrop = false } = {}) {
  const hadState = state.lessonUi.contextMenu.open || state.lessonUi.cropAction.open || state.lessonUi.cropMode;
  state.lessonUi.contextMenu = { ...state.lessonUi.contextMenu, open: false };
  state.lessonUi.cropAction = { ...state.lessonUi.cropAction, open: false };
  state.lessonUi.cropMode = false;
  state.lessonUi.dragStart = null;
  if (clearCrop) {
    state.lessonUi.cropRect = null;
  }
  return hadState;
}

function renderLessonOverlay() {
  const parts = [];

  if (state.lessonUi.cropMode) {
    parts.push(`<div class="lesson-overlay-hint">Arrastra para recortar una imagen, un diagrama o una parte visible de la leccion.</div>`);
  }

  if (state.lessonUi.cropRect) {
    parts.push(`
      <div
        class="crop-selection"
        style="left:${state.lessonUi.cropRect.x}px;top:${state.lessonUi.cropRect.y}px;width:${state.lessonUi.cropRect.width}px;height:${state.lessonUi.cropRect.height}px;"
      ></div>
    `);
  }

  if (state.lessonUi.contextMenu.open && state.selectedText) {
    parts.push(`
      <div class="lesson-floating-menu" style="left:${state.lessonUi.contextMenu.x}px;top:${state.lessonUi.contextMenu.y}px;">
        <button class="btn secondary" data-action="explain-selection">Explica la seleccion</button>
      </div>
    `);
  }

  if (state.lessonUi.cropAction.open && state.lessonUi.cropRect && currentModelSupportsVision()) {
    parts.push(`
      <div class="lesson-floating-menu" style="left:${state.lessonUi.cropAction.x}px;top:${state.lessonUi.cropAction.y}px;">
        <button class="btn primary" data-action="ask-image-selection">Que es esto?</button>
        <button class="btn secondary" data-action="clear-crop">Limpiar</button>
      </div>
    `);
  }

  return parts.join("");
}

function renderLessonExplanationBody() {
  if (!state.explanation.open) {
    return `<div class="empty-state">No hay explicacion activa.</div>`;
  }

  if (state.explanation.busy) {
    return `<div class="typing"><span></span><span></span><span></span></div>`;
  }

  return renderExplanationCards(state.explanation.cards);
}

function syncLessonUi() {
  const overlay = document.getElementById("lesson-overlay");
  if (overlay) {
    overlay.innerHTML = renderLessonOverlay();
  }

  const explanationBody = document.getElementById("lesson-explanation-body");
  if (explanationBody) {
    explanationBody.innerHTML = renderLessonExplanationBody();
    enhanceMath(explanationBody);
  }

  const cropButton = document.querySelector('[data-action="toggle-crop-mode"]');
  if (cropButton) {
    cropButton.textContent = state.lessonUi.cropMode ? "Cancelar recorte" : "Seleccionar recorte";
    cropButton.classList.toggle("primary", state.lessonUi.cropMode);
    cropButton.classList.toggle("secondary", !state.lessonUi.cropMode);
  }
}

function render() {
  root.innerHTML = renderShell();
  modalRoot.innerHTML = [
    state.settingsOpen ? renderSettingsModal() : "",
    state.loadingPanel.open ? renderLoadingPanel() : ""
  ].join("");
  wireLessonFrame();
  syncLessonUi();
  enhanceMath(document.querySelector(".page-content"));
  enhanceMath(document.querySelector(".chat-feed"));
  enhanceMath(document.querySelector(".practice-session"));
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
  const modelLabel = state.settings.currentModel || "Sin modelo";

  return `
    <div class="app-shell">
      <aside class="rail">
        <div>
          <h1 class="brand-title">TutorMate</h1>
          <p class="muted">Electron con Ollama para un tutor local sin backend Python.</p>
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
          <p class="muted">Conceptos registrados: ${summary.knownConcepts}</p>
          <p class="muted">Runtime: Ollama</p>
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
            <span class="tag">Ollama</span>
            <span class="tag">${escapeHtml(modelLabel)}</span>
            <span class="tag ${state.ollama.ok ? "good" : ""}">${escapeHtml(state.ollama.message)}</span>
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
            <p class="muted">Los datos de lecciones vienen del JSON local y la ayuda contextual usa Ollama.</p>
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
  const visionReady = currentModelSupportsVision() && inferenceReadiness().ready;

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
              ${currentModelSupportsVision()
                ? `<button class="btn ${state.lessonUi.cropMode ? "primary" : "secondary"}" data-action="toggle-crop-mode">${state.lessonUi.cropMode ? "Cancelar recorte" : "Seleccionar recorte"}</button>`
                : ""}
            </div>
          </div>
          <div class="reader-helper-row">
            <span class="tag">Texto: selecciona y haz clic derecho para explicar.</span>
            <span class="tag ${visionReady ? "good" : ""}">
              ${visionReady
                ? "Imagen: arrastra un recorte y pregunta Que es esto?"
                : "Usa un modelo con vision para preguntas sobre imagenes"}
            </span>
          </div>
          <div class="progress-bar"><span style="width:${((state.stageIndex + 1) / stages.length) * 100}%"></span></div>
          <div class="reader-frame-shell" id="lesson-frame-shell">
            <iframe id="lesson-frame" title="Leccion" data-srcdoc="${encodeURIComponent(iframeHtml)}"></iframe>
            <div class="lesson-overlay" id="lesson-overlay">${renderLessonOverlay()}</div>
          </div>
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
        <p class="muted">Selecciona texto y haz clic derecho. Si tu modelo tiene vision, tambien puedes recortar una imagen de la leccion.</p>
        <div id="lesson-explanation-body">${renderLessonExplanationBody()}</div>
      </aside>
    </div>
  `;
}

function renderTranscript() {
  if (!state.chatMessages.length) {
    return `<div class="empty-state">Pregunta algo sobre matematicas y el tutor decidira si debe construir un recorrido conceptual, una practica guiada o frenar por no ser contenido matematico.</div>`;
  }

  return state.chatMessages.map((message) => `
    <div class="message ${message.role === "user" ? "user" : "bot"}">${formatRichText(message.text)}</div>
  `).join("");
}

function renderSessionSummary() {
  if (!state.practiceSession) {
    return `<div class="empty-state">Todavia no hay una sesion de estudio activa.</div>`;
  }

  return `
    <div class="card stack">
      <div class="card-head">
        <div>
          <strong>${PRACTICE_KIND_LABELS[state.practiceSession.kind] || "Sesion"}</strong>
          <p class="muted">${escapeHtml(state.practiceSession.topic || "Sin tema")}</p>
        </div>
        <span class="tag">${escapeHtml(state.practiceSession.conceptTopic || state.practiceSession.topic || "Tutor")}</span>
      </div>
      <p class="muted">${escapeHtml(state.practiceSession.reason || "Sin razon registrada.")}</p>
      ${state.practiceSession.reusedConcept
        ? `<div class="tag good">Se reutilizo una memoria de concepto ya registrada.</div>`
        : ""}
    </div>
  `;
}

function renderKnownConceptChips(limit = 8) {
  const concepts = knownConcepts(state.profile).slice(0, limit);
  if (!concepts.length) {
    return `<div class="empty-state">Aun no hay conceptos registrados para este estudiante.</div>`;
  }

  return `
    <div class="chip-wrap">
      ${concepts.map((concept) => `
        <span class="tag ${concept.status === "known" ? "good" : ""}">${escapeHtml(concept.topic)}</span>
      `).join("")}
    </div>
  `;
}

function renderStudyTrail(trail = []) {
  if (!trail.length) return "";

  return `
    <div class="study-trail">
      ${trail.map((item, index) => `
        <div class="trail-node">
          <span class="trail-index">${index + 1}</span>
          <span>${escapeHtml(item)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderStudyGameCard(card, gameState) {
  if (card.gameType !== "match-pairs") {
    return `<div class="empty-state">Este tipo de juego aun no tiene render, pero la estructura ya permite agregar nuevas variantes.</div>`;
  }

  const placements = gameState?.placements || {};
  const assignedIds = new Set(Object.values(placements).filter(Boolean));
  const availableOptions = (gameState?.options || []).filter((option) => !assignedIds.has(option.id));

  return `
    <div class="game-card">
      <p class="muted">${escapeHtml(card.instructions || "Relaciona cada idea con su descripcion.")}</p>
      <div class="match-grid">
        <div class="match-column">
          ${(gameState?.pairs || []).map((pair) => {
            const placed = placements[pair.leftId];
            const option = (gameState.options || []).find((item) => item.id === placed);
            return `
              <div class="match-row">
                <div class="match-left">${escapeHtml(pair.left)}</div>
                <div class="match-dropzone" data-dropzone="match" data-game-id="${escapeHtml(card.id)}" data-left-id="${escapeHtml(pair.leftId)}">
                  ${option
                    ? `<span class="match-chip placed">${escapeHtml(option.text)}</span>
                       <button class="ghost-btn tiny" data-action="remove-match" data-game-id="${escapeHtml(card.id)}" data-left-id="${escapeHtml(pair.leftId)}">Quitar</button>`
                    : `<span class="muted">Suelta aqui</span>`}
                </div>
              </div>
            `;
          }).join("")}
        </div>
        <div class="match-column">
          <div class="match-bank">
            ${availableOptions.length
              ? availableOptions.map((option) => `
                  <div
                    class="match-chip"
                    draggable="true"
                    data-game-id="${escapeHtml(card.id)}"
                    data-game-option-id="${escapeHtml(option.id)}"
                  >${escapeHtml(option.text)}</div>
                `).join("")
              : `<div class="empty-state">Todos los conceptos ya fueron colocados.</div>`}
          </div>
        </div>
      </div>
      ${gameState?.completed ? `<div class="tag good">Juego completado. El concepto quedo marcado como conocido.</div>` : ""}
      ${gameState?.feedback ? `<p class="muted">${escapeHtml(gameState.feedback)}</p>` : ""}
    </div>
  `;
}

function renderDeckCard(card) {
  if (card.kind === "concept") {
    return `
      <article class="card study-card">
        <p class="tag">1. Concepto</p>
        <h4>${escapeHtml(card.title)}</h4>
        <div class="study-copy">${formatRichText(card.body)}</div>
        ${card.checkPrompt ? `<p class="muted">${escapeHtml(card.checkPrompt)}</p>` : ""}
      </article>
    `;
  }

  if (card.kind === "example") {
    return `
      <article class="card study-card">
        <p class="tag">2. Ejemplo</p>
        <h4>${escapeHtml(card.title)}</h4>
        <div class="study-copy">${formatRichText(card.body)}</div>
        ${card.example ? `<div class="example-box">${formatRichText(card.example)}</div>` : ""}
        ${card.prompt ? `<p class="muted">${escapeHtml(card.prompt)}</p>` : ""}
      </article>
    `;
  }

  if (card.kind === "game") {
    const gameState = state.practiceSession?.gameState?.[card.id];
    return `
      <article class="card study-card">
        <p class="tag">3. Juego</p>
        <h4>${escapeHtml(card.title)}</h4>
        <div class="study-copy">${formatRichText(card.body)}</div>
        ${renderStudyGameCard(card, gameState)}
      </article>
    `;
  }

  return `
    <article class="card study-card">
      <h4>${escapeHtml(card.title || "Tarjeta")}</h4>
      <div class="study-copy">${formatRichText(card.body || "")}</div>
    </article>
  `;
}

function renderExerciseStep(step, index) {
  const inputValue = state.practiceSession?.stepInputs?.[step.id] || "";
  const result = state.practiceSession?.stepResults?.[step.id] || null;
  const hintOpen = Boolean(state.practiceSession?.openHints?.[step.id]);

  return `
    <article class="card step-card ${result?.correct ? "done" : ""}">
      <div class="card-head">
        <div>
          <p class="tag">Paso ${index + 1}</p>
          <h4 style="margin:8px 0 4px;">${escapeHtml(step.title)}</h4>
        </div>
        ${result?.correct ? `<span class="tag good">Correcto</span>` : ""}
      </div>
      <p>${escapeHtml(step.prompt)}</p>
      <textarea data-step-input-id="${escapeHtml(step.id)}" placeholder="Completa este paso...">${escapeHtml(inputValue)}</textarea>
      <div class="row">
        <button class="btn primary" data-action="check-step" data-step-id="${escapeHtml(step.id)}">Comprobar</button>
        <button class="btn secondary" data-action="toggle-step-hint" data-step-id="${escapeHtml(step.id)}">${hintOpen ? "Ocultar pista" : "Mostrar pista"}</button>
      </div>
      ${hintOpen ? `<p class="muted">${escapeHtml(step.hint || "Sin pista disponible.")}</p>` : ""}
      ${result?.message ? `<p class="muted">${escapeHtml(result.message)}</p>` : ""}
      ${result?.correct ? `<div class="study-copy">${formatRichText(step.explanation || "")}</div>` : ""}
    </article>
  `;
}

function renderPracticeSession() {
  const session = state.practiceSession;
  if (!session) {
    return "";
  }

  return `
    <section class="practice-session stack">
      ${session.kind === "non_math"
        ? `<div class="empty-state">La ultima pregunta se detecto como no relacionada con matematicas, asi que el tutor no construyo un recorrido de estudio.</div>`
        : ""}
      ${session.deck
        ? `
          <section class="hero-card stack">
            <div class="card-head">
              <div>
                <h3 style="margin:0;">Tarjetas de estudio</h3>
                <p class="muted">${escapeHtml(session.deck.topic)}</p>
              </div>
              <span class="tag">${session.deck.cards.length} tarjetas</span>
            </div>
            ${renderStudyTrail(session.deck.focusTrail)}
            <div class="study-card-grid">
              ${session.deck.cards.map((card) => renderDeckCard(card)).join("")}
            </div>
          </section>
        `
        : ""}
      ${session.solution
        ? `
          <section class="hero-card stack">
            <div class="card-head">
              <div>
                <h3 style="margin:0;">Solucion guiada</h3>
                <p class="muted">${escapeHtml(session.solution.exercise || session.topic)}</p>
              </div>
              <span class="tag">${session.solution.steps.length} pasos</span>
            </div>
            <div class="step-grid">
              ${session.solution.steps.map((step, index) => renderExerciseStep(step, index)).join("")}
            </div>
            <div class="card">
              <strong>Reflexion final</strong>
              <p class="muted">${escapeHtml(session.solution.finalReflection || "Comprueba que cada paso tenga sentido antes de seguir al siguiente ejercicio.")}</p>
            </div>
          </section>
        `
        : ""}
    </section>
  `;
}

function renderPracticePage() {
  const readiness = inferenceReadiness();

  return `
    <div class="stack">
      <section class="hero-card">
        <div class="row">
          <div>
            <h2>Estudio guiado con Ollama</h2>
            <p class="muted">Primero clasifico la pregunta. Luego genero tarjetas de concepto o pasos guiados segun corresponda.</p>
          </div>
          <span class="tag ${state.ollama.ok ? "good" : ""}">${escapeHtml(state.settings.currentModel || "Sin modelo")}</span>
        </div>
        <div class="row">
          ${Object.entries(modeLabels).map(([key, label]) => `
            <button class="chip-btn ${state.practiceMode === key ? "active" : ""}" data-action="practice-mode" data-mode="${key}">${label}</button>
          `).join("")}
        </div>
        <p class="muted">${escapeHtml(state.ollama.message || readiness.reason || "")}</p>
      </section>
      <section class="split">
        <div class="chat-card">
          <div class="chat-feed">
            ${renderTranscript()}
            ${state.isThinking ? `<div class="typing"><span></span><span></span><span></span></div>` : ""}
          </div>
          ${!readiness.ready ? `<div class="empty-state">${escapeHtml(readiness.reason)}</div>` : ""}
          <form class="composer" data-form="chat">
            <textarea id="chat-input" name="question" placeholder="Escribe una duda de matematicas, un concepto o un ejercicio..." ${(state.isThinking || !readiness.ready) ? "disabled" : ""}></textarea>
            <button class="btn primary" type="submit" ${(state.isThinking || !readiness.ready) ? "disabled" : ""}>Preguntar</button>
          </form>
        </div>
        <aside class="workflow-card stack">
          <div>
            <h3 style="margin-top:0;">Workflow activo</h3>
            <p class="muted">1. Clasifico la pregunta. 2. Reviso si el concepto ya fue estudiado. 3. Genero tarjetas o pasos para completar.</p>
          </div>
          ${renderSessionSummary()}
          <div class="card stack">
            <strong>Conceptos del estudiante</strong>
            ${renderKnownConceptChips()}
          </div>
          ${[
            "Explicame el concepto de fracciones equivalentes",
            "Resuelve 3x + 5 = 20 paso a paso",
            "Ayudame con un ejercicio de area de triangulos"
          ].map((prompt) => `
            <button class="btn secondary" data-action="quick-prompt" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>
          `).join("")}
        </aside>
      </section>
      ${renderPracticeSession()}
    </div>
  `;
}

function renderProfilePage() {
  const summary = currentSummary();
  if (!summary.onboardingCompleted) {
    return renderOnboarding();
  }

  const suggestion = currentSuggestion();
  const conceptItems = knownConcepts(state.profile).slice(0, 8);
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
        <article class="stats-card"><p class="muted">Conceptos</p><strong>${summary.knownConcepts}</strong><span class="muted">temas registrados</span></article>
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
          <div class="card stack">
            <strong>Conceptos registrados</strong>
            ${conceptItems.length
              ? conceptItems.map((item) => `<span class="tag ${item.status === "known" ? "good" : ""}">${escapeHtml(item.topic)}</span>`).join("")
              : `<div class="empty-state">Aun no hay conceptos guardados.</div>`}
          </div>
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

  return `
    <div class="modal">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h3 style="margin:0;">Preferencias</h3>
            <p class="muted">Configura Ollama, selecciona el modelo activo y el modo por defecto.</p>
          </div>
          <button class="ghost-btn" data-action="close-settings">Cerrar</button>
        </div>
        <div class="stack">
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
              <select data-settings-field="currentModel">
                <option value="">Selecciona un modelo</option>
                ${state.availableModels.map((model) => `
                  <option value="${escapeHtml(model.name)}" ${draft.currentModel === model.name ? "selected" : ""}>${escapeHtml(model.name)}</option>
                `).join("")}
              </select>
            </label>
            <p class="muted">${escapeHtml(state.ollama.message)}</p>
            <div class="row">
              <button class="btn secondary" data-action="refresh-models">Actualizar modelos</button>
            </div>
          </div>
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

function buildFallbackClassifier(question = "") {
  const text = String(question || "").toLowerCase();
  const exercise = /(resuelve|resolver|ejercicio|ecuacion|calcula|halla|encuentra|resultado|simplifica|deriva|integra)/.test(text);

  return {
    kind: exercise ? "exercise" : "concept",
    topic: question,
    conceptTopic: question,
    relatedTopics: [],
    reason: exercise
      ? "Se detecto lenguaje de resolucion o practica."
      : "Se detecto una solicitud de explicacion conceptual."
  };
}

function normalizeClassifierPayload(raw, question = "") {
  const fallback = buildFallbackClassifier(question);
  const kind = raw?.kind === "exercise" || raw?.kind === "concept" || raw?.kind === "non_math"
    ? raw.kind
    : fallback.kind;

  return {
    kind,
    topic: String(raw?.topic || fallback.topic || question).trim() || question,
    conceptTopic: String(raw?.conceptTopic || raw?.topic || fallback.conceptTopic || question).trim() || question,
    relatedTopics: uniqueList(raw?.relatedTopics || fallback.relatedTopics || []),
    reason: String(raw?.reason || fallback.reason || "Sin razon disponible.").trim()
  };
}

function fallbackStudyDeck(question, classification) {
  const concept = classification.conceptTopic || classification.topic || question;
  return {
    topic: concept,
    focusTrail: uniqueList([concept]),
    relatedTopics: uniqueList(classification.relatedTopics || []),
    cards: [
      {
        id: `${slugify(concept)}-concept`,
        kind: "concept",
        title: `Idea clave de ${concept}`,
        body: `Este concepto ayuda a responder la pregunta: ${question}. Empieza identificando que representa y cuando se usa.`,
        checkPrompt: "Explicalo con tus palabras antes de seguir."
      },
      {
        id: `${slugify(concept)}-example`,
        kind: "example",
        title: `Ejemplo de ${concept}`,
        body: "Observa un ejemplo sencillo y compara cada paso con la idea principal.",
        example: `Relaciona ${concept} con un caso pequeno y describe por que funciona.`,
        prompt: "Que cambia y que permanece igual en el ejemplo?"
      },
      {
        id: `${slugify(concept)}-game`,
        kind: "game",
        title: "Conecta ideas",
        body: "Relaciona cada concepto con su descripcion. Esta tarjeta queda preparada para sumar otros tipos de juegos mas adelante.",
        gameType: "match-pairs",
        instructions: "Arrastra cada idea hacia su descripcion.",
        pairs: [
          { left: concept, right: "Idea central del tema" },
          { left: "Ejemplo", right: "Caso concreto que muestra como aplicar la idea" },
          { left: "Relacion", right: "Conexion entre definicion y uso" }
        ]
      }
    ]
  };
}

function normalizeStudyDeck(raw, question, classification) {
  const fallback = fallbackStudyDeck(question, classification);
  const cards = Array.isArray(raw?.cards) ? raw.cards : fallback.cards;

  return {
    topic: String(raw?.topic || fallback.topic).trim() || fallback.topic,
    focusTrail: uniqueList(raw?.focusTrail || fallback.focusTrail),
    relatedTopics: uniqueList(raw?.relatedTopics || classification.relatedTopics || fallback.relatedTopics),
    cards: cards.map((card, index) => ({
      id: slugify(card.id || `${raw?.topic || fallback.topic}-card-${index + 1}`) || `card-${index + 1}`,
      kind: card.kind || (index === 0 ? "concept" : index === 1 ? "example" : "game"),
      title: String(card.title || `Tarjeta ${index + 1}`).trim(),
      body: String(card.body || "").trim(),
      checkPrompt: String(card.checkPrompt || "").trim(),
      example: String(card.example || "").trim(),
      prompt: String(card.prompt || "").trim(),
      gameType: card.gameType || "",
      instructions: String(card.instructions || "").trim(),
      pairs: Array.isArray(card.pairs)
        ? card.pairs
            .map((pair) => ({
              left: String(pair?.left || "").trim(),
              right: String(pair?.right || "").trim()
            }))
            .filter((pair) => pair.left && pair.right)
        : []
    }))
  };
}

function fallbackExercisePlan(question, classification) {
  const concept = classification.conceptTopic || classification.topic || question;
  return {
    topic: classification.topic || concept,
    conceptTopic: concept,
    exercise: question,
    steps: [
      {
        id: `${slugify(question)}-step-1`,
        title: "Identifica el dato clave",
        prompt: "Escribe cual es la informacion principal que te da el ejercicio.",
        acceptedAnswers: ["dato", "datos", "informacion", "variable"],
        hint: "Busca numeros, relaciones o expresiones importantes.",
        explanation: "Antes de resolver, conviene reconocer que informacion esta disponible."
      },
      {
        id: `${slugify(question)}-step-2`,
        title: "Elige la operacion o estrategia",
        prompt: "Indica que operacion, propiedad o estrategia vas a usar.",
        acceptedAnswers: [concept, "sumar", "restar", "multiplicar", "dividir", "despejar"],
        hint: "Conecta el problema con el concepto principal.",
        explanation: "La estrategia debe estar alineada con el concepto o propiedad que resuelve la situacion."
      },
      {
        id: `${slugify(question)}-step-3`,
        title: "Cierra la respuesta",
        prompt: "Escribe como verificarias el resultado o que conclusion obtienes.",
        acceptedAnswers: ["verificar", "comprobar", "respuesta", "resultado"],
        hint: "Piensa si el resultado tiene sentido en el contexto del ejercicio.",
        explanation: "Comprobar el resultado evita errores de signo, escala o interpretacion."
      }
    ],
    finalReflection: "Repasa que concepto te permitio elegir la estrategia correcta."
  };
}

function normalizeExercisePlan(raw, question, classification) {
  const fallback = fallbackExercisePlan(question, classification);
  const steps = Array.isArray(raw?.steps) ? raw.steps : fallback.steps;

  return {
    topic: String(raw?.topic || fallback.topic).trim() || fallback.topic,
    conceptTopic: String(raw?.conceptTopic || fallback.conceptTopic).trim() || fallback.conceptTopic,
    exercise: String(raw?.exercise || fallback.exercise).trim() || fallback.exercise,
    steps: steps.map((step, index) => ({
      id: slugify(step.id || `${fallback.topic}-step-${index + 1}`) || `step-${index + 1}`,
      title: String(step.title || `Paso ${index + 1}`).trim(),
      prompt: String(step.prompt || "").trim(),
      acceptedAnswers: uniqueList(step.acceptedAnswers || []).map((item) => item.trim()).filter(Boolean),
      hint: String(step.hint || "").trim(),
      explanation: String(step.explanation || "").trim()
    })),
    finalReflection: String(raw?.finalReflection || fallback.finalReflection).trim()
  };
}

function buildGameState(deck) {
  const gameState = {};

  for (const card of deck.cards || []) {
    if (card.kind !== "game" || card.gameType !== "match-pairs" || !card.pairs.length) {
      continue;
    }

    const pairs = card.pairs.map((pair, index) => ({
      leftId: `${card.id}-left-${index + 1}`,
      left: pair.left,
      optionId: `${card.id}-option-${index + 1}`,
      right: pair.right
    }));

    gameState[card.id] = {
      gameType: "match-pairs",
      pairs,
      options: shuffle(pairs.map((pair) => ({
        id: pair.optionId,
        text: pair.right
      }))),
      placements: {},
      completed: false,
      feedback: ""
    };
  }

  return gameState;
}

function preparePracticeSession({ kind, classification, deck = null, solution = null, reusedConcept = false }) {
  return {
    kind,
    topic: classification.topic,
    conceptTopic: classification.conceptTopic,
    reason: classification.reason,
    relatedTopics: classification.relatedTopics,
    deck,
    solution,
    reusedConcept,
    gameState: deck ? buildGameState(deck) : {},
    stepInputs: {},
    stepResults: {},
    openHints: {}
  };
}

async function persistConceptStudy({ topic, relatedTopics = [], status = "studying", source = "study-card" }) {
  state.profile = trackConceptStudy(state.profile, {
    topic,
    relatedTopics,
    status,
    source
  });
  await window.bridge.saveProfile(state.profile);
}

async function maybeMarkCurrentConceptKnown() {
  const session = state.practiceSession;
  if (!session?.conceptTopic) return;

  state.profile = trackConceptStudy(state.profile, {
    topic: session.conceptTopic,
    relatedTopics: session.relatedTopics,
    status: "known",
    source: session.kind === "exercise" ? "exercise-step" : "game-complete"
  });
  await window.bridge.saveProfile(state.profile);
  render();
}

async function generateStudyDeck(question, classification) {
  const concepts = knownConcepts(state.profile).map((item) => item.topic);
  const answer = await askWithOllama([
    { role: "system", content: studyDeckPrompt },
    {
      role: "user",
      content: buildStudyDeckUserPrompt({
        question,
        topic: classification.topic,
        conceptTopic: classification.conceptTopic,
        relatedTopics: classification.relatedTopics,
        knownConcepts: concepts
      })
    }
  ]);

  return normalizeStudyDeck(safeJsonParse(answer, {}), question, classification);
}

async function generateExercisePlan(question, classification) {
  const concepts = knownConcepts(state.profile).map((item) => item.topic);
  const answer = await askWithOllama([
    { role: "system", content: exerciseTutorPrompt },
    {
      role: "user",
      content: buildExerciseTutorUserPrompt({
        question,
        topic: classification.topic,
        conceptTopic: classification.conceptTopic,
        relatedTopics: classification.relatedTopics,
        knownConcepts: concepts,
        mode: state.practiceMode
      })
    }
  ]);

  return normalizeExercisePlan(safeJsonParse(answer, {}), question, classification);
}

async function handleStudyQuestion(question) {
  const registeredConcepts = knownConcepts(state.profile).map((item) => item.topic);
  const classificationText = await askWithOllama([
    { role: "system", content: studyClassifierPrompt },
    { role: "user", content: buildClassifierUserPrompt(question, registeredConcepts) }
  ]);
  const classification = normalizeClassifierPayload(safeJsonParse(classificationText, {}), question);

  if (classification.kind === "non_math") {
    state.practiceSession = preparePracticeSession({
      kind: "non_math",
      classification,
      reusedConcept: false
    });
    state.chatMessages.push({
      role: "bot",
      text: "Esto no parece una pregunta de matematicas, asi que no active las tarjetas ni la practica guiada."
    });
    return;
  }

  if (classification.kind === "concept") {
    const deck = await generateStudyDeck(question, classification);
    state.practiceSession = preparePracticeSession({
      kind: "concept",
      classification,
      deck
    });
    state.chatMessages.push({
      role: "bot",
      text: `Detecte una duda de concepto sobre ${deck.topic}. Te prepare tarjetas de estudio con explicacion, ejemplo y un juego para conectar ideas.`
    });
    await persistConceptStudy({
      topic: deck.topic,
      relatedTopics: deck.relatedTopics,
      status: "studying",
      source: "concept-deck"
    });
    return;
  }

  const conceptTopic = classification.conceptTopic || classification.topic;
  const reusedConcept = hasStudiedConcept(state.profile, conceptTopic)
    || classification.relatedTopics.some((topic) => hasStudiedConcept(state.profile, topic));
  const deck = reusedConcept ? null : await generateStudyDeck(question, classification);
  const solution = await generateExercisePlan(question, classification);

  state.practiceSession = preparePracticeSession({
    kind: "exercise",
    classification,
    deck,
    solution,
    reusedConcept
  });
  state.chatMessages.push({
    role: "bot",
    text: reusedConcept
      ? `Detecte un ejercicio sobre ${classification.topic}. Como ya habia memoria previa para ${conceptTopic}, fui directo a la solucion guiada por pasos.`
      : `Detecte un ejercicio sobre ${classification.topic}. Primero te prepare las tarjetas del concepto ${conceptTopic} y luego una solucion paso a paso para completar.`
  });

  if (deck) {
    await persistConceptStudy({
      topic: deck.topic,
      relatedTopics: deck.relatedTopics,
      status: "studying",
      source: "exercise-bridge"
    });
  }
}

async function runTextExplanation() {
  if (!state.selectedText || !inferenceReadiness().ready) return;

  state.explanation = { open: true, busy: true, cards: [] };
  state.lessonUi.contextMenu = { ...state.lessonUi.contextMenu, open: false };
  syncLessonUi();

  try {
    const answer = await askWithOllama([
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

  syncLessonUi();
}

async function runImageExplanation() {
  if (!state.lessonUi.cropRect || !currentModelSupportsVision() || !inferenceReadiness().ready) return;

  const frame = document.getElementById("lesson-frame");
  if (!frame) return;

  state.explanation = { open: true, busy: true, cards: [] };
  state.lessonUi.cropAction = { ...state.lessonUi.cropAction, open: false };
  syncLessonUi();

  try {
    const frameBounds = frame.getBoundingClientRect();
    const capture = await window.bridge.captureRegion({
      x: frameBounds.left + state.lessonUi.cropRect.x,
      y: frameBounds.top + state.lessonUi.cropRect.y,
      width: state.lessonUi.cropRect.width,
      height: state.lessonUi.cropRect.height
    });

    const answer = await askWithOllama([
      { role: "system", content: visionExplainPrompt },
      {
        role: "user",
        content: buildExplainImageUserPrompt(),
        images: [capture.base64]
      }
    ]);

    state.explanation = {
      open: true,
      busy: false,
      cards: parseExplanationCards(answer, "Recorte visual")
    };
  } catch (error) {
    state.explanation = {
      open: true,
      busy: false,
      cards: fallbackExplanationCards(`[Error] ${error.message}`, "Recorte visual")
    };
  }

  syncLessonUi();
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
  }

  if (target.dataset.stepInputId && state.practiceSession) {
    state.practiceSession = {
      ...state.practiceSession,
      stepInputs: {
        ...(state.practiceSession.stepInputs || {}),
        [target.dataset.stepInputId]: target.value
      }
    };
  }
}

async function handleSubmit(event) {
  if (event.target.dataset.form !== "chat") return;
  event.preventDefault();

  const question = event.target.question.value.trim();
  const readiness = inferenceReadiness();
  if (!question || state.isThinking || !readiness.ready) return;

  event.target.reset();
  state.chatMessages.push({ role: "user", text: question });
  state.isThinking = true;
  render();

  try {
    await handleStudyQuestion(question);
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
  if (!button) {
    if (closeLessonMenus()) {
      syncLessonUi();
    }
    return;
  }

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
      resetLessonAssistState();
      state.page = "lessons";
    }
  }

  if (action === "close-lesson") {
    state.currentLesson = null;
    state.stageIndex = 0;
    resetLessonAssistState();
  }

  if (action === "lesson-prev" && state.stageIndex > 0) {
    state.stageIndex -= 1;
    resetLessonAssistState();
  }

  if (action === "lesson-next" && state.currentLesson) {
    state.stageIndex = Math.min(state.stageIndex + 1, state.currentLesson.stages.length - 1);
    resetLessonAssistState();
  }

  if (action === "lesson-finish" && state.currentLesson) {
    state.profile = recordLessonCompletion(state.profile, state.selectedUnit, state.currentLesson.title, 5);
    await window.bridge.saveProfile(state.profile);
    state.currentLesson = null;
    state.stageIndex = 0;
    resetLessonAssistState();
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
        resetLessonAssistState();
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
    const modelChanged = nextSettings.currentModel !== state.settings.currentModel;
    const urlChanged = nextSettings.ollamaBaseUrl !== state.settings.ollamaBaseUrl;
    const shouldShowLoading = modelChanged || urlChanged;

    if (shouldShowLoading) {
      openLoadingPanel({
        title: "Preparando el modelo",
        detail: `Espera un momento mientras preparo ${nextSettings.currentModel || "la sesion"} en Ollama.`
      });
    }

    state.settings = nextSettings;
    state.practiceMode = state.settings.responseMode;
    await window.bridge.saveSettings(state.settings);
    state.settingsOpen = false;
    state.settingsDraft = null;

    if (shouldShowLoading) {
      await refreshOllamaModels(state.settings.ollamaBaseUrl);
      await sleep(650);
      closeLoadingPanel();
    }
  }

  if (action === "toggle-crop-mode" && currentModelSupportsVision()) {
    const nextMode = !state.lessonUi.cropMode;
    closeLessonMenus({ clearCrop: !nextMode });
    state.lessonUi.cropMode = nextMode;
    syncLessonUi();
    return;
  }

  if (action === "clear-crop") {
    closeLessonMenus({ clearCrop: true });
    syncLessonUi();
    return;
  }

  if (action === "explain-selection") {
    await runTextExplanation();
    return;
  }

  if (action === "ask-image-selection") {
    await runImageExplanation();
    return;
  }

  if (action === "remove-match" && state.practiceSession) {
    const game = state.practiceSession.gameState?.[button.dataset.gameId];
    if (game) {
      delete game.placements[button.dataset.leftId];
      game.feedback = "";
      game.completed = false;
      render();
      return;
    }
  }

  if (action === "toggle-step-hint" && state.practiceSession) {
    const stepId = button.dataset.stepId;
    const openHints = {
      ...(state.practiceSession.openHints || {}),
      [stepId]: !state.practiceSession.openHints?.[stepId]
    };
    state.practiceSession = { ...state.practiceSession, openHints };
  }

  if (action === "check-step" && state.practiceSession?.solution) {
    const step = state.practiceSession.solution.steps.find((item) => item.id === button.dataset.stepId);
    if (step) {
      const value = state.practiceSession.stepInputs?.[step.id] || "";
      const normalizedValue = normalizeLooseAnswer(value);
      const accepted = (step.acceptedAnswers || []).some((answer) => normalizeLooseAnswer(answer) === normalizedValue);
      const stepResults = {
        ...(state.practiceSession.stepResults || {}),
        [step.id]: accepted
          ? { correct: true, message: "Bien. Ya puedes pasar al siguiente paso." }
          : { correct: false, message: "Todavia no coincide. Usa la pista o reformula la idea principal." }
      };
      state.practiceSession = { ...state.practiceSession, stepResults };

      const allCorrect = state.practiceSession.solution.steps.every((item) => stepResults[item.id]?.correct);
      if (allCorrect) {
        await maybeMarkCurrentConceptKnown();
        return;
      }
    }
  }

  render();
}

function handleDragStart(event) {
  const chip = event.target.closest("[data-game-option-id]");
  if (!chip) return;

  const payload = JSON.stringify({
    gameId: chip.dataset.gameId,
    optionId: chip.dataset.gameOptionId
  });
  event.dataTransfer.setData("text/plain", payload);
  event.dataTransfer.effectAllowed = "move";
}

function handleDragOver(event) {
  const dropzone = event.target.closest("[data-dropzone='match']");
  if (!dropzone) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

async function handleDrop(event) {
  const dropzone = event.target.closest("[data-dropzone='match']");
  if (!dropzone || !state.practiceSession) return;

  event.preventDefault();
  let payload = null;

  try {
    payload = JSON.parse(event.dataTransfer.getData("text/plain"));
  } catch {
    payload = null;
  }

  if (!payload?.gameId || !payload?.optionId || payload.gameId !== dropzone.dataset.gameId) {
    return;
  }

  const game = state.practiceSession.gameState?.[payload.gameId];
  if (!game) return;

  game.placements[dropzone.dataset.leftId] = payload.optionId;

  const hasAllPlacements = game.pairs.every((pair) => game.placements[pair.leftId]);
  if (hasAllPlacements) {
    const correct = game.pairs.every((pair) => game.placements[pair.leftId] === pair.optionId);
    game.completed = correct;
    game.feedback = correct
      ? "Relacionaste correctamente todos los conceptos."
      : "Hay algunas conexiones que no coinciden. Ajustalas y vuelve a intentarlo.";

    if (correct) {
      await maybeMarkCurrentConceptKnown();
      return;
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

async function askWithOllama(messages) {
  if (!state.settings.currentModel) {
    throw new Error("Selecciona un modelo de Ollama.");
  }

  return window.bridge.chat({
    baseUrl: state.settings.ollamaBaseUrl,
    model: state.settings.currentModel,
    messages
  });
}

function wireLessonFrame() {
  const frame = document.getElementById("lesson-frame");
  if (!frame) return;

  frame.srcdoc = decodeURIComponent(frame.dataset.srcdoc);
  frame.addEventListener("load", () => {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    const shell = document.getElementById("lesson-frame-shell");
    if (!doc || !win || !shell) return;

    const syncCropCursor = () => {
      doc.documentElement.classList.toggle("crop-mode", state.lessonUi.cropMode);
      doc.body.classList.toggle("crop-mode", state.lessonUi.cropMode);
    };

    const updateSelection = () => {
      state.selectedText = win.getSelection?.().toString().trim() || "";
    };

    const pointInShell = (clientX, clientY) => ({
      x: clamp(clientX, 0, shell.clientWidth),
      y: clamp(clientY, 0, shell.clientHeight)
    });

    const openContextMenu = (clientX, clientY) => {
      state.lessonUi.contextMenu = {
        open: true,
        x: clamp(clientX + 10, 10, Math.max(10, shell.clientWidth - 220)),
        y: clamp(clientY + 10, 10, Math.max(10, shell.clientHeight - 80))
      };
      state.lessonUi.cropAction = { ...state.lessonUi.cropAction, open: false };
      syncLessonUi();
    };

    const finalizeCrop = (clientX, clientY) => {
      const start = state.lessonUi.dragStart;
      state.lessonUi.dragStart = null;
      if (!start) return;

      const end = pointInShell(clientX, clientY);
      const rect = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y)
      };

      if (rect.width < 24 || rect.height < 24) {
        closeLessonMenus({ clearCrop: true });
        syncCropCursor();
        syncLessonUi();
        return;
      }

      state.lessonUi.cropMode = false;
      state.lessonUi.cropRect = rect;
      state.lessonUi.cropAction = {
        open: currentModelSupportsVision(),
        x: clamp(rect.x + rect.width - 120, 10, Math.max(10, shell.clientWidth - 180)),
        y: clamp(rect.y + rect.height + 12, 10, Math.max(10, shell.clientHeight - 80))
      };
      syncCropCursor();
      syncLessonUi();
    };

    doc.addEventListener("mouseup", updateSelection);
    doc.addEventListener("keyup", updateSelection);
    doc.addEventListener("contextmenu", (event) => {
      updateSelection();
      if (!state.selectedText) return;
      event.preventDefault();
      openContextMenu(event.clientX, event.clientY);
    });
    doc.addEventListener("mousedown", (event) => {
      if (!state.lessonUi.cropMode || event.button !== 0) return;
      event.preventDefault();
      const point = pointInShell(event.clientX, event.clientY);
      state.lessonUi.dragStart = point;
      state.lessonUi.cropRect = { x: point.x, y: point.y, width: 1, height: 1 };
      state.lessonUi.cropAction = { ...state.lessonUi.cropAction, open: false };
      syncLessonUi();
    });
    doc.addEventListener("mousemove", (event) => {
      if (!state.lessonUi.cropMode || !state.lessonUi.dragStart) return;
      event.preventDefault();
      const end = pointInShell(event.clientX, event.clientY);
      const start = state.lessonUi.dragStart;
      state.lessonUi.cropRect = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y)
      };
      syncLessonUi();
    });
    doc.addEventListener("mouseup", (event) => {
      if (!state.lessonUi.cropMode || !state.lessonUi.dragStart) return;
      event.preventDefault();
      finalizeCrop(event.clientX, event.clientY);
    });
    win.addEventListener("scroll", () => {
      state.lessonUi.scroll = { x: win.scrollX, y: win.scrollY };
      state.lessonUi.contextMenu = { ...state.lessonUi.contextMenu, open: false };
      if (state.lessonUi.cropAction.open) {
        state.lessonUi.cropAction = { ...state.lessonUi.cropAction, open: false };
      }
      syncLessonUi();
    }, { passive: true });

    syncCropCursor();
    if (state.lessonUi.scroll.x || state.lessonUi.scroll.y) {
      win.scrollTo(state.lessonUi.scroll.x, state.lessonUi.scroll.y);
    }
    syncLessonUi();
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
