const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs/promises");
const fsSync = require("fs");
const crypto = require("crypto");
const path = require("path");
const { pathToFileURL } = require("url");

const APP_DATA_NAME = ".TutorMate";
const DATA_DIR = path.join(app.getPath("appData"), APP_DATA_NAME);
app.setPath("userData", DATA_DIR);

const ROOT_DIR = path.join(__dirname, "..");
const LESSON_CATALOG_DIR = path.join(ROOT_DIR, "data", "lesson-catalog");

const DEFAULT_PROFILE = {
  name: "",
  avatar: "",
  grade: "",
  dailyGoal: 20,
  focusArea: "",
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

const REQUIRED_MODEL = "gemma3:4b";

const DEFAULT_SETTINGS = {
  currentModel: REQUIRED_MODEL,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  responseMode: "coach",
  theme: "light",
  agentMode: true,
  agentRouterModel: REQUIRED_MODEL,
  agentTutorModel: REQUIRED_MODEL,
  agentFunctionModel: REQUIRED_MODEL
};

const activeChatControllers = new Map();
let lessonCatalogModulePromise = null;
let ragModulePromise = null;
let ragRetriever = null;
let machineId = null;

function getLessonCatalogModule() {
  if (!lessonCatalogModulePromise) {
    const moduleUrl = pathToFileURL(path.join(ROOT_DIR, "src", "utils", "lesson-catalog.mjs")).href;
    lessonCatalogModulePromise = import(moduleUrl);
  }
  return lessonCatalogModulePromise;
}

function getRAGModule() {
  if (!ragModulePromise) {
    const moduleUrl = pathToFileURL(path.join(ROOT_DIR, "src", "rag", "index.mjs")).href;
    ragModulePromise = import(moduleUrl);
  }
  return ragModulePromise;
}

function userFile(name) {
  return path.join(app.getPath("userData"), name);
}

function ensureMachineId() {
  const idPath = userFile("machine-id");
  try {
    machineId = fsSync.readFileSync(idPath, "utf8").trim();
  } catch {
    machineId = crypto.randomUUID();
    fsSync.mkdirSync(path.dirname(idPath), { recursive: true });
    fsSync.writeFileSync(idPath, machineId, "utf8");
  }
  return machineId;
}

async function wipeUserData() {
  const dataPath = app.getPath("userData");
  try {
    await fs.rm(dataPath, { recursive: true, force: true });
  } catch {
    // Directory may already be gone or locked.
  }
}

async function confirmAndWipeData(parentWindow) {
  const options = {
    type: "question",
    buttons: ["Conservar datos", "Eliminar datos"],
    defaultId: 0,
    cancelId: 0,
    title: "Datos de Mi cuaderno",
    message: "¿Quieres borrar todos los datos de Mi cuaderno?",
    detail: `Esto borrará tu perfil, progreso y configuración guardados en:\n${app.getPath("userData")}`
  };
  const { response } = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options);
  if (response === 1) {
    await wipeUserData();
    return true;
  }
  return false;
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

async function preloadModel(baseUrl, modelName) {
  try {
    await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: [],
        keep_alive: "30m",
        options: { num_gpu: 999, use_mmap: true, flash_attn: true }
      })
    });
  } catch {
    // Model preload is best-effort; ignore errors.
  }
}

async function chatWithOllama({
  baseUrl,
  model,
  messages,
  requestId = "",
  maxTokens = null,
  temperature = null,
  webContents = null
}) {
  const safeRequestId = String(requestId || "").trim();
  const controller = new AbortController();
  if (safeRequestId) {
    activeChatControllers.set(safeRequestId, controller);
  }

  const ollamaOptions = {
    num_ctx: 1024,          // minimal context window — fastest inference
    num_predict: 1024,      // max output tokens
    temperature: 0.4,       // lower temp = faster convergence, less sampling
    num_thread: 0,          // 0 = auto-detect optimal thread count
    num_gpu: 999,           // offload all layers to GPU
    num_batch: 1024,        // large batch = faster prompt processing
    mirostat: 0,            // disabled for speed
    repeat_penalty: 1.0,    // no penalty check = faster
    top_k: 10,              // very narrow sampling = faster token selection
    top_p: 0.85,            // tighter nucleus
    use_mmap: true,         // memory-mapped model loading
    low_vram: false,        // don't restrict GPU usage
    flash_attn: true,       // enable flash attention if supported
  };
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
        stream: true,
        messages,
        keep_alive: "30m",
        options: ollamaOptions
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.error || errBody?.message || "";
      } catch {
        // ignore parse failure
      }
      throw new Error(`Ollama devolvio ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    // Stream NDJSON response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          const token = data.message?.content || "";
          if (token) {
            fullContent += token;
            if (webContents && !webContents.isDestroyed()) {
              webContents.send("ollama:chat-token", { requestId: safeRequestId, token });
            }
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }

    return fullContent;
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

async function pullOllamaModel(event, { baseUrl, modelName }) {
  const url = `${(baseUrl || "http://127.0.0.1:11434").replace(/\/$/, "")}/api/pull`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName, stream: true })
  });

  if (!response.ok) {
    throw new Error(`Ollama pull fallo (${response.status})`);
  }

  const webContents = event.sender;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        webContents.send("ollama:pull-progress", {
          modelName,
          status: data.status || "",
          total: data.total || 0,
          completed: data.completed || 0
        });
      } catch {
        // skip malformed JSON lines
      }
    }
  }

  return { ok: true };
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
  ensureMachineId();

  const { loadLessonCatalogFromDirectory } = await getLessonCatalogModule();
  const lessons = await loadLessonCatalogFromDirectory(LESSON_CATALOG_DIR);

  // Build RAG index from lesson catalog
  try {
    const { chunkLessonCatalog, RAGIndex, Retriever } = await getRAGModule();
    const chunks = chunkLessonCatalog(lessons);
    const index = new RAGIndex();
    index.build(chunks);
    ragRetriever = new Retriever(index);
  } catch (err) {
    console.warn("[rag] No se pudo construir el indice RAG:", err.message);
  }

  const profile = await readJson(userFile("profile.json"), DEFAULT_PROFILE);
  const settings = await readJson(userFile("settings.json"), DEFAULT_SETTINGS);
  let shouldPersistSettings = false;

  let availableModels = [];
  let ollama = { ok: false, message: "No se encontró la IA. Asegúrate de que Ollama esté en marcha." };

  try {
    availableModels = await listOllamaModels(settings.ollamaBaseUrl);
    ollama = {
      ok: true,
      message: availableModels.length
        ? `${availableModels.length} modelo${availableModels.length !== 1 ? "s" : ""} disponible${availableModels.length !== 1 ? "s" : ""}.`
        : "La IA está conectada, pero no hay modelos descargados."
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

  // Preload the active model into VRAM for faster first response
  if (ollama.ok && settings.currentModel) {
    preloadModel(settings.ollamaBaseUrl, settings.currentModel);
  }

  return {
    lessons, profile, settings, availableModels, ollama,
    requiredModel: REQUIRED_MODEL,
    machineId,
    dataPath: app.getPath("userData")
  };
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
  ipcMain.handle("ollama:chat", async (event, payload) => {
    if (payload.useRAG && ragRetriever) {
      try {
        const { augmentPromptWithContext } = await getRAGModule();
        const query = (payload.messages || [])
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .pop() || "";
        if (query) {
          const { context } = ragRetriever.retrieve(query);
          if (context && Array.isArray(payload.messages) && payload.messages.length > 0) {
            const firstMsg = payload.messages[0];
            if (firstMsg.role === "system") {
              payload.messages = [
                { ...firstMsg, content: augmentPromptWithContext(firstMsg.content, context) },
                ...payload.messages.slice(1)
              ];
            }
          }
        }
      } catch (err) {
        console.warn("[rag] Error augmenting chat:", err.message);
      }
    }
    return chatWithOllama({ ...payload, webContents: event.sender });
  });
  ipcMain.handle("ollama:cancel-chat", cancelOllamaChat);
  ipcMain.handle("rag:search", async (_event, query) => {
    if (!ragRetriever) return { context: "", sources: [] };
    return ragRetriever.retrieve(String(query || ""));
  });
  ipcMain.handle("ollama:pull-model", pullOllamaModel);
  ipcMain.handle("data:wipe", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return confirmAndWipeData(win);
  });
  ipcMain.handle("data:path", () => app.getPath("userData"));
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
