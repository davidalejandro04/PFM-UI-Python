const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT_DIR = path.join(__dirname, "..");
const LESSON_CATALOG_DIR = path.join(ROOT_DIR, "data", "lesson-catalog");

const DEFAULT_PROFILE = {
  name: "",
  avatar: "tutor",
  grade: "5.o",
  dailyGoal: 20,
  focusArea: "Resolucion de problemas",
  responseMode: "coach",
  onboardingCompleted: false,
  xp: 0,
  lessonsCompleted: 0,
  completed: [],
  activity: [],
  conceptProgress: [],
  tutorSessions: [],
  struggleSignals: [],
  lessonFlashcards: [],
  interactionLog: []
};

const DEFAULT_SETTINGS = {
  currentModel: "",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  responseMode: "coach",
  theme: "light"
};

const activeChatControllers = new Map();
let lessonCatalogModulePromise = null;

function getLessonCatalogModule() {
  if (!lessonCatalogModulePromise) {
    const moduleUrl = pathToFileURL(path.join(ROOT_DIR, "src", "utils", "lesson-catalog.mjs")).href;
    lessonCatalogModulePromise = import(moduleUrl);
  }
  return lessonCatalogModulePromise;
}

function userFile(name) {
  return path.join(app.getPath("userData"), name);
}

function sanitizeRect(rect = {}) {
  return {
    x: Math.max(0, Math.round(Number(rect.x) || 0)),
    y: Math.max(0, Math.round(Number(rect.y) || 0)),
    width: Math.max(1, Math.round(Number(rect.width) || 0)),
    height: Math.max(1, Math.round(Number(rect.height) || 0))
  };
}

async function readJson(filePath, defaults) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  return data;
}

async function listOllamaModels(baseUrl) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
  if (!response.ok) {
    throw new Error(`No se pudo consultar Ollama (${response.status})`);
  }

  const payload = await response.json();
  return (payload.models || []).map((model) => ({
    name: model.name,
    size: model.size,
    modifiedAt: model.modified_at,
    details: model.details || {}
  }));
}

async function chatWithOllama({
  baseUrl,
  model,
  messages,
  requestId = "",
  maxTokens = null,
  temperature = null
}) {
  const safeRequestId = String(requestId || "").trim();
  const controller = new AbortController();
  if (safeRequestId) {
    activeChatControllers.set(safeRequestId, controller);
  }

  const ollamaOptions = {};
  if (Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0) {
    ollamaOptions.num_predict = Math.round(Number(maxTokens));
  }
  if (Number.isFinite(Number(temperature))) {
    ollamaOptions.temperature = Number(temperature);
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages,
        ...(Object.keys(ollamaOptions).length ? { options: ollamaOptions } : {})
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama devolvio ${response.status}`);
    }

    const payload = await response.json();
    return payload.message?.content || "";
  } catch (error) {
    if (error?.name === "AbortError") {
      const abortError = new Error("Solicitud cancelada.");
      abortError.name = "AbortError";
      throw abortError;
    }
    throw error;
  } finally {
    if (safeRequestId) {
      activeChatControllers.delete(safeRequestId);
    }
  }
}

function cancelOllamaChat(_event, requestId) {
  const safeRequestId = String(requestId || "").trim();
  const controller = activeChatControllers.get(safeRequestId);
  if (!controller) {
    return { ok: false };
  }

  controller.abort();
  activeChatControllers.delete(safeRequestId);
  return { ok: true };
}

async function captureRegion(event, rect) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    throw new Error("No se encontro una ventana activa para capturar.");
  }

  const bounds = sanitizeRect(rect);
  const image = await window.capturePage(bounds);
  return {
    mimeType: "image/png",
    base64: image.toPNG().toString("base64")
  };
}

async function bootstrap() {
  const { loadLessonCatalogFromDirectory } = await getLessonCatalogModule();
  const lessons = await loadLessonCatalogFromDirectory(LESSON_CATALOG_DIR);
  const profile = await readJson(userFile("profile.json"), DEFAULT_PROFILE);
  const settings = await readJson(userFile("settings.json"), DEFAULT_SETTINGS);
  let shouldPersistSettings = false;

  let availableModels = [];
  let ollama = { ok: false, message: "Ollama no disponible." };

  try {
    availableModels = await listOllamaModels(settings.ollamaBaseUrl);
    ollama = {
      ok: true,
      message: availableModels.length
        ? `${availableModels.length} modelos detectados en Ollama.`
        : "Ollama responde, pero no hay modelos descargados."
    };
    if (!settings.currentModel && settings.ollamaModel) {
      settings.currentModel = settings.ollamaModel;
      shouldPersistSettings = true;
    }
    if (!settings.currentModel && availableModels[0]) {
      settings.currentModel = availableModels[0].name;
      shouldPersistSettings = true;
    }
  } catch (error) {
    ollama = { ok: false, message: error.message };
  }

  if (shouldPersistSettings) {
    await writeJson(userFile("settings.json"), settings);
  }

  return { lessons, profile, settings, availableModels, ollama };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f6f1e8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(ROOT_DIR, "src", "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("app:bootstrap", bootstrap);
  ipcMain.handle("profile:save", (_event, profile) => writeJson(userFile("profile.json"), profile));
  ipcMain.handle("profile:reset", async () => {
    const profile = {
      ...DEFAULT_PROFILE,
      onboardingCompleted: true
    };
    await writeJson(userFile("profile.json"), profile);
    return profile;
  });
  ipcMain.handle("settings:save", (_event, settings) => writeJson(userFile("settings.json"), settings));
  ipcMain.handle("ollama:list-models", (_event, baseUrl) => listOllamaModels(baseUrl));
  ipcMain.handle("ollama:chat", (_event, payload) => chatWithOllama(payload));
  ipcMain.handle("ollama:cancel-chat", cancelOllamaChat);
  ipcMain.handle("window:capture-region", captureRegion);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
