const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridge", {
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  saveProfile: (profile) => ipcRenderer.invoke("profile:save", profile),
  resetProfile: () => ipcRenderer.invoke("profile:reset"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  listModels: (baseUrl) => ipcRenderer.invoke("ollama:list-models", baseUrl),
  chat: (payload) => ipcRenderer.invoke("ollama:chat", payload),
  cancelChat: (requestId) => ipcRenderer.invoke("ollama:cancel-chat", requestId),
  captureRegion: (rect) => ipcRenderer.invoke("window:capture-region", rect)
});
