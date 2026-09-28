const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("browserAPI", {
  newTab: (url) => ipcRenderer.invoke("new-tab", url),
  closeTab: (id) => ipcRenderer.invoke("close-tab", id),
  activateTab: (id) => ipcRenderer.invoke("activate-tab", id),
  navigate: (url) => ipcRenderer.invoke("navigate", url),
  back: () => ipcRenderer.invoke("back"),
  forward: () => ipcRenderer.invoke("forward"),
  reload: () => ipcRenderer.invoke("reload"),
  devtools: () => ipcRenderer.invoke("devtools"),
  openDownloads: () => ipcRenderer.invoke("open-downloads"),
  onTabsUpdated: (callback) => ipcRenderer.on("tabs-updated", (_e, data) => callback(data)),
  onTabState: (callback) => ipcRenderer.on("tab-state", (_e, data) => callback(data)),
  onDownloadFinished: (callback) => ipcRenderer.on("download-finished", (_e, data) => callback(data))
});
