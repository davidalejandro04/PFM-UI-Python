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
  trackConceptStudy,
  trackLessonFlashcards,
  trackStruggleSignal
} from "./utils/profile.mjs";
import {
  completionRatio,
  firstUnseen,
  flattenLessons,
  getLesson,
  unitProgress
} from "./utils/lessons.mjs";
import { wrapStageHtml } from "./utils/content.mjs";
import { resolveAgentModels } from "./utils/agents/model-config.mjs";
import { runTutorPipeline, runTurnPipeline, runProgressPipeline } from "./utils/agents/pipeline.mjs";
import {
  buildKidMathGateUserPrompt,
  buildClassifierUserPrompt,
  buildContextFlashcardUserPrompt,
  buildExerciseTutorUserPrompt,
  buildExerciseTraceUserPrompt,
  buildStudyDeckUserPrompt,
  buildVisualFlashcardUserPrompt,
  contextFlashcardPrompt,
  exerciseTutorPrompt,
  exerciseTracePrompt,
  kidMathGatePrompt,
  modeLabels,
  studyClassifierPrompt,
  studyDeckPrompt
} from "./utils/prompts.mjs";

const ANIMAL_AVATARS = {
  bear:   { emoji: "🐻", bg: "linear-gradient(145deg,#8B5E3C,#6B3A1F)", name: "Oso"    },
  fox:    { emoji: "🦊", bg: "linear-gradient(145deg,#E8700A,#C04A00)", name: "Zorro"  },
  cat:    { emoji: "🐱", bg: "linear-gradient(145deg,#7A7A8A,#4A4A5A)", name: "Gato"   },
  frog:   { emoji: "🐸", bg: "linear-gradient(145deg,#2D8A2D,#1A5E1A)", name: "Rana"   },
  panda:  { emoji: "🐼", bg: "linear-gradient(145deg,#444444,#222222)", name: "Panda"  },
  lion:   { emoji: "🦁", bg: "linear-gradient(145deg,#D4A017,#A87000)", name: "León"   },
  rabbit: { emoji: "🐰", bg: "linear-gradient(145deg,#E8A0B0,#C87090)", name: "Conejo" },
  koala:  { emoji: "🐨", bg: "linear-gradient(145deg,#708090,#485870)", name: "Koala"  },
};

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

// Cuadernos disponibles. Para añadir una nueva materia, agrega una entrada aquí.
// Cada cuaderno tiene su propia sección de lecciones, progreso y tutor.
const CUADERNOS = [
  {
    id: "mates",
    label: "Mi Cuaderno\nde Mates",
    labelHtml: "Mi Cuaderno<br>de Mates",
    subject: "matematicas",
    page: "lessons",
    stickers: ["⭐", "📐", "🔢", "📏"]
  }
  // Próximamente: { id: "lengua", label: "Mi Cuaderno\nde Lengua", ... }
];

const pageMeta = {
  home: {
    title: "Mi cuaderno",
    subtitle: "Aquí puedes aprender a tu ritmo."
  },
  lessons: {
    title: "Lecciones",
    subtitle: "Aquí puedes leer tus lecciones y pedir ayuda cuando algo no se entiende."
  },
  practice: {
    title: "Practiquemos",
    subtitle: "Escribe una pregunta o un ejercicio y yo te ayudo a aprenderlo."
  },
  tracking: {
    title: "Mi progreso",
    subtitle: "Aquí puedes ver todo lo que has aprendido."
  },
  profile: {
    title: "Mi perfil",
    subtitle: "Aquí puedes ver tu progreso y tus logros."
  }
};

const DEFAULT_SETTINGS = {
  currentModel: "gemma3:4b",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  responseMode: "coach",
  theme: "light",
  agentMode: true,
  agentRouterModel: "gemma3:4b",
  agentTutorModel: "gemma3:4b",
  agentFunctionModel: "gemma3:4b"
};

const PRACTICE_KIND_LABELS = {
  concept: "Concepto",
  exercise: "Ejercicio",
  non_math: "No relacionado",
  "context-help": "Ayuda textual",
  "visual-help": "Ayuda visual"
};

const PULLABLE_MODELS = ["gemma3:1b", "gemma3:4b"];

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

const VALIDATION_STOPWORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "es",
  "esta",
  "este",
  "hay",
  "la",
  "las",
  "lo",
  "los",
  "para",
  "por",
  "que",
  "se",
  "su",
  "un",
  "una",
  "y"
]);

const state = {
  lessons: [],
  profile: migrateProfile(defaultProfile),
  settings: { ...DEFAULT_SETTINGS },
  availableModels: [],
  ollama: { ok: false, message: "No se encontró la IA. Asegúrate de que Ollama esté en marcha." },
  machineId: "",
  dataPath: "",
  page: "home",
  selectedUnit: null,
  currentLesson: null,
  stageIndex: 0,
  practiceMode: "coach",
  practiceSession: null,
  isThinking: false,
  explanation: { open: false, busy: false, cards: [] },
  flashcards: {
    open: false,
    source: "",
    title: "",
    subtitle: "",
    cards: [],
    index: 0,
    sessionId: null
  },
  settingsOpen: false,
  settingsDraft: null,
  profileDraft: migrateProfile(defaultProfile),
  onboardingStep: 0,
  selectedText: "",
  scrollTarget: null,
  studentPanel: {
    compact: false,
    navigationOpen: true,
    profileOpen: false
  },
  exerciseOverlay: {
    open: false,
    index: 0
  },
  trackingDetail: {
    open: false,
    actionCode: null
  },
  trackingSections: {
    actions: true,
    concepts: false,
    alerts: false,
    flashcards: false,
    sessions: false
  },
  studentAnalysis: {
    open: false,
    busy: false,
    text: ""
  },
  deleteProfileConfirm: false,
  bookPage: 0,
  lessonUi: {
    scroll: { x: 0, y: 0 },
    contextMenu: { open: false, x: 20, y: 20 },
    cropMode: false,
    dragStart: null,
    cropRect: null,
    cropAction: { open: false, x: 20, y: 20 },
    hint: ""
  },
  loadingPanel: {
    open: true,
    title: "Preparando tu cuaderno",
    detail: "Un momento... Estoy preparando todo para ti.",
    cancelable: false,
    requestId: ""
  }
};

const cancelledRequestIds = new Set();

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

function validationTokens(value = "") {
  return uniqueList(
    stripAccents(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 1 && !VALIDATION_STOPWORDS.has(item))
  );
}

function overlapRatio(tokens = [], reference = []) {
  if (!tokens.length || !reference.length) return 0;
  const tokenSet = new Set(tokens);
  const matches = reference.filter((token) => tokenSet.has(token)).length;
  return matches / reference.length;
}

function numericTokenRatio(tokens = [], reference = []) {
  const referenceNumbers = reference.filter((token) => /\d/.test(token));
  if (!referenceNumbers.length) return 0;
  return overlapRatio(tokens, referenceNumbers);
}

function evaluateStepAnswer(step, answer = "") {
  const trimmed = String(answer || "").trim();
  if (!trimmed || trimmed.length < 3) {
    return { result: "ambiguous", confidence: 0 };
  }

  const normalizedValue = normalizeLooseAnswer(trimmed);
  const normalizedAccepted = uniqueList(step.acceptedAnswers || [])
    .map((item) => normalizeLooseAnswer(item))
    .filter(Boolean);

  const exactMatch = normalizedAccepted.some((accepted) => accepted && normalizedValue === accepted);
  const containedMatch = normalizedAccepted.some((accepted) => {
    if (!accepted) return false;
    return normalizedValue.includes(accepted) || (normalizedValue.length >= 5 && accepted.includes(normalizedValue));
  });
  if (exactMatch || containedMatch) {
    return { result: "correct", confidence: 1 };
  }

  const answerTokens = validationTokens(trimmed);
  const acceptedTokenSets = (step.acceptedAnswers || [])
    .map((item) => validationTokens(item))
    .filter((tokens) => tokens.length);
  const promptTokens = validationTokens(`${step.title || ""} ${step.prompt || ""}`);
  const bestAcceptedOverlap = acceptedTokenSets.length
    ? Math.max(...acceptedTokenSets.map((tokens) => overlapRatio(answerTokens, tokens)))
    : 0;
  const promptOverlap = overlapRatio(answerTokens, promptTokens);
  const bestNumericOverlap = acceptedTokenSets.length
    ? Math.max(...acceptedTokenSets.map((tokens) => numericTokenRatio(answerTokens, tokens)))
    : 0;

  if (bestAcceptedOverlap >= 0.72) {
    return { result: "correct", confidence: bestAcceptedOverlap };
  }

  if (bestAcceptedOverlap >= 0.45 && (promptOverlap >= 0.35 || bestNumericOverlap >= 0.5)) {
    return { result: "correct", confidence: Math.max(bestAcceptedOverlap, promptOverlap) };
  }

  if (bestAcceptedOverlap >= 0.28 || promptOverlap >= 0.25 || bestNumericOverlap >= 0.5) {
    return { result: "ambiguous", confidence: Math.max(bestAcceptedOverlap, promptOverlap, bestNumericOverlap) };
  }

  return { result: "incorrect", confidence: Math.max(bestAcceptedOverlap, promptOverlap, bestNumericOverlap) };
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

function selectionNeedsMoreContext(text = "") {
  const trimmed = String(text || "").trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  return trimmed.length < 18 || words.length < 4;
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
    reason: settings.currentModel ? "" : "Todavía no hay un modelo de IA activo. Ve a Ajustes para configurarlo."
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

function openLoadingPanel({ title, detail, cancelable = false, requestId = "" }) {
  state.loadingPanel = {
    open: true,
    title: title || "Preparando tu cuaderno",
    detail: detail || "Un momento, casi listo...",
    cancelable,
    requestId
  };
  render();
}

function closeLoadingPanel() {
  if (!state.loadingPanel.open) return;
  state.loadingPanel = {
    ...state.loadingPanel,
    open: false,
    cancelable: false,
    requestId: ""
  };
  render();
}

function isRequestCancelled(requestId = "") {
  return Boolean(requestId) && cancelledRequestIds.has(requestId);
}

function finishRequest(requestId = "") {
  if (!requestId) return;
  cancelledRequestIds.delete(requestId);
  if (state.loadingPanel.requestId === requestId) {
    closeLoadingPanel();
  }
}

async function bootstrap() {
  openLoadingPanel({
    title: "Preparando tu cuaderno",
    detail: "Un momento... Estoy preparando todo para ti."
  });

  const payload = await window.bridge.bootstrap();
  state.lessons = payload.lessons || [];
  state.profile = migrateProfile(payload.profile || defaultProfile);
  state.availableModels = payload.availableModels || [];
  state.ollama = payload.ollama || state.ollama;
  state.settings = normalizeSettings(payload.settings || {}, state.availableModels);
  state.machineId = payload.machineId || "";
  state.dataPath = payload.dataPath || "";
  state.profileDraft = migrateProfile(state.profile);
  state.practiceMode = state.settings.responseMode;
  state.selectedUnit = state.lessons[0]?.unit || null;
  state.page = state.profile.onboardingCompleted ? "lessons" : "profile";

  const requiredModel = payload.requiredModel || "gemma3:1b";
  const hasRequired = state.availableModels.some((m) => m.name === requiredModel);

  if (state.ollama.ok && !hasRequired) {
    await pullModel(requiredModel);
  }

  if (!state.settings.currentModel || !state.availableModels.some((m) => m.name === state.settings.currentModel)) {
    state.settings.currentModel = requiredModel;
  }

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

function renderAnimalAvatar(animalId, size = "md") {
  const animal = ANIMAL_AVATARS[animalId] || ANIMAL_AVATARS.bear;
  return `<div class="animal-avatar animal-avatar-${size}" style="background:${animal.bg};" role="img" aria-label="${animal.name}">${animal.emoji}</div>`;
}

function getProfileAnimal() {
  return state.profile?.avatar && ANIMAL_AVATARS[state.profile.avatar]
    ? state.profile.avatar
    : "bear";
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

function visionModels() {
  return state.availableModels.filter((m) => {
    const haystack = [m.name, m.details?.family, ...(m.details?.families || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return VISION_MODEL_PATTERNS.some((p) => haystack.includes(p));
  });
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
    cropAction: { open: false, x: 20, y: 20 },
    hint: ""
  };
}

function closeLessonMenus({ clearCrop = false } = {}) {
  const hadState = state.lessonUi.contextMenu.open || state.lessonUi.cropAction.open || state.lessonUi.cropMode;
  state.lessonUi.contextMenu = { ...state.lessonUi.contextMenu, open: false };
  state.lessonUi.cropAction = { ...state.lessonUi.cropAction, open: false };
  state.lessonUi.cropMode = false;
  state.lessonUi.dragStart = null;
  state.lessonUi.hint = "";
  if (clearCrop) {
    state.lessonUi.cropRect = null;
  }
  return hadState;
}

function renderLessonOverlay() {
  const parts = [];

  if (state.lessonUi.cropMode || state.lessonUi.hint) {
    parts.push(`<div class="lesson-overlay-hint">${escapeHtml(state.lessonUi.hint || "Arrastra para recortar una imagen, un diagrama o una parte visible de la leccion.")}</div>`);
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

  if (state.lessonUi.cropAction.open && state.lessonUi.cropRect) {
    const vms = visionModels();
    const selectedVisionModel = state.lessonUi.cropAction.visionModel || vms[0]?.name || "";
    const modelOptions = vms.map((m) =>
      `<option value="${m.name}" ${m.name === selectedVisionModel ? "selected" : ""}>${m.name}</option>`
    ).join("");

    parts.push(`
      <div class="lesson-floating-menu" style="left:${state.lessonUi.cropAction.x}px;top:${state.lessonUi.cropAction.y}px;">
        ${vms.length > 0 ? `
          <div class="crop-vision-row">
            <button class="btn primary" data-action="ask-image-selection">¿Qué es esto?</button>
            <select class="crop-model-select" data-action="vision-model-change">
              ${modelOptions}
            </select>
          </div>
        ` : `
          <span class="crop-no-vision">Sin modelo con visión disponible</span>
        `}
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
    cropButton.classList.toggle("active", state.lessonUi.cropMode);
  }
}

function flashcardCountLabel() {
  return `${state.flashcards.index + 1}/${Math.max(1, state.flashcards.cards.length)}`;
}

function openFlashcards({ source = "", title = "", subtitle = "", cards = [], sessionId = null }) {
  state.flashcards = {
    open: true,
    source,
    title,
    subtitle,
    cards,
    index: 0,
    sessionId
  };
}

function closeFlashcards() {
  state.flashcards = {
    open: false,
    source: "",
    title: "",
    subtitle: "",
    cards: [],
    index: 0,
    sessionId: null
  };
}

function maxExerciseOverlayIndex(session = state.practiceSession) {
  if (!session?.solution?.steps?.length) return 0;
  return clamp(Number(session.currentStepIndex || 0), 0, session.solution.steps.length);
}

function openExerciseOverlay(index = maxExerciseOverlayIndex()) {
  if (!state.practiceSession?.solution) return;
  state.exerciseOverlay = {
    open: true,
    index: clamp(index, 0, state.practiceSession.solution.steps.length)
  };
}

function closeExerciseOverlay() {
  state.exerciseOverlay = {
    ...state.exerciseOverlay,
    open: false
  };
}

function renderModalFlashcardCard(card) {
  if (card?.kind) {
    return renderDeckCard(card);
  }

  return `
    <article class="flashcard-panel">
      <p class="tag">${escapeHtml(card?.title || "Tarjeta")}</p>
      <div class="flashcard-copy">${formatRichText(card?.body || "")}</div>
    </article>
  `;
}

function renderFlashcardModal() {
  if (!state.flashcards.open || !state.flashcards.cards.length) return "";

  const card = state.flashcards.cards[state.flashcards.index] || state.flashcards.cards[0];
  const isGameCard = card?.kind === "game";

  return `
    <div class="modal flashcard-modal">
      <div class="modal-card flashcard-modal-card ${isGameCard ? "game-view" : ""}">
        <div class="modal-header">
          <div>
            <span class="tag">${escapeHtml(flashcardCountLabel())}</span>
            <h3 style="margin:10px 0 4px;">${escapeHtml(state.flashcards.title || "Tarjetas")}</h3>
            <p class="muted">${escapeHtml(state.flashcards.subtitle || "")}</p>
          </div>
          <button class="ghost-btn" data-action="close-flashcards">Cerrar</button>
        </div>
        <div class="flashcard-stage ${isGameCard ? "game-view" : ""}">
          <button class="flashcard-arrow" data-action="flashcard-prev" ${state.flashcards.index === 0 ? "disabled" : ""}>←</button>
          <div class="flashcard-content-wrap ${isGameCard ? "game-view" : ""}">
            ${renderModalFlashcardCard(card)}
          </div>
          <button class="flashcard-arrow" data-action="flashcard-next" ${state.flashcards.index >= state.flashcards.cards.length - 1 ? "disabled" : ""}>→</button>
        </div>
      </div>
    </div>
  `;
}

function renderExerciseOverlayModal() {
  const session = state.practiceSession;
  if (!state.exerciseOverlay.open || session?.kind !== "exercise" || !session?.solution) return "";

  const steps = session.solution.steps || [];
  const totalSlides = steps.length + 1;
  const currentIndex = clamp(state.exerciseOverlay.index, 0, Math.max(0, totalSlides - 1));
  const accessibleIndex = maxExerciseOverlayIndex(session);
  const currentStep = steps[currentIndex] || null;
  const isReflection = currentIndex >= steps.length;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < Math.min(accessibleIndex, totalSlides - 1);
  const completedSteps = steps.filter((step) => session.stepResults?.[step.id]?.correct).length;

  return `
    <div class="modal flashcard-modal exercise-modal">
      <div class="modal-card flashcard-modal-card exercise-modal-card">
        <div class="modal-header">
          <div>
            <span class="tag">${currentIndex + 1}/${totalSlides}</span>
            <h3 style="margin:10px 0 4px;">${escapeHtml(session.solution.exercise || session.topic || "Problema guiado")}</h3>
            <p class="muted">${escapeHtml(session.conceptTopic || session.topic || "Tutor local")} · ${completedSteps}/${steps.length} pasos validados</p>
          </div>
          <button class="ghost-btn" data-action="close-exercise-overlay">Cerrar</button>
        </div>
        <div class="flashcard-stage">
          <button class="flashcard-arrow" data-action="exercise-prev" ${canGoPrev ? "" : "disabled"}>&larr;</button>
          <div class="flashcard-content-wrap">
            <article class="flashcard-panel exercise-overlay-panel">
              ${isReflection
                ? `
                  <div class="stack">
                    <p class="tag good">Cierre</p>
                    <h4 style="margin:0;">Reflexion final</h4>
                    <div class="flashcard-copy">${formatRichText(session.solution.finalReflection || "Comprueba que cada paso tenga sentido antes de seguir con otro ejercicio.")}</div>
                    <div class="exercise-progress-note">
                      <strong>Registro local</strong>
                      <p class="muted">Los intentos, pistas y decisiones del tutor ya quedaron asociados al concepto y a esta sesion.</p>
                    </div>
                  </div>
                `
                : `
                  <div class="stack">
                    <p class="tag">Paso ${currentIndex + 1}</p>
                    ${renderExerciseStep(currentStep, currentIndex)}
                    <div class="exercise-progress-note">
                      <strong>Avance secuencial</strong>
                      <p class="muted">Cada respuesta se evalua por separado. La flecha derecha se activa cuando este paso queda validado.</p>
                    </div>
                  </div>
                `}
            </article>
          </div>
          <button class="flashcard-arrow" data-action="exercise-next" ${canGoNext ? "" : "disabled"}>&rarr;</button>
        </div>
      </div>
    </div>
  `;
}

function renderStudentPanel() {
  const summary = currentSummary();
  const compact = state.studentPanel.compact;
  const navChevron = state.studentPanel.navigationOpen ? "▾" : "▸";
  const profileChevron = state.studentPanel.profileOpen ? "▾" : "▸";

  return `
    <div class="student-panel ${compact ? "compact" : ""}">
      <div class="student-panel-brand">
        <div class="student-panel-brand-row">
          <strong>${compact ? "MC" : "Mi cuaderno"}</strong>
          <button class="student-panel-compact" data-action="toggle-panel-compact" title="${compact ? "Expandir panel" : "Compactar panel"}">${compact ? "⇢" : "⇠"}</button>
        </div>
        ${compact ? "" : `<span class="muted">${escapeHtml(summary.displayName)}</span>`}
      </div>
      <button class="student-panel-toggle" data-action="toggle-student-panel" data-section="navigation">
        <span>${compact ? "🧭" : "🧭 Navegacion"}</span>
        <span>${compact ? "" : navChevron}</span>
      </button>
      ${state.studentPanel.navigationOpen
        ? `
          <div class="student-panel-body">
            ${renderNavButton("home", "🏠 Inicio")}
            ${renderNavButton("lessons", "📚 Lecciones")}
            ${renderNavButton("practice", "🧠 Estudio")}
            ${renderNavButton("tracking", "📈 Mi progreso")}
            ${renderNavButton("profile", "🙂 Perfil")}
            <button class="nav-btn settings-entry" data-action="open-settings" title="Ajustes">${compact ? "⚙️" : "⚙️ Ajustes"}</button>
          </div>
        `
        : ""}
      <button class="student-panel-toggle" data-action="toggle-student-panel" data-section="profile">
        <span>${compact ? "🙂" : "🙂 Estudiante"}</span>
        <span>${compact ? "" : profileChevron}</span>
      </button>
      ${state.studentPanel.profileOpen && !compact
        ? `
          <div class="student-panel-body">
            <span class="tag">${escapeHtml(summary.focusArea)}</span>
            <p><strong>${summary.xp} XP</strong> - Nivel ${summary.level}</p>
            <p class="muted">Meta ${summary.dailyGoalProgress}/${summary.dailyGoal} XP</p>
            <p class="muted">Conceptos: ${summary.knownConcepts}</p>
          </div>
        `
        : ""}
    </div>
  `;
}

function recentTutorSessions(limit = 8) {
  return [...(state.profile.tutorSessions || [])]
    .sort((left, right) => String(right.ts || "").localeCompare(String(left.ts || "")))
    .slice(0, limit);
}

function tutorMetrics() {
  const sessions = state.profile.tutorSessions || [];
  const events = sessions.flatMap((session) => session.events || []);
  const attempts = events.filter((event) => event.type === "step-attempt");
  const decisions = events.flatMap((event) => event.decisions || []);
  const flashcardGroups = state.profile.lessonFlashcards || [];

  return {
    sessions: sessions.length,
    struggleSignals: (state.profile.struggleSignals || []).length,
    savedFlashcardGroups: flashcardGroups.length,
    savedFlashcardSets: flashcardGroups.reduce((sum, group) => sum + (group.entries || []).length, 0),
    contextHelps: sessions.filter((session) => session.kind === "context-help" || session.kind === "visual-help").length,
    conceptSessions: sessions.filter((session) => session.kind === "concept").length,
    exerciseSessions: sessions.filter((session) => session.kind === "exercise").length,
    correctAttempts: attempts.filter((attempt) => attempt.result === "correct").length,
    incorrectAttempts: attempts.filter((attempt) => attempt.result === "incorrect").length,
    ambiguousAttempts: attempts.filter((attempt) => attempt.result === "ambiguous").length,
    stepsCompleted: events.filter((event) => event.type === "step-complete").length,
    hintsShown: events.filter((event) => event.type === "hint-open").length,
    decisionsLogged: decisions.length,
    interactionsLogged: (state.profile.interactionLog || []).length,
    feedbackUp: (state.profile.interactionLog || []).filter((e) => e.feedback === "up").length,
    feedbackDown: (state.profile.interactionLog || []).filter((e) => e.feedback === "down").length
  };
}

function conceptMetrics() {
  const buckets = new Map();

  for (const concept of knownConcepts(state.profile)) {
    const key = String(concept.topic || "Sin concepto").trim() || "Sin concepto";
    buckets.set(key, {
      concept: key,
      status: concept.status || "introduced",
      sessions: 0,
      actions: 0,
      conceptSessions: 0,
      exerciseSessions: 0,
      helpSessions: 0,
      struggles: 0,
      correct: 0,
      incorrect: 0,
      ambiguous: 0
    });
  }

  for (const session of state.profile.tutorSessions || []) {
    const key = String(session.conceptTopic || session.topic || "Sin concepto").trim() || "Sin concepto";
    if (!buckets.has(key)) {
      buckets.set(key, {
        concept: key,
        status: "introduced",
        sessions: 0,
        actions: 0,
        conceptSessions: 0,
        exerciseSessions: 0,
        helpSessions: 0,
        struggles: 0,
        correct: 0,
        incorrect: 0,
        ambiguous: 0
      });
    }

    const bucket = buckets.get(key);
    bucket.sessions += 1;
    bucket.actions += (session.events || []).length;
    if (session.kind === "concept") bucket.conceptSessions += 1;
    if (session.kind === "exercise") bucket.exerciseSessions += 1;
    if (session.kind === "context-help" || session.kind === "visual-help") bucket.helpSessions += 1;

    for (const event of session.events || []) {
      if (event.type === "step-attempt") {
        if (event.result === "correct") bucket.correct += 1;
        if (event.result === "incorrect") bucket.incorrect += 1;
        if (event.result === "ambiguous") bucket.ambiguous += 1;
      }
    }
  }

  for (const signal of state.profile.struggleSignals || []) {
    const key = String(signal.conceptTopic || signal.topic || "Sin concepto").trim() || "Sin concepto";
    if (!buckets.has(key)) {
      buckets.set(key, {
        concept: key,
        status: "introduced",
        sessions: 0,
        actions: 0,
        conceptSessions: 0,
        exerciseSessions: 0,
        helpSessions: 0,
        struggles: 0,
        correct: 0,
        incorrect: 0,
        ambiguous: 0
      });
    }

    const bucket = buckets.get(key);
    bucket.struggles += Number(signal.occurrences || 1);
  }

  return [...buckets.values()].sort((left, right) => right.actions - left.actions || right.sessions - left.sessions);
}

function render() {
  root.innerHTML = renderShell();
  modalRoot.innerHTML = [
    state.settingsOpen ? renderSettingsModal() : "",
    renderFlashcardModal(),
    renderExerciseOverlayModal(),
    renderTrackingDetailModal(),
    renderStudentAnalysisModal(),
    state.loadingPanel.open ? renderLoadingPanel() : ""
  ].join("");
  wireLessonFrame();
  syncLessonUi();
  enhanceMath(document.querySelector(".page-content"));
  enhanceMath(document.querySelector(".book-page-main"));
  enhanceMath(document.querySelector(".book-page-reader-content"));
  enhanceMath(document.querySelector(".chat-feed"));
  enhanceMath(document.querySelector(".practice-session"));
  enhanceMath(modalRoot);
  scrollPendingTarget();
}

function scrollPendingTarget() {
  if (!state.scrollTarget) return;
  const target = document.getElementById(state.scrollTarget);
  state.scrollTarget = null;
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderShell() {
  const isClosed = state.page === "home";

  if (isClosed) {
    return renderClosedNotebook();
  }

  return renderOpenNotebook();
}

function renderClosedNotebook() {
  const summary = currentSummary();
  const completed = currentCompletedSet();
  const ratio = completionRatio(state.lessons, completed);
  const profileName = state.profile.name || "Estudiante";
  const concepts = knownConcepts(state.profile);

  return `
    <div class="app-shell-notebook">
      <div class="home-scene">
        <button class="notebook-closed" data-action="nav" data-page="lessons">
          <div class="notebook-back"></div>
          <div class="notebook-pages-edge"></div>
          <div class="notebook-front">
            <div class="notebook-cover-avatar">
              <div class="animal-avatar-cover" style="background:${ANIMAL_AVATARS[getProfileAnimal()]?.bg || ANIMAL_AVATARS.bear.bg};">${ANIMAL_AVATARS[getProfileAnimal()]?.emoji || "🐻"}</div>
            </div>
            <div class="notebook-cover-title">${CUADERNOS[0].labelHtml}</div>
            <div class="notebook-cover-sub">${escapeHtml(profileName)}</div>
            <div class="notebook-cover-sub" style="opacity:0.7;font-size:13px;">${ratio.done}/${ratio.total} lecciones &middot; ${concepts.length} concepto${concepts.length !== 1 ? "s" : ""} &middot; ${summary.xp} XP</div>
            <div class="notebook-band"></div>
            <span class="notebook-cover-deco notebook-cover-sticker" style="position:absolute;top:16px;left:34px;">⭐</span>
            <span class="notebook-cover-deco notebook-cover-sticker" style="position:absolute;bottom:20px;right:40px;">📐</span>
            <span class="notebook-cover-deco notebook-cover-sticker" style="position:absolute;top:20px;right:44px;">🔢</span>
            <span class="notebook-cover-deco notebook-cover-sticker" style="position:absolute;bottom:60px;left:36px;">📏</span>
          </div>
        </button>
        <p style="color:var(--muted);font-size:14px;font-weight:600;">¡Toca el cuaderno para empezar!</p>
      </div>
    </div>
  `;
}

function renderOpenNotebook() {
  const isReading = state.page === "lessons" && state.currentLesson;

  const navTabs = [
    { page: "lessons", icon: "📚", label: "Lecciones" },
    { page: "practice", icon: "🧠", label: "Estudio" },
    { page: "tracking", icon: "📊", label: "Progreso" },
    { page: "profile", icon: "👤", label: "Perfil" }
  ];

  return `
    <div class="app-shell-notebook">
      <div class="book-scene">
        <!-- Navigation sidebar -->
        <nav class="nav-tabs-bar">
          ${navTabs.map((tab) => `
            <button class="nav-tab ${state.page === tab.page ? "active" : ""}" data-action="nav" data-page="${tab.page}">
              <span class="nav-tab-icon">${tab.icon}</span>
              <span class="nav-tab-text">${tab.label}</span>
            </button>
          `).join("")}
          <button class="nav-tab" data-action="open-settings">
            <span class="nav-tab-icon">⚙️</span>
            <span class="nav-tab-text">Config</span>
          </button>
          <div style="flex:1;"></div>
          <button class="nav-tab nav-tab-close" data-action="nav" data-page="home">
            <span class="nav-tab-icon">📕</span>
            <span class="nav-tab-text">Cerrar</span>
          </button>
        </nav>

        <div class="book-body">
          <div class="book-cover">
            <div class="book-spread ${isReading ? "book-spread-reader" : ""}">
              ${isReading ? `
              <!-- Left page: lesson info -->
              <div class="book-page book-page-left">
                ${renderReaderLeftPage()}
              </div>

              <!-- Spine -->
              <div class="book-spine book-spine-reader">
                ${Array.from({ length: 14 }, () => `<div class="spiral-ring"></div>`).join("")}
              </div>
              ` : ""}

              <!-- Right page: main content -->
              <div class="book-page book-page-right ${isReading ? "book-page-reader-content" : "book-page-main"}">
                ${isReading ? renderReaderRightPage() : renderMainContent()}
              </div>
            </div>
          </div>

          ${state.page === "lessons" && !isReading ? renderBookNavFooter() : ""}
        </div>
      </div>
    </div>
  `;
}

function renderInfoLeftPage(meta, summary) {
  const completed = currentCompletedSet();
  const ratio = completionRatio(state.lessons, completed);
  const next = currentSuggestion();
  const profileName = state.profile.name || "Estudiante";

  return `
    <div class="book-header">
      <div class="book-avatar">
        <img src="${avatarMap.tutor}" alt="" />
      </div>
      <div>
        <h2 class="book-title" style="font-size:22px;">${escapeHtml(profileName)}</h2>
        <p class="book-subtitle">Nivel ${summary.level} &middot; ${summary.xp} XP</p>
      </div>
    </div>

    <div class="book-info-section">
      <div class="book-info-row">
        <span class="book-info-label">Lecciones</span>
        <span class="book-info-value">${ratio.done}/${ratio.total}</span>
      </div>
      <div class="progress-bar" style="margin:4px 0 10px;"><span style="width:${ratio.total ? (ratio.done / ratio.total) * 100 : 0}%"></span></div>

      <div class="book-info-row">
        <span class="book-info-label">Meta diaria</span>
        <span class="book-info-value">${summary.dailyGoalProgress}/${summary.dailyGoal} XP</span>
      </div>
      <div class="progress-bar" style="margin:4px 0 10px;"><span style="width:${summary.dailyGoal ? (summary.dailyGoalProgress / summary.dailyGoal) * 100 : 0}%"></span></div>
    </div>

    ${next ? `
      <div class="book-next-hint">
        <span style="font-size:18px;">✨</span>
        <div>
          <div style="font-weight:800;font-size:13px;color:#2c1810;">Siguiente</div>
          <div style="font-size:12px;color:var(--muted);">${escapeHtml(shortTitle(next.title))}</div>
        </div>
      </div>
    ` : `
      <div class="book-next-hint" style="background:linear-gradient(145deg,#edf9da,#ddf0be);border-color:#88c84e;">
        <span style="font-size:18px;">🏆</span>
        <div style="font-weight:800;font-size:13px;color:#3a8a20;">Ruta completa</div>
      </div>
    `}

    <div style="flex:1;"></div>

    <span class="book-deco deco-cloud deco-float" style="bottom:30px;right:12px;">☁️</span>
    <span class="book-deco deco-float" style="bottom:10px;left:10px;font-size:20px;">📐</span>
    <span class="book-page-num">📖</span>
  `;
}

function renderNavButton(key, label) {
  const [icon, ...rest] = String(label).split(" ");
  const text = rest.join(" ").trim();

  return `
    <button class="nav-btn ${state.page === key ? "active" : ""} ${state.studentPanel.compact ? "compact" : ""}" data-action="nav" data-page="${key}" title="${escapeHtml(text || label)}">
      <span class="nav-icon">${escapeHtml(icon)}</span>
      ${state.studentPanel.compact ? "" : `<span>${escapeHtml(text || label)}</span>`}
    </button>
  `;
}

// Lessons page is now handled directly by renderOpenNotebook() — no standalone function needed
function renderLessonsPage() { return ""; }
function renderHomePage() { return ""; }

function shortTitle(title = "") {
  const s = String(title);
  if (s.length <= 20) return s;
  return s.slice(0, 18) + "…";
}

/* ── Modular page renderers for inside the open book ─────────────────── */

function renderMainContent() {
  if (state.page === "lessons") return renderLessonsContent();
  if (state.page === "practice") return `<div class="book-page-scroll">${renderPracticePage()}</div>`;
  if (state.page === "tracking") return `<div class="book-page-scroll">${renderTrackingPage()}</div>`;
  if (state.page === "profile") return `<div class="book-page-scroll">${renderProfilePage()}</div>`;
  return "";
}

function renderBookNavFooter() {
  const allLessons = state.lessons.flatMap((unit) =>
    (unit.lessons || []).map((lesson) => ({ ...lesson, unit: unit.unit }))
  );
  const LESSONS_PER_SPREAD = 6;
  const totalPages = Math.max(1, Math.ceil(allLessons.length / LESSONS_PER_SPREAD));

  const dots = Array.from({ length: totalPages }, (_, i) =>
    `<div class="book-nav-dot ${i === state.bookPage ? "active" : ""}"></div>`
  ).join("");

  return `
    <nav class="book-nav">
      <button class="book-nav-btn" data-action="book-prev" ${state.bookPage === 0 ? "disabled" : ""}>◀</button>
      <div class="book-nav-dots">${dots}</div>
      <button class="book-nav-btn" data-action="book-next" ${state.bookPage >= totalPages - 1 ? "disabled" : ""}>▶</button>
    </nav>
  `;
}

function renderLessonsContent() {
  const completed = currentCompletedSet();
  const next = currentSuggestion();

  if (!state.selectedUnit && state.lessons.length > 0) {
    state.selectedUnit = state.lessons[0].unit;
  }

  const allLessons = state.lessons.flatMap((unit) =>
    (unit.lessons || []).map((lesson) => ({ ...lesson, unit: unit.unit }))
  );

  const LESSONS_PER_SPREAD = 6;
  const totalPages = Math.max(1, Math.ceil(allLessons.length / LESSONS_PER_SPREAD));
  if (state.bookPage >= totalPages) state.bookPage = totalPages - 1;
  if (state.bookPage < 0) state.bookPage = 0;

  const spreadLessons = allLessons.slice(
    state.bookPage * LESSONS_PER_SPREAD,
    (state.bookPage + 1) * LESSONS_PER_SPREAD
  );

  const decos = [
    { cls: "deco-cloud deco-float", style: "top:10px;right:20px;", ch: "☁️" },
    { cls: "deco-numbers", style: "top:14px;left:16px;font-size:22px;", ch: `<span class="num-red">1</span> <span class="num-green">2</span> <span class="num-blue">3</span>` },
    { cls: "deco-float", style: "bottom:20px;right:16px;", ch: "📐" },
    { cls: "deco-float", style: "bottom:14px;left:18px;font-size:18px;", ch: `<span class="num-purple">+</span> <span class="num-orange">×</span> <span class="num-red">÷</span>` }
  ];

  if (spreadLessons.length === 0) {
    return `
      <div class="book-empty">
        <div class="book-empty-icon">📚</div>
        <p>No hay lecciones cargadas todavia.</p>
      </div>
    `;
  }

  return `
    <div class="trail-container-full">
      ${renderLessonTrail(spreadLessons, completed, next)}
      ${decos.map((d) => `<span class="book-deco ${d.cls}" style="${d.style}">${d.ch}</span>`).join("")}
    </div>
  `;
}

function renderLessonTrail(lessons, completed, next) {
  const LESSONS_PER_SPREAD = 6;
  const animal = ANIMAL_AVATARS[getProfileAnimal()] || ANIMAL_AVATARS.bear;

  // Zigzag positions across the full page
  const nodePositions = [
    { x: 12, y: 6 },
    { x: 56, y: 20 },
    { x: 14, y: 37 },
    { x: 60, y: 52 },
    { x: 12, y: 68 },
    { x: 58, y: 83 },
  ];

  // Build SVG dashed path
  let svgPath = "";
  if (lessons.length > 1) {
    const pts = lessons.map((_, i) => nodePositions[i] || nodePositions[0]);
    svgPath = `M ${pts[0].x + 7} ${pts[0].y + 7}`;
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2 + 7;
      const cpy = (pts[i - 1].y + pts[i].y) / 2 + 7 + (i % 2 === 0 ? -6 : 6);
      svgPath += ` Q ${cpx} ${cpy} ${pts[i].x + 7} ${pts[i].y + 7}`;
    }
  }

  // Find current node index for mascot placement
  const currentIdx = lessons.findIndex((lesson) =>
    next && next.unit === lesson.unit && next.title === lesson.title
  );
  const mascotIdx = currentIdx >= 0 ? currentIdx : (lessons.findIndex((l) => !completed.has(`${l.unit}::${l.title}`)));

  return `
    ${svgPath ? `<svg class="trail-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${svgPath}" stroke-dasharray="3 4" /></svg>` : ""}
    ${lessons.map((lesson, i) => {
      const key = `${lesson.unit}::${lesson.title}`;
      const isDone = completed.has(key);
      const isCurrent = next && next.unit === lesson.unit && next.title === lesson.title;
      const status = isDone ? "done" : isCurrent ? "current" : "locked";
      const globalIdx = state.bookPage * LESSONS_PER_SPREAD + i;
      const pos = nodePositions[i] || nodePositions[0];
      const showMascot = i === mascotIdx;

      return `
        <div class="trail-node-positioned" style="top:${pos.y}%;left:${pos.x}%;">
          ${showMascot ? `<div class="trail-mascot" aria-hidden="true">${animal.emoji}</div>` : ""}
          <button class="lesson-node ${status}" data-action="open-lesson" data-unit="${escapeHtml(lesson.unit)}" data-lesson="${escapeHtml(lesson.title)}" aria-label="Lección ${globalIdx + 1}: ${escapeHtml(lesson.title)} — ${status === 'done' ? 'completada' : status === 'current' ? 'siguiente' : 'bloqueada'}">
            <div class="node-circle">
              ${isDone ? `<span class="node-star" aria-hidden="true">⭐</span>` : ""}
              <span aria-hidden="true">${globalIdx + 1}</span>
            </div>
            <div class="node-label">
              <div class="node-label-title">${escapeHtml(shortTitle(lesson.title))}</div>
            </div>
            ${isDone ? `<div class="node-stars" aria-hidden="true"><span>⭐</span><span>⭐</span><span>⭐</span></div>` : ""}
          </button>
        </div>
      `;
    }).join("")}
  `;
}

function renderReaderLeftPage() {
  const lesson = state.currentLesson;
  const stages = lesson.stages || [];

  return `
    <div class="book-header">
      ${renderAnimalAvatar(getProfileAnimal(), "sm")}
      <div>
        <h2 class="book-title" style="font-size:18px;">${escapeHtml(lesson.title)}</h2>
        <p class="book-subtitle">${escapeHtml(state.selectedUnit || "")}</p>
      </div>
    </div>
    <div class="reader-stage-indicator">
      <div class="tag">Etapa ${state.stageIndex + 1} de ${stages.length}</div>
      <div class="progress-bar" style="margin-top:10px;"><span style="width:${((state.stageIndex + 1) / stages.length) * 100}%"></span></div>
    </div>
    <div class="reader-stages-list">
      ${stages.map((s, i) => `
        <div class="reader-stage-item ${i === state.stageIndex ? "active" : ""} ${i < state.stageIndex ? "done" : ""}">
          <span class="reader-stage-dot">${i < state.stageIndex ? "✓" : i + 1}</span>
          <span class="reader-stage-name">${escapeHtml(s.title || `Etapa ${i + 1}`)}</span>
        </div>
      `).join("")}
    </div>
    <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px;">
      <button class="btn secondary" data-action="close-lesson" style="flex:1;">◀ Volver</button>
    </div>
  `;
}

function renderReaderRightPage() {
  const lesson = state.currentLesson;
  const stages = lesson.stages || [];
  const stage = stages[state.stageIndex] || { html: "<p>Sin contenido.</p>" };
  const iframeHtml = wrapStageHtml(stage.html, lesson.title, state.stageIndex + 1, stages.length);

  return `
    <div class="reader-frame-shell" id="lesson-frame-shell">
      <div class="lesson-tool-dock">
        <button class="icon-action-btn ${state.lessonUi.cropMode ? "active" : ""}" data-action="toggle-crop-mode" title="Recortar imagen" aria-label="Recortar imagen">✂️</button>
      </div>
      <iframe id="lesson-frame" title="Leccion" data-srcdoc="${encodeURIComponent(iframeHtml)}"></iframe>
      <div class="lesson-overlay" id="lesson-overlay">${renderLessonOverlay()}</div>
    </div>
    <div class="row" style="margin-top:8px;justify-content:space-between;">
      <button class="book-nav-btn" data-action="lesson-prev" ${state.stageIndex === 0 ? "disabled" : ""} style="width:40px;height:40px;font-size:16px;">◀</button>
      ${state.stageIndex < stages.length - 1
        ? `<button class="btn primary" data-action="lesson-next" style="flex:1;margin:0 8px;">Siguiente etapa</button>`
        : `<button class="btn primary" data-action="lesson-finish" style="flex:1;margin:0 8px;">Completar leccion 🏆</button>`}
      <button class="book-nav-btn" data-action="lesson-next" ${state.stageIndex >= stages.length - 1 ? "disabled" : ""} style="width:40px;height:40px;font-size:16px;">▶</button>
    </div>
  `;
}

/* Old functions kept as stubs since renderOpenNotebook handles routing */
function renderLessonReader() { return ""; }

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

function renderKnownConceptChips() {
  const concepts = knownConcepts(state.profile);
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
        <section class="match-panel match-panel-targets">
          <div class="match-panel-head">
            <strong>Opciones arriba</strong>
            <span class="muted">Completa cada espacio con la carta correcta.</span>
          </div>
          <div class="match-column">
            ${(gameState?.pairs || []).map((pair) => {
              const placed = placements[pair.leftId];
              const option = (gameState.options || []).find((item) => item.id === placed);
              return `
                <div class="match-row">
                  <div class="match-left">${escapeHtml(pair.left)}</div>
                  <div class="match-dropzone ${option ? "filled" : ""}" data-dropzone="match" data-game-id="${escapeHtml(card.id)}" data-left-id="${escapeHtml(pair.leftId)}">
                    ${option
                      ? `<span class="match-chip placed">${escapeHtml(option.text)}</span>
                         <button class="ghost-btn tiny" data-action="remove-match" data-game-id="${escapeHtml(card.id)}" data-left-id="${escapeHtml(pair.leftId)}">Quitar</button>`
                      : `<span class="muted">Suelta aqui una carta</span>`}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </section>
        <section class="match-panel match-panel-bank">
          <div class="match-panel-head">
            <strong>Cartas para usar</strong>
            <span class="muted">Arrastra una carta desde aqui hacia la opcion correcta.</span>
          </div>
          <div class="match-bank">
            ${availableOptions.length
              ? availableOptions.map((option) => `
                  <div
                    class="match-chip available"
                    draggable="true"
                    data-game-id="${escapeHtml(card.id)}"
                    data-game-option-id="${escapeHtml(option.id)}"
                  >${escapeHtml(option.text)}</div>
                `).join("")
              : `<div class="empty-state">Todos los conceptos ya fueron colocados.</div>`}
          </div>
        </section>
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
  const hintLevel = state.practiceSession?.hintLevels?.[step.id] || 0;
  const hints = step.hintLadder && step.hintLadder.length ? step.hintLadder : [step.hint || "Sin pista disponible."];
  const maxHints = hints.length;
  const hintBtnLabel = hintLevel === 0 ? "Pedir pista" : hintLevel < maxHints ? `Siguiente pista (${hintLevel}/${maxHints})` : "Ocultar pistas";

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
        <button class="btn secondary" data-action="toggle-step-hint" data-step-id="${escapeHtml(step.id)}">${hintBtnLabel}</button>
      </div>
      ${result?.attempts ? `<p class="muted">Intentos en este paso: ${result.attempts}${result.failures ? ` · fallos marcados: ${result.failures}` : ""}</p>` : ""}
      ${hintLevel > 0 ? `<div class="hint-ladder">${hints.slice(0, hintLevel).map((h, i) => `<p class="muted">${i === maxHints - 1 ? "✅" : "💡"} Pista ${i + 1}: ${escapeHtml(h)}</p>`).join("")}</div>` : ""}
      ${result?.message ? `<p class="muted">${escapeHtml(result.message)}</p>` : ""}
      ${result?.message && result?.interactionId ? `
        <div class="feedback-row">
          <span class="muted">¿La evaluacion fue correcta?</span>
          <button class="feedback-btn ${result.feedback === "up" ? "active" : ""}" data-action="feedback-thumb" data-interaction-id="${escapeHtml(result.interactionId)}" data-thumb="up" data-step-id="${escapeHtml(step.id)}">👍</button>
          <button class="feedback-btn ${result.feedback === "down" ? "active" : ""}" data-action="feedback-thumb" data-interaction-id="${escapeHtml(result.interactionId)}" data-thumb="down" data-step-id="${escapeHtml(step.id)}">👎</button>
        </div>
      ` : ""}
      ${result?.correct ? `<div class="study-copy">${formatRichText(step.explanation || "")}</div>` : ""}
    </article>
  `;
}

function renderPracticeSession() {
  const session = state.practiceSession;
  if (!session) {
    return "";
  }

  const currentStepIndex = session.currentStepIndex || 0;
  const currentStep = session.solution?.steps?.[currentStepIndex] || null;
  const stepCount = session.solution?.steps?.length || 0;
  const completedSteps = (session.solution?.steps || []).filter((step) => session.stepResults?.[step.id]?.correct).length;

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
                <h3 style="margin:0;">Tarjetas flotantes</h3>
                <p class="muted">${escapeHtml(session.deck.topic)}</p>
              </div>
              <span class="tag">${session.deck.cards.length} tarjetas</span>
            </div>
            ${renderStudyTrail(session.deck.focusTrail)}
            <div class="row">
              <button class="btn primary" data-action="open-session-flashcards">Abrir tarjetas</button>
            </div>
          </section>
        `
        : ""}
      ${currentStep
        ? `
          <section class="hero-card stack">
            <div class="card-head">
              <div>
                <h3 style="margin:0;">Problema guiado</h3>
                <p class="muted">${escapeHtml(session.solution.exercise || session.topic)}</p>
              </div>
              <span class="tag">${completedSteps}/${stepCount} pasos validados</span>
            </div>
            <p class="muted">El problema se abre como un panel flotante de pasos. Cada respuesta se valida una por una antes de avanzar.</p>
            <div class="row">
              <button class="btn primary" data-action="open-exercise-overlay">${state.exerciseOverlay.open ? "Volver al problema" : "Abrir problema"}</button>
            </div>
            <div class="card tracking-note">
              <strong>Registro invisible</strong>
              <p class="muted">Las decisiones del tutor, tutorias simuladas e intentos del estudiante se guardan localmente y tambien se agregan por concepto.</p>
            </div>
          </section>
        `
        : session.solution
          ? `
            <section class="hero-card stack">
              <div class="card">
                <strong>Ejercicio completado</strong>
                <p class="muted">${escapeHtml(session.solution.finalReflection || "Comprueba que cada paso tenga sentido antes de seguir al siguiente ejercicio.")}</p>
                <div class="row">
                  <button class="btn secondary" data-action="open-exercise-overlay">Reabrir recorrido</button>
                </div>
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
      <section class="hero-card" style="overflow:hidden;padding:0;">
        <div class="page-section-head orange">
          <span style="font-size:28px;">🧠</span>
          <div>
            <div style="font-size:18px;">Practiquemos</div>
            <div style="font-size:12px;opacity:0.85;">Escribe una pregunta o un ejercicio y yo te ayudo.</div>
          </div>
        </div>
        ${readiness.reason ? `<p class="muted" style="padding:8px 20px;margin:0;">${escapeHtml(readiness.reason)}</p>` : ""}
      </section>
      <section class="card stack">
        <div>
          <h3 style="margin:0 0 6px;">¿Qué quieres aprender hoy?</h3>
          <p class="muted">Escribe tu duda o el ejercicio que quieres practicar.</p>
        </div>
        ${!readiness.ready ? `<div class="empty-state">${escapeHtml(readiness.reason)}</div>` : ""}
        <form class="composer" data-form="chat">
          <textarea id="chat-input" name="question" placeholder="Escribe tu pregunta aquí..." ${(state.isThinking || !readiness.ready) ? "disabled" : ""}></textarea>
          <button class="btn primary" type="submit" ${(state.isThinking || !readiness.ready) ? "disabled" : ""}>¡Vamos!</button>
        </form>
        ${state.isThinking ? `<div class="typing"><span></span><span></span><span></span></div>` : ""}
      </section>
      <section class="card stack">
        ${renderSessionSummary()}
        <div class="card stack">
          <strong>Conceptos del estudiante</strong>
          ${renderKnownConceptChips()}
        </div>
        <div class="stack">
          <strong>Prueba con estas ideas</strong>
          <p class="muted">Pulsa cualquier idea para empezar a practicar.</p>
          <div class="choice-grid">
          ${[
            "Explicame el concepto de fracciones equivalentes",
            "Resuelve 3x + 5 = 20 paso a paso",
            "Ayudame con un ejercicio de area de triangulos"
          ].map((prompt) => `
            <button class="btn secondary" data-action="quick-prompt" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>
          `).join("")}
          </div>
        </div>
      </section>
      ${renderPracticeSession()}
    </div>
  `;
}

const ACTION_CATALOG = [
  { code: "a1", label: "Feedback correctivo (error detectado)", category: "Feedback", color: "#e74c3c" },
  { code: "a2", label: "Feedback correctivo (explicacion)", category: "Feedback", color: "#e74c3c" },
  { code: "a3", label: "Pista entregada", category: "Pistas", color: "#f39c12" },
  { code: "b1", label: "Confirmar respuesta correcta", category: "Avance", color: "#27ae60" },
  { code: "b2", label: "Avanzar / motivar", category: "Avance", color: "#2ecc71" },
  { code: "c1", label: "Pista media", category: "Pistas", color: "#f1c40f" },
  { code: "c2", label: "Pista fuerte / solucion parcial", category: "Pistas", color: "#e67e22" },
  { code: "c3", label: "Subpregunta de apoyo", category: "Scaffolding", color: "#3498db" },
  { code: "d1", label: "Solicitar aclaracion", category: "Aclaracion", color: "#9b59b6" },
  { code: "d2", label: "Solicitar mas contexto", category: "Aclaracion", color: "#8e44ad" },
  { code: "f1", label: "Clasificacion inicial", category: "Sistema", color: "#95a5a6" },
  { code: "g1", label: "Dar solucion completa", category: "Solucion", color: "#e74c3c" },
  { code: "g2", label: "Paso completado", category: "Avance", color: "#27ae60" },
  { code: "h", label: "Redireccion (fuera de tema)", category: "Redireccion", color: "#7f8c8d" }
];

function renderActionGraph(decisionMap) {
  const maxCount = Math.max(1, ...Object.values(decisionMap));
  const totalDecisions = Object.values(decisionMap).reduce((sum, v) => sum + v, 0);

  if (!totalDecisions) {
    return `<div class="empty-state">¡Todavía no hay datos! Empieza a practicar y aquí verás tus estadísticas.</div>`;
  }

  // Group by category
  const categories = [];
  const seen = new Set();
  for (const item of ACTION_CATALOG) {
    if (!seen.has(item.category)) {
      seen.add(item.category);
      categories.push(item.category);
    }
  }

  return `
    <div class="action-graph">
      ${categories.map((cat) => {
        const items = ACTION_CATALOG.filter((a) => a.category === cat);
        const catTotal = items.reduce((sum, a) => sum + (decisionMap[a.code] || 0), 0);
        if (!catTotal) return "";
        return `
          <div class="action-graph-category">
            <div class="action-graph-category-header">
              <span class="action-graph-category-name">${escapeHtml(cat)}</span>
              <span class="muted">${catTotal}</span>
            </div>
            ${items.map(({ code, label, color }) => {
              const count = decisionMap[code] || 0;
              if (!count) return "";
              const pct = Math.round((count / maxCount) * 100);
              return `
                <button class="action-graph-row" data-action="tracking-action-detail" data-action-code="${escapeHtml(code)}">
                  <span class="action-graph-code" style="background:${color};color:#fff;">${escapeHtml(code)}</span>
                  <span class="action-graph-label">${escapeHtml(label)}</span>
                  <div class="action-graph-bar-wrap">
                    <div class="action-graph-bar" style="width:${pct}%;background:${color};"></div>
                  </div>
                  <span class="action-graph-count">${count}</span>
                </button>
              `;
            }).join("")}
          </div>
        `;
      }).join("")}
      <div class="action-graph-total">
        <span class="muted">Total de acciones registradas:</span>
        <strong>${totalDecisions}</strong>
      </div>
    </div>
  `;
}

function renderStudentAnalysisModal() {
  if (!state.studentAnalysis.open) return "";
  return `
    <div class="modal flashcard-modal">
      <div class="modal-card flashcard-modal-card" style="max-width:740px;">
        <div class="modal-header">
          <div>
            <span class="tag">BETA</span>
            <h3 style="margin:8px 0 4px;">Cómo vas aprendiendo</h3>
            <p class="muted">Generado con IA a partir de tus sesiones de práctica.</p>
          </div>
          <button class="ghost-btn" data-action="close-student-analysis">Cerrar</button>
        </div>
        <div style="max-height:62vh;overflow-y:auto;padding:0 4px;">
          ${state.studentAnalysis.busy
            ? `<div class="empty-state" style="padding:40px 0;">
                <span style="font-size:28px;">🔍</span>
                <p>Analizando interacciones del estudiante...</p>
              </div>`
            : `<div class="student-analysis-text">${formatRichText(state.studentAnalysis.text)}</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderTrackingDetailModal() {
  if (!state.trackingDetail.open || !state.trackingDetail.actionCode) return "";
  const code = state.trackingDetail.actionCode;
  const catalogEntry = ACTION_CATALOG.find((a) => a.code === code);
  const interactions = getInteractionsForAction(code);

  return `
    <div class="modal flashcard-modal">
      <div class="modal-card flashcard-modal-card" style="max-width:700px;">
        <div class="modal-header">
          <div>
            <span class="action-graph-code" style="background:${catalogEntry?.color || "#888"};color:#fff;">${escapeHtml(code)}</span>
            <h3 style="margin:8px 0 4px;">${escapeHtml(catalogEntry?.label || code)}</h3>
            <p class="muted">${interactions.length} interacciones registradas</p>
          </div>
          <button class="ghost-btn" data-action="close-tracking-detail">Cerrar</button>
        </div>
        <div class="stack" style="max-height:60vh;overflow-y:auto;padding:0 4px;">
          ${interactions.length
            ? interactions.map((entry) => `
                <div class="card interaction-card">
                  <div class="interaction-row">
                    <span class="interaction-label">Pregunta</span>
                    <span>${escapeHtml(entry.question || "—")}</span>
                  </div>
                  <div class="interaction-row">
                    <span class="interaction-label">Respuesta</span>
                    <span>${escapeHtml(entry.answer || "—")}</span>
                  </div>
                  <div class="interaction-row">
                    <span class="interaction-label">Accion</span>
                    <span class="tag">${escapeHtml(entry.actionTaken || "—")}</span>
                  </div>
                  <div class="interaction-row">
                    <span class="interaction-label">Feedback</span>
                    <span>${entry.feedback === "up" ? "👍" : entry.feedback === "down" ? "👎" : "—"}</span>
                  </div>
                  <p class="muted" style="margin:4px 0 0;">${escapeHtml(entry.ts ? new Date(entry.ts).toLocaleString() : "")}</p>
                </div>
              `).join("")
            : `<div class="empty-state">No hay interacciones registradas para esta accion.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderTrackingDropdown(key, title, badge, content) {
  const open = state.trackingSections[key] !== false;
  return `
    <section class="tracking-dropdown card">
      <button class="tracking-dropdown-toggle" data-action="toggle-tracking-section" data-section="${escapeHtml(key)}">
        <div class="tracking-dropdown-title">
          <span>${escapeHtml(title)}</span>
          ${badge !== null ? `<span class="tag">${badge}</span>` : ""}
        </div>
        <span class="tracking-dropdown-chevron">${open ? "▾" : "▸"}</span>
      </button>
      ${open ? `<div class="tracking-dropdown-body">${content}</div>` : ""}
    </section>
  `;
}

function renderTrackingPage() {
  const metrics = tutorMetrics();
  const sessions = recentTutorSessions(10);
  const concepts = conceptMetrics();
  const struggleSignals = [...(state.profile.struggleSignals || [])]
    .sort((left, right) => String(right.lastDetectedAt || right.ts || "").localeCompare(String(left.lastDetectedAt || left.ts || "")));
  const lessonFlashcardGroups = [...(state.profile.lessonFlashcards || [])]
    .sort((left, right) => String(right.updatedAt || right.ts || "").localeCompare(String(left.updatedAt || left.ts || "")));
  const decisionMap = (state.profile.tutorSessions || [])
    .flatMap((session) => session.events || [])
    .flatMap((event) => event.decisions || [])
    .reduce((acc, code) => {
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {});

  const analysisDisabled = state.studentAnalysis.busy || !state.settings.currentModel;

  return `
    <div class="stack">
      <section class="hero-card" style="overflow:hidden;padding:0;">
        <div class="page-section-head green">
          <span style="font-size:28px;">📊</span>
          <div>
            <div style="font-size:18px;">Mi progreso</div>
            <div style="font-size:12px;opacity:0.85;">${metrics.sessions} sesiones completadas</div>
          </div>
          <div style="margin-left:auto;">
            <button class="btn secondary" data-action="open-student-analysis" ${analysisDisabled ? "disabled" : ""} style="min-height:36px;padding:6px 14px;font-size:13px;">
              ${state.studentAnalysis.busy ? "Analizando..." : "Ver análisis"}
            </button>
          </div>
        </div>
      </section>
      <section class="stats-row">
        <article class="stats-card"><p class="muted">Ayudas</p><strong>${metrics.contextHelps}</strong><span class="muted">texto + imagen</span></article>
        <article class="stats-card"><p class="muted">Conceptos</p><strong>${metrics.conceptSessions}</strong><span class="muted">sesiones</span></article>
        <article class="stats-card"><p class="muted">Ejercicios</p><strong>${metrics.exerciseSessions}</strong><span class="muted">sesiones guiadas</span></article>
        <article class="stats-card"><p class="muted">Correctas</p><strong>${metrics.correctAttempts}</strong><span class="muted">intentos buenos</span></article>
        <article class="stats-card"><p class="muted">Incorrectas</p><strong>${metrics.incorrectAttempts}</strong><span class="muted">a corregir</span></article>
        <article class="stats-card"><p class="muted">Ambiguas</p><strong>${metrics.ambiguousAttempts}</strong><span class="muted">sin detalles</span></article>
        <article class="stats-card"><p class="muted">Alertas</p><strong>${metrics.struggleSignals}</strong><span class="muted">marcados</span></article>
        <article class="stats-card"><p class="muted">Pasos</p><strong>${metrics.stepsCompleted}</strong><span class="muted">completados</span></article>
        <article class="stats-card"><p class="muted">Acciones</p><strong>${metrics.decisionsLogged}</strong><span class="muted">tomadas</span></article>
        <article class="stats-card"><p class="muted">Interacciones</p><strong>${metrics.interactionsLogged}</strong><span class="muted">registradas</span></article>
        <article class="stats-card"><p class="muted">Feedback</p><strong>👍 ${metrics.feedbackUp} · 👎 ${metrics.feedbackDown}</strong><span class="muted">valoraciones</span></article>
      </section>

      ${renderTrackingDropdown("actions", "Acciones tomadas", `${metrics.decisionsLogged} acciones`, `
        <p class="muted" style="margin-bottom:12px;">Acciones pedagogicas del sistema agente. Haz clic en una barra para ver las interacciones.</p>
        ${renderActionGraph(decisionMap)}
      `)}

      ${renderTrackingDropdown("concepts", "Acumulado por concepto", `${concepts.length} conceptos`, `
        <div class="lesson-grid concept-metric-grid">
          ${concepts.length
            ? concepts.map((concept) => `
                <article class="card concept-metric-card">
                  <div class="card-head">
                    <div>
                      <strong>${escapeHtml(concept.concept)}</strong>
                      <p class="muted">${escapeHtml(concept.status || "introduced")}</p>
                    </div>
                    <span class="tag">${concept.actions} acciones</span>
                  </div>
                  <div class="tracking-metric-row"><span>Sesiones</span><strong>${concept.sessions}</strong></div>
                  <div class="tracking-metric-row"><span>Concepto</span><strong>${concept.conceptSessions}</strong></div>
                  <div class="tracking-metric-row"><span>Ejercicio</span><strong>${concept.exerciseSessions}</strong></div>
                  <div class="tracking-metric-row"><span>Ayudas</span><strong>${concept.helpSessions}</strong></div>
                  <div class="tracking-metric-row"><span>Alertas</span><strong>${concept.struggles}</strong></div>
                  <div class="tracking-metric-row"><span>Correctas</span><strong>${concept.correct}</strong></div>
                  <div class="tracking-metric-row"><span>Incorrectas</span><strong>${concept.incorrect}</strong></div>
                  <div class="tracking-metric-row"><span>Ambiguas</span><strong>${concept.ambiguous}</strong></div>
                </article>
              `).join("")
            : `<div class="empty-state">Todavia no hay conceptos con acciones registradas.</div>`}
        </div>
      `)}

      ${renderTrackingDropdown("alerts", "Alertas de apoyo", `${struggleSignals.length} alertas`, `
        <p class="muted" style="margin-bottom:8px;">Cuando un paso llega a dos fallos, se marca el concepto y la etapa.</p>
        <div class="stack">
          ${struggleSignals.length
            ? struggleSignals.map((signal) => `
                <div class="card tracking-session">
                  <div class="card-head">
                    <div>
                      <strong>${escapeHtml(signal.conceptTopic || signal.topic || "Sin concepto")}</strong>
                      <p class="muted">${escapeHtml(signal.stepTitle || signal.stepId || "Paso sin titulo")}</p>
                    </div>
                    <span class="tag">${signal.failures} fallos</span>
                  </div>
                  <div class="tracking-metric-row"><span>Ocurrencias</span><strong>${signal.occurrences || 1}</strong></div>
                </div>
              `).join("")
            : `<div class="empty-state">Todavia no hay pasos marcados por dificultad.</div>`}
        </div>
      `)}

      ${renderTrackingDropdown("flashcards", "Tarjetas guardadas por leccion", `${lessonFlashcardGroups.length} grupos`, `
        <div class="stack">
          ${lessonFlashcardGroups.length
            ? lessonFlashcardGroups.map((group) => `
                <div class="card tracking-session">
                  <div class="card-head">
                    <div>
                      <strong>${escapeHtml(group.theme || "Tema de leccion")}</strong>
                      <p class="muted">${escapeHtml(group.unit || "Sin unidad")} · ${escapeHtml(group.lessonTitle || "Sin leccion")}</p>
                    </div>
                    <span class="tag">${(group.entries || []).length} sets</span>
                  </div>
                </div>
              `).join("")
            : `<div class="empty-state">Todavia no hay tarjetas guardadas por contenido de leccion.</div>`}
        </div>
      `)}

      ${renderTrackingDropdown("sessions", "Sesiones recientes", `${sessions.length} sesiones`, `
        <div class="stack">
          ${sessions.length
            ? sessions.map((session) => `
                <div class="card tracking-session">
                  <div class="card-head">
                    <div>
                      <strong>${escapeHtml(PRACTICE_KIND_LABELS[session.kind] || session.kind)}</strong>
                      <p class="muted">${escapeHtml(session.topic || "Sin tema")} · ${escapeHtml(session.status || "active")}</p>
                    </div>
                    <span class="tag">${(session.events || []).length} eventos</span>
                  </div>
                  <p class="muted">${escapeHtml(session.conceptTopic || "")}</p>
                </div>
              `).join("")
            : `<div class="empty-state">Todavia no hay sesiones registradas.</div>`}
        </div>
      `)}
    </div>
  `;
}

function renderProfilePage() {
  const summary = currentSummary();
  if (!summary.onboardingCompleted) {
    return renderOnboarding();
  }

  const suggestion = currentSuggestion();
  const conceptItems = knownConcepts(state.profile);
  const pathItems = flattenLessons(state.lessons).map((lesson) => {
    const done = currentCompletedSet().has(`${lesson.unit}::${lesson.title}`);
    const current = suggestion && suggestion.unit === lesson.unit && suggestion.title === lesson.title;
    return { ...lesson, state: done ? "done" : current ? "current" : "" };
  });

  const profileAnimal = getProfileAnimal();
  const animalData = ANIMAL_AVATARS[profileAnimal] || ANIMAL_AVATARS.bear;

  return `
    <div class="stack">
      <section class="hero-card" style="overflow:hidden;padding:0;">
        <div class="page-section-head blue">
          ${renderAnimalAvatar(profileAnimal, "sm")}
          <div>
            <div style="font-size:20px;">${escapeHtml(summary.displayName)}</div>
            <div style="font-size:12px;opacity:0.85;font-weight:600;">${escapeHtml(summary.grade)} · ${escapeHtml(summary.focusArea)}</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:8px;">
            <button class="btn secondary" data-action="edit-profile" style="min-height:36px;padding:6px 14px;font-size:13px;">Editar</button>
            <button class="btn primary" data-action="continue-suggestion" ${suggestion ? "" : "disabled"} style="min-height:36px;padding:6px 14px;font-size:13px;">${suggestion ? "▶ Continuar" : "✓ Completo"}</button>
          </div>
        </div>
        <div style="padding:16px 20px;">
          <p class="muted" style="margin:0 0 6px;font-size:13px;">Meta diaria: ${summary.dailyGoalProgress}/${summary.dailyGoal} XP</p>
          <div class="progress-bar"><span style="width:${(summary.dailyGoalProgress / summary.dailyGoal) * 100}%"></span></div>
        </div>
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
          ${state.deleteProfileConfirm
            ? `<div class="delete-confirm-box">
                <p>¿Seguro que quieres <strong>eliminar completamente</strong> el perfil de ${escapeHtml(state.profile.name || "este estudiante")}? Esta accion no se puede deshacer.</p>
                <div class="row">
                  <button class="btn primary" data-action="cancel-delete-profile">Cancelar</button>
                  <button class="btn danger" data-action="confirm-delete-profile">Eliminar perfil</button>
                </div>
              </div>`
            : `<button class="btn danger" data-action="delete-profile">Eliminar perfil</button>`}
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
        <h2>¡Bienvenido a Mi cuaderno!</h2>
        <p class="muted">Cuéntame un poco sobre ti para personalizar tu cuaderno.</p>
      </div>
      ${step === 0 ? `
        <input data-draft-field="name" value="${escapeHtml(draft.name || "")}" placeholder="Tu nombre o apodo" style="font-size:18px;padding:12px 16px;border-radius:14px;" />
        <p style="font-weight:700;color:var(--muted);margin:0;">Elige tu animal:</p>
        <div class="animal-choice-grid">
          ${Object.entries(ANIMAL_AVATARS).map(([key, animal]) => `
            <button class="animal-choice-btn ${draft.avatar === key ? "active" : ""}" data-action="choose-avatar" data-value="${key}" style="background:${animal.bg};" aria-label="${animal.name}" aria-pressed="${draft.avatar === key}">
              ${animal.emoji}
              <span class="animal-choice-name" style="color:#fff;">${animal.name}</span>
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

function modelOptions(selected, { placeholder = "Selecciona un modelo" } = {}) {
  const availableNames = new Set(state.availableModels.map((m) => m.name));
  const seen = new Set();
  let html = placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : "";

  for (const model of state.availableModels) {
    seen.add(model.name);
    html += `<option value="${escapeHtml(model.name)}" ${selected === model.name ? "selected" : ""}>${escapeHtml(model.name)}</option>`;
  }

  for (const name of PULLABLE_MODELS) {
    if (!seen.has(name)) {
      html += `<option value="${escapeHtml(name)}" ${selected === name ? "selected" : ""}>${escapeHtml(name)} (descargar)</option>`;
    }
  }

  return html;
}

function renderSettingsModal() {
  const draft = cloneSettings();

  return `
    <div class="modal">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h3 style="margin:0;">Ajustes</h3>
            <p class="muted">Elige el modelo de IA y las preferencias de tu cuaderno.</p>
          </div>
          <button class="ghost-btn" data-action="close-settings">Cerrar</button>
        </div>
        <div class="stack">
          <div class="card stack">
            <div>
              <strong>Modelo de IA</strong>
              <p class="muted">El modelo de IA que usará tu cuaderno para ayudarte.</p>
            </div>
            <label>
              <span class="muted">Dirección de la IA</span>
              <input data-settings-field="ollamaBaseUrl" value="${escapeHtml(draft.ollamaBaseUrl)}" />
            </label>
            <label>
              <span class="muted">Modelo activo</span>
              <select data-settings-field="currentModel">
                ${modelOptions(draft.currentModel)}
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
          <div class="card stack">
            <div>
              <strong>Modo avanzado</strong>
              <p class="muted">Activa el modo avanzado para una ayuda más personalizada y adaptada a ti.</p>
            </div>
            <label style="flex-direction:row;align-items:center;gap:0.75rem;">
              <input type="checkbox" data-settings-checkbox="agentMode" ${draft.agentMode ? "checked" : ""} />
              <span>Activar modo agente</span>
            </label>
            <label>
              <span class="muted">Modelo rápido (recomendado: qwen3:0.6b)</span>
              <select data-settings-field="agentRouterModel">
                ${modelOptions(draft.agentRouterModel, { placeholder: "Usar modelo principal" })}
              </select>
            </label>
            <label>
              <span class="muted">Modelo tutor (recomendado: gemma3:4b)</span>
              <select data-settings-field="agentTutorModel">
                ${modelOptions(draft.agentTutorModel, { placeholder: "Usar modelo principal" })}
              </select>
            </label>
            <label>
              <span class="muted">Modelo de verificación (recomendado: functiongemma)</span>
              <select data-settings-field="agentFunctionModel">
                ${modelOptions(draft.agentFunctionModel, { placeholder: "Usar modelo principal" })}
              </select>
            </label>
          </div>
          <div class="row">
            <button class="btn primary" data-action="save-settings">Guardar</button>
          </div>
          <div class="card stack" style="border-color:var(--danger,#c00);">
            <div>
              <strong>Tus datos guardados</strong>
              <p class="muted">Carpeta: ${escapeHtml(state.dataPath || "")}</p>
            </div>
            <button class="btn danger" data-action="wipe-data">Borrar todos los datos</button>
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
        ${state.loadingPanel.cancelable
          ? `
            <div class="loading-close-row">
              <button class="ghost-btn loading-close-btn" data-action="cancel-loading" aria-label="Cancelar generacion">X</button>
            </div>
          `
          : ""}
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
          <span class="tag">Tutor local</span>
          <h3 style="margin:0;">${escapeHtml(state.loadingPanel.title)}</h3>
          <p class="muted" id="pull-progress-detail">${escapeHtml(state.loadingPanel.detail)}</p>
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

function buildFallbackKidMathGate(question = "") {
  const text = String(question || "").toLowerCase();
  const schoolMath = /(suma|sumar|resta|restar|multiplic|division|dividir|fraccion|decimal|porcentaje|numero|ecuacion|ecuaciones|area|perimetro|triang|rectang|geometr|medida|patron|figura|problema|calcula|resuelve|fracciones|comparar|ordenar)/.test(text);
  const advancedMath = /(deriv|integral|limite|matriz|vector|tensor|laplace|fourier|gradiente|determinante|eigen|autovalor|autovector)/.test(text);
  return schoolMath && !advancedMath;
}

function normalizeKidMathGate(raw, question = "") {
  const answer = String(raw || "").trim().toLowerCase();
  if (answer.includes("not_kid_math")) {
    return { isKidMath: false, label: "not_kid_math" };
  }
  if (answer.includes("kid_math")) {
    return { isKidMath: true, label: "kid_math" };
  }
  return {
    isKidMath: buildFallbackKidMathGate(question),
    label: buildFallbackKidMathGate(question) ? "kid_math" : "not_kid_math"
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

function createLocalId(prefix = "session") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextTutorEvent(result, answer = "") {
  const trimmed = String(answer || "").trim();

  if (!trimmed || trimmed.length < 3) {
    return {
      result: "ambiguous",
      decisions: ["d1", "d2"],
      message: "Tu respuesta fue muy corta o ambigua. Dame un poco mas de detalle."
    };
  }

  if (result === "correct") {
    return {
      result: "correct",
      decisions: ["b1", "b2", "g2"],
      message: "Bien. La idea principal ya esta suficientemente clara para continuar."
    };
  }

  if (result === "ambiguous") {
    return {
      result: "ambiguous",
      decisions: ["c1", "c3", "d1"],
      message: "Vas bien encaminado, pero necesito un poco mas de precision para aprobar este paso."
    };
  }

  return {
    result: "incorrect",
    decisions: ["a1", "a2", "a3", "c2"],
    message: "Todavia no coincide. Usa la pista o reformula la idea principal."
  };
}

async function saveProfileState() {
  await window.bridge.saveProfile(state.profile);
}

function updateTutorSessionRecord(sessionId, updater) {
  const sessions = [...(state.profile.tutorSessions || [])];
  const index = sessions.findIndex((item) => item.id === sessionId);
  if (index < 0) return;
  sessions[index] = updater(sessions[index]);
  state.profile = migrateProfile({
    ...state.profile,
    tutorSessions: sessions
  });
}

async function appendTutorSessionEvent(sessionId, event) {
  updateTutorSessionRecord(sessionId, (session) => ({
    ...session,
    events: [...(session.events || []), { ...event, ts: event.ts || new Date().toISOString() }]
  }));
  await saveProfileState();
}

async function createTutorSessionRecord({
  kind,
  topic,
  conceptTopic,
  source,
  status = "active",
  hiddenTrace = [],
  visibleSteps = []
}) {
  const id = createLocalId(kind || "session");
  const record = {
    id,
    kind,
    topic,
    conceptTopic,
    source,
    ts: new Date().toISOString(),
    status,
    hiddenTrace,
    visibleSteps,
    events: []
  };

  state.profile = migrateProfile({
    ...state.profile,
    tutorSessions: [...(state.profile.tutorSessions || []), record]
  });
  await saveProfileState();
  return id;
}

async function markTutorSessionStatus(sessionId, status) {
  updateTutorSessionRecord(sessionId, (session) => ({ ...session, status }));
  await saveProfileState();
}

async function logInteraction({ sessionId, stepId, question, answer, actionTaken, feedback, decisions = [] }) {
  const entry = {
    id: createLocalId("interaction"),
    ts: new Date().toISOString(),
    sessionId: sessionId || "",
    stepId: stepId || "",
    question: question || "",
    answer: answer || "",
    actionTaken: actionTaken || "",
    feedback: feedback || null,
    decisions: decisions || []
  };
  state.profile = migrateProfile({
    ...state.profile,
    interactionLog: [...(state.profile.interactionLog || []), entry]
  });
  await saveProfileState();
  return entry.id;
}

async function setInteractionFeedback(interactionId, thumbs) {
  const log = [...(state.profile.interactionLog || [])];
  const idx = log.findIndex((e) => e.id === interactionId);
  if (idx >= 0) {
    log[idx] = { ...log[idx], feedback: thumbs };
    state.profile = migrateProfile({ ...state.profile, interactionLog: log });
    await saveProfileState();
  }
}

function getInteractionsForAction(actionCode) {
  return (state.profile.interactionLog || []).filter((entry) =>
    (entry.decisions || []).includes(actionCode)
  );
}

function normalizeContextFlashcards(raw, fallbackTopic, relationText) {
  const needsMoreContext = Boolean(raw?.needsMoreContext);
  const followUp = String(raw?.followUp || "").trim();
  const cards = Array.isArray(raw?.cards) ? raw.cards : [];

  return {
    needsMoreContext,
    followUp,
    topic: String(raw?.topic || fallbackTopic || relationText).trim() || relationText,
    cards: cards.map((card, index) => ({
      id: slugify(`${fallbackTopic || relationText}-context-${index + 1}`) || `context-card-${index + 1}`,
      title: String(card?.title || `Tarjeta ${index + 1}`).trim(),
      body: String(card?.body || "").trim()
    }))
  };
}

function preparePracticeSession({ kind, classification, deck = null, solution = null, reusedConcept = false, hiddenTrace = [], sessionId = null }) {
  return {
    kind,
    topic: classification.topic,
    conceptTopic: classification.conceptTopic,
    reason: classification.reason,
    relatedTopics: classification.relatedTopics,
    deck,
    solution,
    reusedConcept,
    hiddenTrace,
    sessionId,
    gameState: deck ? buildGameState(deck) : {},
    stepAttempts: {},
    stepFailureCounts: {},
    flaggedSteps: {},
    stepInputs: {},
    stepResults: {},
    openHints: {},
    currentStepIndex: 0
  };
}

async function persistConceptStudy({ topic, relatedTopics = [], status = "studying", source = "study-card" }) {
  state.profile = trackConceptStudy(state.profile, {
    topic,
    relatedTopics,
    status,
    source
  });
  await saveProfileState();
}

async function persistLessonFlashcards({
  theme = "",
  source = "lesson-help",
  selection = "",
  title = "",
  subtitle = "",
  cards = []
}) {
  if (!state.currentLesson || !cards.length) return;

  state.profile = trackLessonFlashcards(state.profile, {
    unit: state.selectedUnit || "",
    lessonTitle: state.currentLesson.title || "",
    theme: theme || state.currentLesson.title || "Tema de leccion",
    source,
    selection,
    title,
    subtitle,
    cards
  });
  await saveProfileState();
}

async function recordStepStruggle(step, failures) {
  const session = state.practiceSession;
  if (!session?.conceptTopic) return;

  state.profile = trackStruggleSignal(state.profile, {
    conceptTopic: session.conceptTopic,
    topic: session.topic,
    stepId: step.id,
    stepTitle: step.title,
    sessionIds: session.sessionId ? [session.sessionId] : [],
    failures,
    status: "open"
  });
  await saveProfileState();
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
  if (session.sessionId) {
    await markTutorSessionStatus(session.sessionId, "completed");
  }
  await saveProfileState();
  render();
}

async function generateStudyDeck(question, classification, options = {}) {
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
  ], options);

  return normalizeStudyDeck(safeJsonParse(answer, {}), question, classification);
}

async function generateExercisePlan(question, classification, options = {}) {
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
  ], options);

  return normalizeExercisePlan(safeJsonParse(answer, {}), question, classification);
}

async function generateExerciseTrace(question, options = {}) {
  const answer = await askWithOllama([
    { role: "system", content: exerciseTracePrompt },
    { role: "user", content: buildExerciseTraceUserPrompt(question, 4) }
  ], options);

  return Array.isArray(safeJsonParse(answer, [])) ? safeJsonParse(answer, []) : [];
}

async function handleStudyQuestionAgentMode(question, options = {}) {
  const models = resolveAgentModels(state.settings);
  const askFn = makeAgentAskFn();
  const sessionId = createLocalId("session");

  const pipelineResult = await runTutorPipeline(question, sessionId, {
    profile: state.profile,
    askFn,
    models
  });

  if (pipelineResult.isOffTopic) {
    const sid = await createTutorSessionRecord({
      kind: "non_math",
      topic: question,
      conceptTopic: "",
      source: "practice-chat-agent",
      status: "completed"
    });
    await appendTutorSessionEvent(sid, {
      type: "scope-gate",
      decisions: ["h"],
      detail: `Router: ${pipelineResult.routerResult?.route || "off_topic"}`
    });
    state.practiceSession = preparePracticeSession({
      kind: "non_math",
      classification: { kind: "non_math", topic: question, conceptTopic: "", relatedTopics: [], reason: "Fuera del dominio de matematicas infantiles." },
      reusedConcept: false,
      sessionId: sid
    });
    state.exerciseOverlay = { open: false, index: 0 };
    openFlashcards({
      source: "practice-scope-gate",
      title: "¡Vaya, eso no es mates!",
      subtitle: "Aquí solo puedo ayudarte con matemáticas.",
      cards: [{ title: "Prueba con algo de mates", body: "Puedes preguntarme sobre operaciones, fracciones, geometría o problemas de clase." }],
      sessionId: sid
    });
    return;
  }

  const { tutorState, solution, plannerResult } = pipelineResult;
  const classification = {
    kind: "exercise",
    topic: plannerResult.learning_objective,
    conceptTopic: plannerResult.learning_objective,
    relatedTopics: [],
    reason: "Modo agente CLASS-A activado."
  };

  const sid = await createTutorSessionRecord({
    kind: "exercise",
    topic: classification.topic,
    conceptTopic: classification.conceptTopic,
    source: "practice-chat-agent",
    visibleSteps: solution.steps.map((step) => step.title),
    status: "active"
  });
  await appendTutorSessionEvent(sid, {
    type: "classification",
    decisions: ["g1", "f1"],
    detail: `Agente planificador: ${plannerResult.learning_objective}`
  });

  state.practiceSession = {
    ...preparePracticeSession({ kind: "exercise", classification, solution, reusedConcept: false, sessionId: sid }),
    tutorState,
    agentMode: true
  };
  state.exerciseOverlay = { open: true, index: 0 };

  await persistConceptStudy({
    topic: classification.topic,
    relatedTopics: [],
    status: "studying",
    source: "exercise-bridge"
  });
}

async function handleStudyQuestion(question, options = {}) {
  if (state.settings.agentMode) {
    return handleStudyQuestionAgentMode(question, options);
  }

  const scopeText = await askWithOllama([
    { role: "system", content: kidMathGatePrompt },
    { role: "user", content: buildKidMathGateUserPrompt(question) }
  ], {
    requestId: options.requestId || "",
    maxTokens: 8,
    temperature: 0
  });
  const scopeGate = normalizeKidMathGate(scopeText, question);

  if (!scopeGate.isKidMath) {
    const classification = {
      kind: "non_math",
      topic: question,
      conceptTopic: "",
      relatedTopics: [],
      reason: "La pregunta no corresponde a matematicas infantiles para este espacio de estudio."
    };
    const sessionId = await createTutorSessionRecord({
      kind: "non_math",
      topic: classification.topic,
      conceptTopic: classification.conceptTopic,
      source: "practice-gate",
      status: "completed"
    });
    await appendTutorSessionEvent(sessionId, {
      type: "scope-gate",
      decisions: ["h"],
      detail: "Filtro rapido: la pregunta quedo fuera de matematicas infantiles."
    });
    state.practiceSession = preparePracticeSession({
      kind: "non_math",
      classification,
      reusedConcept: false,
      sessionId
    });
    state.exerciseOverlay = { open: false, index: 0 };
    openFlashcards({
      source: "practice-scope-gate",
      title: "¡Vaya, eso no es mates!",
      subtitle: "Aquí solo puedo ayudarte con matemáticas.",
      cards: [{
        title: "Prueba con algo de mates",
        body: "Puedes preguntarme sobre operaciones, fracciones, geometría o problemas de clase."
      }],
      sessionId
    });
    return;
  }

  const registeredConcepts = knownConcepts(state.profile).map((item) => item.topic);
  const classificationText = await askWithOllama([
    { role: "system", content: studyClassifierPrompt },
    { role: "user", content: buildClassifierUserPrompt(question, registeredConcepts) }
  ], options);
  const classification = normalizeClassifierPayload(safeJsonParse(classificationText, {}), question);

  if (classification.kind === "non_math") {
    const sessionId = await createTutorSessionRecord({
      kind: "non_math",
      topic: classification.topic,
      conceptTopic: classification.conceptTopic,
      source: "practice-chat",
      status: "completed"
    });
    await appendTutorSessionEvent(sessionId, {
      type: "classification",
      decisions: ["h"],
      detail: classification.reason
    });
    state.practiceSession = preparePracticeSession({
      kind: "non_math",
      classification,
      reusedConcept: false,
      sessionId
    });
    state.exerciseOverlay = { open: false, index: 0 };
    return;
  }

  if (classification.kind === "concept") {
    const deck = await generateStudyDeck(question, classification, options);
    const sessionId = await createTutorSessionRecord({
      kind: "concept",
      topic: classification.topic,
      conceptTopic: classification.conceptTopic,
      source: "practice-chat",
      visibleSteps: deck.cards.map((card) => card.title),
      status: "active"
    });
    await appendTutorSessionEvent(sessionId, {
      type: "classification",
      decisions: ["f1", "f2"],
      detail: classification.reason
    });
    state.practiceSession = preparePracticeSession({
      kind: "concept",
      classification,
      deck,
      sessionId
    });
    state.exerciseOverlay = { open: false, index: 0 };
    openFlashcards({
      source: "practice-deck",
      title: `Tarjetas de ${deck.topic}`,
      subtitle: "Navega con las flechas y revisa todas las tarjetas en orden.",
      cards: deck.cards,
      sessionId
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
  const deck = reusedConcept ? null : await generateStudyDeck(question, classification, options);
  const solution = await generateExercisePlan(question, classification, options);
  const hiddenTrace = await generateExerciseTrace(question, options);
  const sessionId = await createTutorSessionRecord({
    kind: "exercise",
    topic: classification.topic,
    conceptTopic: classification.conceptTopic,
    source: "practice-chat",
    hiddenTrace,
    visibleSteps: solution.steps.map((step) => step.title),
    status: "active"
  });
  await appendTutorSessionEvent(sessionId, {
    type: "classification",
    decisions: ["g1", reusedConcept ? "b1" : "f1"],
    detail: classification.reason
  });

  state.practiceSession = preparePracticeSession({
    kind: "exercise",
    classification,
    deck,
    solution,
    reusedConcept,
    hiddenTrace,
    sessionId
  });
  state.exerciseOverlay = {
    open: !deck,
    index: 0
  };
  if (deck) {
    openFlashcards({
      source: "practice-deck",
      title: `Tarjetas de ${deck.topic}`,
      subtitle: "Estas tarjetas aparecen antes de continuar con el ejercicio.",
      cards: deck.cards,
      sessionId
    });
  }
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
  state.lessonUi.contextMenu = { ...state.lessonUi.contextMenu, open: false };

  if (selectionNeedsMoreContext(state.selectedText)) {
    const sessionId = await createTutorSessionRecord({
      kind: "context-help",
      topic: state.selectedText,
      conceptTopic: "",
      source: "lesson-text",
      status: "completed"
    });
    await appendTutorSessionEvent(sessionId, {
      type: "context-check",
      decisions: ["d1", "d2"],
      detail: "La seleccion necesita mas contexto."
    });
    openFlashcards({
      source: "context-help",
      title: "Necesito mas contexto",
      subtitle: "Selecciona una frase o parrafo mas completo para poder ayudarte.",
      cards: [
        {
          title: "Selecciona mas texto",
          body: "La parte marcada es muy corta o aislada. Incluye la idea completa, la definicion o el enunciado cercano."
        }
      ],
      sessionId
    });
    render();
    return;
  }

  const requestId = createLocalId("lesson-text");
  openLoadingPanel({
    title: "Generando ayuda",
    detail: "Estoy preparando tarjetas a partir del texto que seleccionaste.",
    cancelable: true,
    requestId
  });

  try {
    const answer = await askWithOllama([
      { role: "system", content: contextFlashcardPrompt },
      { role: "user", content: buildContextFlashcardUserPrompt(state.selectedText) }
    ], { requestId });
    if (isRequestCancelled(requestId)) return;
    const payload = normalizeContextFlashcards(safeJsonParse(answer, {}), state.selectedText, state.selectedText);
    const cards = payload.needsMoreContext
      ? [{
          title: "Selecciona mas texto",
          body: payload.followUp || "Necesito una parte mas amplia del enunciado para ayudarte bien."
        }]
      : payload.cards.length
        ? payload.cards
        : parseExplanationCards(answer, state.selectedText).map((card) => ({ title: card.title, body: card.body }));
    const sessionId = await createTutorSessionRecord({
      kind: "context-help",
      topic: payload.topic,
      conceptTopic: payload.topic,
      source: "lesson-text",
      visibleSteps: cards.map((card) => card.title),
      status: "completed"
    });
    await appendTutorSessionEvent(sessionId, {
      type: "context-help",
      decisions: payload.needsMoreContext ? ["d1", "d2"] : ["f1", "f2"],
      detail: state.selectedText
    });
    if (!payload.needsMoreContext && payload.topic) {
      await persistConceptStudy({
        topic: payload.topic,
        status: "introduced",
        source: "lesson-context"
      });
      await persistLessonFlashcards({
        theme: payload.topic,
        source: "lesson-text",
        selection: state.selectedText,
        title: `Ayuda sobre ${payload.topic}`,
        subtitle: "Tarjetas generadas a partir de tu seleccion.",
        cards
      });
    }
    openFlashcards({
      source: "context-help",
      title: payload.needsMoreContext ? "Necesito mas contexto" : `Ayuda sobre ${payload.topic}`,
      subtitle: payload.needsMoreContext ? "Selecciona una frase mas completa." : "Tarjetas generadas a partir de tu seleccion.",
      cards,
      sessionId
    });
  } catch (error) {
    if (error?.name === "AbortError" || isRequestCancelled(requestId)) {
      return;
    }
    openFlashcards({
      source: "context-help",
      title: "No pude generar la ayuda",
      subtitle: "Intenta seleccionando otra parte de la leccion.",
      cards: fallbackExplanationCards(`[Error] ${error.message}`, state.selectedText).map((card) => ({ title: card.title, body: card.body }))
    });
  } finally {
    finishRequest(requestId);
  }
  render();
}

async function runImageExplanation() {
  const visionModel = state.lessonUi.cropAction?.visionModel;
  if (!state.lessonUi.cropRect || !visionModel || !inferenceReadiness().ready) return;

  const frame = document.getElementById("lesson-frame");
  if (!frame) return;
  const cropRect = { ...state.lessonUi.cropRect };
  const requestId = createLocalId("vision");
  state.lessonUi.cropAction = { ...state.lessonUi.cropAction, open: false };
  state.lessonUi.cropRect = null;
  state.lessonUi.dragStart = null;
  state.lessonUi.hint = "";
  syncLessonUi();
  openLoadingPanel({
    title: "Analizando recorte",
    detail: "Estoy generando tarjetas a partir de la imagen seleccionada.",
    cancelable: true,
    requestId
  });

  try {
    const frameBounds = frame.getBoundingClientRect();
    const capture = await window.bridge.captureRegion({
      x: frameBounds.left + cropRect.x,
      y: frameBounds.top + cropRect.y,
      width: cropRect.width,
      height: cropRect.height
    });

    if (isRequestCancelled(requestId)) return;

    const answer = await askWithOllama([
      { role: "system", content: contextFlashcardPrompt },
      {
        role: "user",
        content: buildVisualFlashcardUserPrompt(),
        images: [capture.base64]
      }
    ], { requestId, model: visionModel });
    if (isRequestCancelled(requestId)) return;
    const payload = normalizeContextFlashcards(safeJsonParse(answer, {}), "recorte visual", "recorte visual");
    const cards = payload.cards.length
      ? payload.cards
      : parseExplanationCards(answer, "Recorte visual").map((card) => ({ title: card.title, body: card.body }));
    const sessionId = await createTutorSessionRecord({
      kind: "visual-help",
      topic: payload.topic,
      conceptTopic: payload.topic,
      source: "lesson-image",
      visibleSteps: cards.map((card) => card.title),
      status: "completed"
    });
    await appendTutorSessionEvent(sessionId, {
      type: "visual-help",
      decisions: ["f1", "f2"],
      detail: "Analisis de recorte visual."
    });
    if (payload.topic) {
      await persistConceptStudy({
        topic: payload.topic,
        status: "introduced",
        source: "lesson-image"
      });
    }
    await persistLessonFlashcards({
      theme: payload.topic || state.currentLesson?.title || "recorte visual",
      source: "lesson-image",
      selection: "recorte visual",
      title: `Que es esto? ${payload.topic ? `- ${payload.topic}` : ""}`.trim(),
      subtitle: "Tarjetas generadas a partir del recorte visual.",
      cards
    });
    openFlashcards({
      source: "visual-help",
      title: `Que es esto? ${payload.topic ? `- ${payload.topic}` : ""}`.trim(),
      subtitle: "Tarjetas generadas a partir del recorte visual.",
      cards,
      sessionId
    });
  } catch (error) {
    if (error?.name === "AbortError" || isRequestCancelled(requestId)) {
      return;
    }
    const msg = String(error?.message || "");
    const isModelError = /500|no.*support|not.*support|multimodal|imagen|image/i.test(msg);
    openFlashcards({
      source: "visual-help",
      title: "No pude analizar el recorte",
      subtitle: isModelError
        ? "El modelo activo no soporta imagenes. Activa un modelo con vision desde Configuracion LLM."
        : "Intenta hacer un recorte un poco mas grande o mas claro.",
      cards: fallbackExplanationCards(`[Error] ${msg}`, "Recorte visual").map((card) => ({ title: card.title, body: card.body }))
    });
  } finally {
    finishRequest(requestId);
  }
  render();
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

  if (target.dataset.settingsCheckbox) {
    state.settingsDraft = normalizeSettings({
      ...(state.settingsDraft || state.settings),
      [target.dataset.settingsCheckbox]: target.checked
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
  if (!question || state.isThinking || state.loadingPanel.open || !readiness.ready) return;

  const requestId = createLocalId("practice");
  event.target.reset();
  state.isThinking = true;
  openLoadingPanel({
    title: "Generando respuesta",
    detail: "Estoy clasificando tu pregunta y preparando las tarjetas o el problema guiado.",
    cancelable: true,
    requestId
  });
  render();

  try {
    await handleStudyQuestion(question, { requestId });
    if (isRequestCancelled(requestId)) return;
    state.profile = addPracticeXp(state.profile, 1);
    await window.bridge.saveProfile(state.profile);
  } catch (error) {
    if (error?.name === "AbortError" || isRequestCancelled(requestId)) {
      return;
    }
    openFlashcards({
      source: "practice-error",
      title: "No pude generar la interaccion",
      subtitle: "Prueba reformulando la pregunta o vuelve a intentarlo.",
      cards: [{
        title: "No se pudo preparar el recorrido",
        body: error.message || "Ocurrio un error inesperado al crear las tarjetas o el problema guiado."
      }]
    });
  } finally {
    state.isThinking = false;
    finishRequest(requestId);
    render();
  }
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    if (state.loadingPanel.open) {
      return;
    }
    if (closeLessonMenus()) {
      syncLessonUi();
    }
    return;
  }

  const action = button.dataset.action;

  if (action === "cancel-loading" && state.loadingPanel.cancelable && state.loadingPanel.requestId) {
    cancelledRequestIds.add(state.loadingPanel.requestId);
    await window.bridge.cancelChat(state.loadingPanel.requestId);
    closeLoadingPanel();
    render();
    return;
  }

  if (state.loadingPanel.open) {
    return;
  }

  if (action === "close-flashcards") {
    const shouldResumeExercise = state.practiceSession?.kind === "exercise"
      && state.practiceSession?.solution
      && state.flashcards.sessionId
      && state.flashcards.sessionId === state.practiceSession.sessionId;
    closeFlashcards();
    if (shouldResumeExercise) {
      openExerciseOverlay();
    }
    render();
    return;
  }

  if (action === "flashcard-prev") {
    state.flashcards.index = Math.max(0, state.flashcards.index - 1);
    render();
    return;
  }

  if (action === "flashcard-next") {
    state.flashcards.index = Math.min(state.flashcards.cards.length - 1, state.flashcards.index + 1);
    render();
    return;
  }

  if (action === "toggle-student-panel") {
    const section = button.dataset.section;
    state.studentPanel = {
      ...state.studentPanel,
      [`${section}Open`]: !state.studentPanel[`${section}Open`]
    };
    render();
    return;
  }

  if (action === "toggle-panel-compact") {
    state.studentPanel = {
      ...state.studentPanel,
      compact: !state.studentPanel.compact
    };
    render();
    return;
  }

  if (action === "nav") {
    state.page = button.dataset.page;
  }

  if (action === "book-prev") {
    state.bookPage = Math.max(0, state.bookPage - 1);
  }

  if (action === "book-next") {
    state.bookPage += 1;
  }

  if (action === "select-unit") {
    state.selectedUnit = button.dataset.unit;
    state.bookPage = 0;
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

  if (action === "delete-profile") {
    state.deleteProfileConfirm = true;
  }

  if (action === "cancel-delete-profile") {
    state.deleteProfileConfirm = false;
  }

  if (action === "confirm-delete-profile") {
    state.profile = await window.bridge.resetProfile();
    state.deleteProfileConfirm = false;
    state.page = "profile";
  }

  if (action === "toggle-tracking-section") {
    const section = button.dataset.section;
    if (section) {
      state.trackingSections = {
        ...state.trackingSections,
        [section]: !state.trackingSections[section]
      };
    }
  }

  if (action === "open-student-analysis") {
    if (!state.settings.currentModel || state.studentAnalysis.busy) return;
    state.studentAnalysis = { open: true, busy: true, text: "" };
    render();
    try {
      const log = (state.profile.interactionLog || []).slice(-40);
      const sessions = (state.profile.tutorSessions || []).slice(-10);
      const metrics = tutorMetrics();
      const systemPrompt = `Eres un analista pedagogico experto. Analiza las interacciones de un estudiante de matematicas y genera un resumen en español con los siguientes puntos:
1. Patrones de comportamiento observados
2. Conceptos en los que el estudiante demuestra mas dificultad
3. Conceptos en los que el estudiante muestra mayor fortaleza
4. Nivel de persistencia (cuantos intentos hace, cuantas pistas pide)
5. Calidad del feedback recibido del sistema (segun los thumbs up/down)
6. Recomendaciones concretas para mejorar el aprendizaje del estudiante

Sé conciso pero preciso. Usa bullet points. NO uses markdown complejo, solo bullets simples.`;
      const userPrompt = [
        `Estudiante: ${state.profile.name || "Sin nombre"} (${state.profile.grade || "sin grado"})`,
        `Sesiones totales: ${metrics.sessions}`,
        `Intentos correctos: ${metrics.correctAttempts}, incorrectos: ${metrics.incorrectAttempts}, ambiguos: ${metrics.ambiguousAttempts}`,
        `Pasos completados: ${metrics.stepsCompleted}`,
        `Pistas pedidas: ${metrics.hintsShown}`,
        `Feedback positivo: ${metrics.feedbackUp}, negativo: ${metrics.feedbackDown}`,
        `Alertas de dificultad: ${metrics.struggleSignals}`,
        ``,
        `Ultimas ${log.length} interacciones registradas:`,
        ...log.map((e, i) => `  ${i + 1}. P: "${e.question}" | R: "${e.answer}" | Accion: ${e.actionTaken} | Feedback: ${e.feedback || "sin valorar"}`),
        ``,
        `Sesiones recientes (${sessions.length}):`,
        ...sessions.map((s) => `  - [${s.kind}] ${s.topic} (${(s.events || []).length} eventos, estado: ${s.status})`)
      ].join("\n");

      const text = await askWithOllama([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ], { model: state.settings.agentTutorModel || state.settings.currentModel, maxTokens: 600, temperature: 0.3 });

      state.studentAnalysis = { open: true, busy: false, text: String(text || "No se pudo generar el analisis.") };
    } catch (err) {
      state.studentAnalysis = { open: true, busy: false, text: `Error al generar el analisis: ${err.message}` };
    }
  }

  if (action === "close-student-analysis") {
    state.studentAnalysis = { open: false, busy: false, text: "" };
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

  if (action === "open-exercise-overlay") {
    openExerciseOverlay(Math.min(state.exerciseOverlay.index || 0, maxExerciseOverlayIndex()));
    render();
    return;
  }

  if (action === "close-exercise-overlay") {
    closeExerciseOverlay();
    render();
    return;
  }

  if (action === "exercise-prev") {
    state.exerciseOverlay.index = Math.max(0, state.exerciseOverlay.index - 1);
    render();
    return;
  }

  if (action === "exercise-next") {
    const maxIndex = Math.min(maxExerciseOverlayIndex(), state.practiceSession?.solution?.steps?.length || 0);
    state.exerciseOverlay.index = Math.min(maxIndex, state.exerciseOverlay.index + 1);
    render();
    return;
  }

  if (action === "wipe-data") {
    const wiped = await window.bridge.wipeData();
    if (wiped) {
      window.location.reload();
    }
    return;
  }

  if (action === "refresh-models" && state.settingsDraft) {
    await refreshOllamaModels(state.settingsDraft.ollamaBaseUrl);
  }

  if (action === "save-settings" && state.settingsDraft) {
    const nextSettings = normalizeSettings(state.settingsDraft, state.availableModels);
    const availableNames = new Set(state.availableModels.map((m) => m.name));
    const modelFields = ["currentModel", "agentRouterModel", "agentTutorModel", "agentFunctionModel"];
    const missingModels = [...new Set(
      modelFields.map((f) => nextSettings[f]).filter((name) => name && !availableNames.has(name))
    )];

    state.settingsOpen = false;
    state.settingsDraft = null;

    for (const modelName of missingModels) {
      await pullModel(modelName);
    }

    const modelChanged = nextSettings.currentModel !== state.settings.currentModel;
    const urlChanged = nextSettings.ollamaBaseUrl !== state.settings.ollamaBaseUrl;
    const shouldShowLoading = (modelChanged || urlChanged) && missingModels.length === 0;

    if (shouldShowLoading) {
      openLoadingPanel({
        title: "Preparando tutor local",
        detail: "Espera un momento mientras actualizo la configuracion del tutor."
      });
    }

    state.settings = nextSettings;
    state.practiceMode = state.settings.responseMode;
    await window.bridge.saveSettings(state.settings);

    if (shouldShowLoading) {
      await refreshOllamaModels(state.settings.ollamaBaseUrl);
      await sleep(650);
      closeLoadingPanel();
    }
  }

  if (action === "toggle-crop-mode") {
    const nextMode = !state.lessonUi.cropMode;
    closeLessonMenus({ clearCrop: !nextMode });
    state.lessonUi.cropMode = nextMode;
    state.lessonUi.hint = nextMode ? "Arrastra sobre la leccion para recortar." : "";
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

  if (action === "vision-model-change") {
    state.lessonUi.cropAction = { ...state.lessonUi.cropAction, visionModel: el.value };
    render();
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
    const hintLevels = { ...(state.practiceSession.hintLevels || {}) };
    const currentLevel = hintLevels[stepId] || 0;
    const step = state.practiceSession.solution?.steps?.find((s) => s.id === stepId);
    const maxHints = step?.hintLadder?.length || 3;
    if (currentLevel < maxHints) {
      hintLevels[stepId] = currentLevel + 1;
    } else {
      hintLevels[stepId] = 0;
    }
    state.practiceSession = { ...state.practiceSession, hintLevels };
    if (hintLevels[stepId] > 0 && state.practiceSession.sessionId) {
      await appendTutorSessionEvent(state.practiceSession.sessionId, {
        type: "hint-open",
        stepId,
        hintLevel: hintLevels[stepId],
        decisions: ["a3"],
        detail: `El estudiante pidio pista nivel ${hintLevels[stepId]}.`
      });
    }

    // Auto-unlock: when the student reaches the last hint, reveal the answer and mark correct
    if (hintLevels[stepId] === maxHints && step && !state.practiceSession.stepResults?.[stepId]?.correct) {
      const correctAnswer = (step.acceptedAnswers && step.acceptedAnswers[0]) || "";
      const stepInputs = { ...(state.practiceSession.stepInputs || {}), [stepId]: correctAnswer };
      const nextAttempts = {
        ...(state.practiceSession.stepAttempts || {}),
        [stepId]: Number(state.practiceSession.stepAttempts?.[stepId] || 0) + 1
      };
      const stepResults = {
        ...(state.practiceSession.stepResults || {}),
        [stepId]: {
          correct: true,
          result: "correct",
          attempts: nextAttempts[stepId],
          failures: state.practiceSession.stepFailureCounts?.[stepId] || 0,
          message: "Respuesta desbloqueada tras usar todas las pistas."
        }
      };
      const nextStepIndex = (state.practiceSession.currentStepIndex || 0) + 1;
      state.practiceSession = { ...state.practiceSession, stepInputs, stepAttempts: nextAttempts, stepResults, currentStepIndex: nextStepIndex };
      if (state.practiceSession.sessionId) {
        await appendTutorSessionEvent(state.practiceSession.sessionId, {
          type: "step-attempt",
          stepId,
          stepTitle: step.title,
          answer: correctAnswer,
          result: "correct",
          attempts: nextAttempts[stepId],
          failures: state.practiceSession.stepFailureCounts?.[stepId] || 0,
          decisions: ["a3-auto-unlock"],
          detail: "Respuesta desbloqueada automaticamente tras agotar todas las pistas."
        });
        await appendTutorSessionEvent(state.practiceSession.sessionId, {
          type: "step-complete",
          stepId,
          stepTitle: step.title,
          decisions: ["g2"]
        });
      }

      // Check if all steps are done
      const allCorrect = state.practiceSession.solution.steps.every((item) => stepResults[item.id]?.correct);
      if (allCorrect || nextStepIndex >= state.practiceSession.solution.steps.length) {
        await maybeMarkCurrentConceptKnown();
      }
    }
  }

  if (action === "check-step" && state.practiceSession?.solution) {
    const step = state.practiceSession.solution.steps.find((item) => item.id === button.dataset.stepId);
    if (step) {
      const value = state.practiceSession.stepInputs?.[step.id] || "";
      let eventMeta;

      if (state.practiceSession.agentMode && state.practiceSession.tutorState) {
        const retryCount = state.practiceSession.stepFailureCounts?.[step.id] || 0;
        const models = resolveAgentModels(state.settings);
        const askFn = makeAgentAskFn();
        openLoadingPanel({ title: "Tutor evaluando...", cancelable: false });
        let turnResult;
        try {
          turnResult = await runTurnPipeline(
            state.practiceSession.tutorState,
            { step, answer: value, retryCount },
            { profile: state.profile, askFn, models }
          );
        } finally {
          closeLoadingPanel();
        }
        state.practiceSession = { ...state.practiceSession, tutorState: turnResult.updatedTutorState };
        eventMeta = { result: turnResult.result, decisions: turnResult.decisions, message: turnResult.message };
      } else {
        const evaluation = evaluateStepAnswer(step, value);
        eventMeta = nextTutorEvent(evaluation.result, value);
      }
      const nextAttempts = {
        ...(state.practiceSession.stepAttempts || {}),
        [step.id]: Number(state.practiceSession.stepAttempts?.[step.id] || 0) + 1
      };
      const nextFailureCounts = {
        ...(state.practiceSession.stepFailureCounts || {}),
        [step.id]: Number(state.practiceSession.stepFailureCounts?.[step.id] || 0) + (eventMeta.result === "incorrect" ? 1 : 0)
      };
      const stepResults = {
        ...(state.practiceSession.stepResults || {}),
        [step.id]: {
          correct: eventMeta.result === "correct",
          result: eventMeta.result,
          attempts: nextAttempts[step.id],
          failures: nextFailureCounts[step.id],
          message: eventMeta.message
        }
      };
      const flaggedSteps = {
        ...(state.practiceSession.flaggedSteps || {})
      };
      state.practiceSession = {
        ...state.practiceSession,
        stepAttempts: nextAttempts,
        stepFailureCounts: nextFailureCounts,
        flaggedSteps,
        stepResults
      };
      if (state.practiceSession.sessionId) {
        await appendTutorSessionEvent(state.practiceSession.sessionId, {
          type: "step-attempt",
          stepId: step.id,
          stepTitle: step.title,
          answer: value,
          result: eventMeta.result,
          attempts: nextAttempts[step.id],
          failures: nextFailureCounts[step.id],
          decisions: eventMeta.decisions
        });
      }

      const interactionId = await logInteraction({
        sessionId: state.practiceSession.sessionId,
        stepId: step.id,
        question: step.prompt || step.title,
        answer: value,
        actionTaken: eventMeta.result === "correct" ? "confirm_and_advance" : eventMeta.result === "incorrect" ? "corrective_feedback" : "clarify_request",
        feedback: null,
        decisions: eventMeta.decisions
      });
      stepResults[step.id] = { ...stepResults[step.id], interactionId };
      state.practiceSession = { ...state.practiceSession, stepResults };

      if (eventMeta.result === "incorrect" && nextFailureCounts[step.id] >= 2 && !flaggedSteps[step.id]) {
        flaggedSteps[step.id] = true;
        state.practiceSession = {
          ...state.practiceSession,
          flaggedSteps
        };
        await recordStepStruggle(step, nextFailureCounts[step.id]);
        if (state.practiceSession.sessionId) {
          await appendTutorSessionEvent(state.practiceSession.sessionId, {
            type: "step-struggle",
            stepId: step.id,
            stepTitle: step.title,
            conceptTopic: state.practiceSession.conceptTopic,
            failures: nextFailureCounts[step.id],
            decisions: ["a2", "c2", "g1"]
          });
        }
      }

      if (eventMeta.result === "correct") {
        const nextIndex = (state.practiceSession.currentStepIndex || 0) + 1;
        state.practiceSession = {
          ...state.practiceSession,
          currentStepIndex: nextIndex
        };
        if (state.practiceSession.sessionId) {
          await appendTutorSessionEvent(state.practiceSession.sessionId, {
            type: "step-complete",
            stepId: step.id,
            stepTitle: step.title,
            decisions: ["g2"]
          });
        }
      }

      const allCorrect = state.practiceSession.solution.steps.every((item) => stepResults[item.id]?.correct);
      if (allCorrect || state.practiceSession.currentStepIndex >= state.practiceSession.solution.steps.length) {
        await maybeMarkCurrentConceptKnown();
        return;
      }
    }
  }

  if (action === "feedback-thumb" && button.dataset.interactionId) {
    const thumb = button.dataset.thumb;
    const interactionId = button.dataset.interactionId;
    const stepId = button.dataset.stepId;
    await setInteractionFeedback(interactionId, thumb);
    if (stepId && state.practiceSession?.stepResults?.[stepId]) {
      const stepResults = { ...state.practiceSession.stepResults };
      stepResults[stepId] = { ...stepResults[stepId], feedback: thumb };
      state.practiceSession = { ...state.practiceSession, stepResults };
    }
    render();
    return;
  }

  if (action === "tracking-action-detail") {
    state.trackingDetail = {
      open: true,
      actionCode: button.dataset.actionCode || null
    };
    render();
    return;
  }

  if (action === "close-tracking-detail") {
    state.trackingDetail = { open: false, actionCode: null };
    render();
    return;
  }

  if (action === "open-session-flashcards" && state.practiceSession?.deck) {
    closeExerciseOverlay();
    openFlashcards({
      source: "practice-deck",
      title: `Tarjetas de ${state.practiceSession.deck.topic}`,
      subtitle: "Navega por todas las tarjetas con las flechas laterales.",
      cards: state.practiceSession.deck.cards,
      sessionId: state.practiceSession.sessionId
    });
    render();
    return;
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

    if (state.practiceSession.sessionId) {
      await appendTutorSessionEvent(state.practiceSession.sessionId, {
        type: "game-result",
        gameId: payload.gameId,
        result: correct ? "correct" : "incorrect",
        decisions: correct ? ["g2"] : ["c1", "c2"]
      });
    }

    if (correct) {
      await maybeMarkCurrentConceptKnown();
      return;
    }
  }

  render();
}

async function pullModel(modelName) {
  openLoadingPanel({
    title: `Descargando ${modelName}`,
    detail: "Preparando descarga del modelo..."
  });

  const removeListener = window.bridge.onPullProgress((data) => {
    let detail = data.status || "Descargando...";
    if (data.total > 0) {
      const pct = Math.round((data.completed / data.total) * 100);
      const totalMB = (data.total / 1e6).toFixed(0);
      detail = `${data.status} — ${pct}% de ${totalMB} MB`;
    }
    state.loadingPanel = { ...state.loadingPanel, detail };
    const el = document.getElementById("pull-progress-detail");
    if (el) {
      el.textContent = detail;
    }
  });

  try {
    await window.bridge.pullModel({
      baseUrl: state.settings.ollamaBaseUrl,
      modelName
    });
    await refreshOllamaModels(state.settings.ollamaBaseUrl);
  } catch (error) {
    state.ollama = { ok: false, message: `Error al descargar ${modelName}: ${error.message}` };
  } finally {
    removeListener();
    closeLoadingPanel();
  }
}

async function refreshOllamaModels(baseUrl) {
  try {
    state.availableModels = await window.bridge.listModels(baseUrl);
    state.ollama = {
      ok: true,
      message: state.availableModels.length
        ? `${state.availableModels.length} modelo${state.availableModels.length !== 1 ? "s" : ""} disponible${state.availableModels.length !== 1 ? "s" : ""}.`
        : "La IA está conectada, pero no hay modelos descargados."
    };
    state.settings = normalizeSettings(state.settings, state.availableModels);
    if (state.settingsDraft) {
      state.settingsDraft = normalizeSettings(state.settingsDraft, state.availableModels);
    }
  } catch (error) {
    state.ollama = { ok: false, message: error.message };
  }
}

async function askWithOllama(messages, options = {}) {
  const model = options.model || state.settings.currentModel;
  if (!model) {
    throw new Error("Activa un modelo local desde Configuracion LLM.");
  }

  return window.bridge.chat({
    baseUrl: state.settings.ollamaBaseUrl,
    model,
    messages,
    requestId: options.requestId || "",
    maxTokens: Number.isFinite(Number(options.maxTokens)) ? Number(options.maxTokens) : null,
    temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : null
  });
}

function makeAgentAskFn() {
  return async (messages, opts = {}) => askWithOllama(messages, opts);
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
      const _vms = visionModels();
      const _defaultVisionModel = currentModelSupportsVision()
        ? state.settings.currentModel
        : (_vms[0]?.name || "");
      state.lessonUi.cropAction = {
        open: true,
        x: clamp(rect.x + rect.width - 120, 10, Math.max(10, shell.clientWidth - 220)),
        y: clamp(rect.y + rect.height + 12, 10, Math.max(10, shell.clientHeight - 80)),
        visionModel: _defaultVisionModel
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
