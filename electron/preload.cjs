const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridge", {
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  saveProfile: (profile) => ipcRenderer.invoke("profile:save", profile),
  resetProfile: () => ipcRenderer.invoke("profile:reset"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  listModels: (baseUrl) => ipcRenderer.invoke("ollama:list-models", baseUrl),
  chat: (payload) => ipcRenderer.invoke("ollama:chat", payload),
  cancelChat: (requestId) => ipcRenderer.invoke("ollama:cancel-chat", requestId),
  pullModel: (payload) => ipcRenderer.invoke("ollama:pull-model", payload),
  onPullProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("ollama:pull-progress", handler);
    return () => ipcRenderer.removeListener("ollama:pull-progress", handler);
  },
  onChatToken: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("ollama:chat-token", handler);
    return () => ipcRenderer.removeListener("ollama:chat-token", handler);
  },
  wipeData: () => ipcRenderer.invoke("data:wipe"),
  getDataPath: () => ipcRenderer.invoke("data:path"),
  captureRegion: (rect) => ipcRenderer.invoke("window:capture-region", rect),
  ragSearch: (query) => ipcRenderer.invoke("rag:search", query)
});
