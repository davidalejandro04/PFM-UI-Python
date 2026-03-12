const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const LESSONS_FILE = path.join(ROOT_DIR, "data", "lessons.json");

const DEFAULT_PROFILE = {
  name: "",
  avatar: "tutor",
  grade: "5.º",
  dailyGoal: 20,
  focusArea: "Resolución de problemas",
  responseMode: "coach",
  onboardingCompleted: false,
  xp: 0,
  lessonsCompleted: 0,
  completed: [],
  activity: []
};

const DEFAULT_SETTINGS = {
  inferenceProvider: "ollama",
  currentModel: "",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaModel: "",
  webllmModel: "Qwen3-0.6B-q4f16_1-MLC",
  webllmCustomModelId: "Qwen3.5-Custom-MLC",
  webllmCustomModelUrl: "",
  webllmCustomModelLibUrl: "",
  responseMode: "coach",
  theme: "light"
};

function userFile(name) {
  return path.join(app.getPath("userData"), name);
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
    modifiedAt: model.modified_at
  }));
}

async function chatWithOllama({ baseUrl, model, messages }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama devolvió ${response.status}`);
  }

  const payload = await response.json();
  return payload.message?.content || "";
}

async function bootstrap() {
  const lessons = JSON.parse(await fs.readFile(LESSONS_FILE, "utf8"));
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
    if (!settings.ollamaModel && availableModels[0]) {
      settings.ollamaModel = availableModels[0].name;
      shouldPersistSettings = true;
    }
    if (settings.inferenceProvider === "ollama" && !settings.currentModel && settings.ollamaModel) {
      settings.currentModel = settings.ollamaModel;
      shouldPersistSettings = true;
    }
    if (settings.inferenceProvider === "webllm" && !settings.currentModel && settings.webllmModel) {
      settings.currentModel = settings.webllmModel;
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
