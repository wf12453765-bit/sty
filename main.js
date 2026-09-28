const { app, BrowserWindow, WebContentsView, ipcMain, session, shell } = require("electron");
const path = require("path");

let mainWindow;
const tabs = new Map();
let activeTabId = null;
let nextTabId = 1;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#111827",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));

  mainWindow.on("resize", layoutActiveTab);
}

function getWebViewBounds() {
  const [width, height] = mainWindow.getContentSize();
  return {
    x: 0,
    y: 92,
    width,
    height: Math.max(0, height - 92)
  };
}

function layoutActiveTab() {
  const tab = tabs.get(activeTabId);
  if (tab) tab.view.setBounds(getWebViewBounds());
}

function normalizeUrl(input) {
  const value = String(input || "").trim();
  if (!value) return "https://www.google.com";

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)) return value;
  if (/^localhost(:\d+)?(\/.*)?$/.test(value)) return `http://${value}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) return `https://${value}`;

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

async function createTab(url = "https://www.google.com") {
  const id = nextTabId++;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  tabs.set(id, { id, view, url });

  view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    createTab(targetUrl);
    return { action: "deny" };
  });

  view.webContents.on("did-navigate", () => sendTabState(id));
  view.webContents.on("did-navigate-in-page", () => sendTabState(id));
  view.webContents.on("page-title-updated", () => sendTabState(id));
  view.webContents.on("did-start-loading", () => sendTabState(id));
  view.webContents.on("did-stop-loading", () => sendTabState(id));

  view.webContents.on("will-download", (_event, item) => {
    const downloadsPath = app.getPath("downloads");
    const savePath = path.join(downloadsPath, item.getFilename());
    item.setSavePath(savePath);
    item.once("done", (_event, state) => {
      mainWindow.webContents.send("download-finished", {
        filename: item.getFilename(),
        path: savePath,
        state
      });
    });
  });

  await view.webContents.loadURL(normalizeUrl(url));

  if (activeTabId) {
    const old = tabs.get(activeTabId);
    if (old) mainWindow.contentView.removeChildView(old.view);
  }

  activeTabId = id;
  mainWindow.contentView.addChildView(view);
  layoutActiveTab();
  sendAllTabs();
  return id;
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;

  mainWindow.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  tabs.delete(id);

  if (tabs.size === 0) {
    createTab();
    return;
  }

  if (activeTabId === id) {
    activeTabId = [...tabs.keys()][tabs.size - 1];
    const next = tabs.get(activeTabId);
    mainWindow.contentView.addChildView(next.view);
    layoutActiveTab();
  }

  sendAllTabs();
}

function activateTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;

  if (activeTabId) {
    const current = tabs.get(activeTabId);
    if (current) mainWindow.contentView.removeChildView(current.view);
  }

  activeTabId = id;
  mainWindow.contentView.addChildView(tab.view);
  layoutActiveTab();
  sendAllTabs();
  sendTabState(id);
}

function sendTabState(id) {
  const tab = tabs.get(id);
  if (!tab || !mainWindow) return;

  mainWindow.webContents.send("tab-state", {
    id,
    title: tab.view.webContents.getTitle() || "新标签页",
    url: tab.view.webContents.getURL(),
    canGoBack: tab.view.webContents.canGoBack(),
    canGoForward: tab.view.webContents.canGoForward(),
    loading: tab.view.webContents.isLoading()
  });
}

function sendAllTabs() {
  if (!mainWindow) return;
  const data = [...tabs.values()].map(tab => ({
    id: tab.id,
    title: tab.view.webContents.getTitle() || "新标签页",
    url: tab.view.webContents.getURL(),
    active: tab.id === activeTabId
  }));
  mainWindow.webContents.send("tabs-updated", data);
}

app.whenReady().then(async () => {
  createWindow();
  await createTab();

  ipcMain.handle("new-tab", (_event, url) => createTab(url));
  ipcMain.handle("close-tab", (_event, id) => closeTab(id));
  ipcMain.handle("activate-tab", (_event, id) => activateTab(id));

  ipcMain.handle("navigate", (_event, input) => {
    const tab = tabs.get(activeTabId);
    if (tab) tab.view.webContents.loadURL(normalizeUrl(input));
  });

  ipcMain.handle("back", () => {
    const tab = tabs.get(activeTabId);
    if (tab?.view.webContents.canGoBack()) tab.view.webContents.goBack();
  });

  ipcMain.handle("forward", () => {
    const tab = tabs.get(activeTabId);
    if (tab?.view.webContents.canGoForward()) tab.view.webContents.goForward();
  });

  ipcMain.handle("reload", () => {
    const tab = tabs.get(activeTabId);
    if (tab) tab.view.webContents.reload();
  });

  ipcMain.handle("devtools", () => {
    const tab = tabs.get(activeTabId);
    if (tab) tab.view.webContents.openDevTools({ mode: "detach" });
  });

  ipcMain.handle("open-downloads", () => {
    shell.openPath(app.getPath("downloads"));
  });

  ipcMain.handle("open-external", (_event, url) => {
    shell.openExternal(url);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
