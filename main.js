const {app,BrowserWindow,WebContentsView,ipcMain,shell}=require("electron");
const path=require("path"),fs=require("fs");

let win,activeTabId=null,nextTabId=1;
const tabs=new Map();

function dataFile(name){return path.join(app.getPath("userData"),name);}
function readJSON(name,fallback=[]){try{return JSON.parse(fs.readFileSync(dataFile(name),"utf8"));}catch{return fallback;}}
function writeJSON(name,data){fs.writeFileSync(dataFile(name),JSON.stringify(data,null,2),"utf8");}

function createWindow(){
  win=new BrowserWindow({width:1400,height:900,minWidth:900,minHeight:600,
    webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false}});
  win.loadFile(path.join(__dirname,"src","index.html"));
  win.on("resize",layout);
}
function bounds(){const [w,h]=win.getContentSize();return{x:0,y:92,width:w,height:Math.max(0,h-92)};}
function layout(){const t=tabs.get(activeTabId);if(t)t.view.setBounds(bounds());}
function normalize(v){v=String(v||"").trim();if(!v)return"https://www.google.com";if(/^[a-z][a-z\d+.-]*:\/\//i.test(v))return v;if(/^[\w.-]+\.[a-z]{2,}/i.test(v))return"https://"+v;return"https://www.google.com/search?q="+encodeURIComponent(v);}
function sendTabs(){win?.webContents.send("tabs-updated",[...tabs.values()].map(t=>({id:t.id,title:t.view.webContents.getTitle()||"新标签页",url:t.view.webContents.getURL(),active:t.id===activeTabId})));}
function state(id){const t=tabs.get(id);if(t)win.webContents.send("tab-state",{id,title:t.view.webContents.getTitle()||"新标签页",url:t.view.webContents.getURL(),back:t.view.webContents.canGoBack(),forward:t.view.webContents.canGoForward()});}

async function newTab(url="https://www.google.com"){
  const id=nextTabId++,view=new WebContentsView({webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  tabs.set(id,{id,view});
  view.webContents.setWindowOpenHandler(({url})=>{newTab(url);return{action:"deny"};});
  const update=()=>{state(id);sendTabs();};
  ["did-navigate","did-navigate-in-page","page-title-updated","did-stop-loading"].forEach(e=>view.webContents.on(e,update));
  view.webContents.on("will-download",(_e,item)=>{const p=path.join(app.getPath("downloads"),item.getFilename());item.setSavePath(p);item.once("done",()=>win.webContents.send("download-finished",{filename:item.getFilename(),path:p}));});
  await view.webContents.loadURL(normalize(url));
  if(activeTabId){const old=tabs.get(activeTabId);if(old)win.contentView.removeChildView(old.view);}
  activeTabId=id;win.contentView.addChildView(view);layout();sendTabs();state(id);
}
function activate(id){const t=tabs.get(id);if(!t)return;if(activeTabId){const old=tabs.get(activeTabId);if(old)win.contentView.removeChildView(old.view);}activeTabId=id;win.contentView.addChildView(t.view);layout();sendTabs();state(id);}
function closeTab(id){const t=tabs.get(id);if(!t)return;win.contentView.removeChildView(t.view);t.view.webContents.close();tabs.delete(id);if(!tabs.size)return newTab();if(activeTabId===id)activate([...tabs.keys()][tabs.size-1]);else sendTabs();}

app.whenReady().then(async()=>{
  createWindow(); await newTab();
  ipcMain.handle("new-tab",(_e,u)=>newTab(u));
  ipcMain.handle("activate-tab",(_e,id)=>activate(id));
  ipcMain.handle("close-tab",(_e,id)=>closeTab(id));
  ipcMain.handle("navigate",(_e,u)=>{const t=tabs.get(activeTabId);if(t)t.view.webContents.loadURL(normalize(u));});
  ipcMain.handle("back",()=>{const t=tabs.get(activeTabId);if(t?.view.webContents.canGoBack())t.view.webContents.goBack();});
  ipcMain.handle("forward",()=>{const t=tabs.get(activeTabId);if(t?.view.webContents.canGoForward())t.view.webContents.goForward();});
  ipcMain.handle("reload",()=>tabs.get(activeTabId)?.view.webContents.reload());
  ipcMain.handle("devtools",()=>tabs.get(activeTabId)?.view.webContents.openDevTools({mode:"detach"}));
  ipcMain.handle("downloads",()=>shell.openPath(app.getPath("downloads")));
  ipcMain.handle("get-bookmarks",()=>readJSON("bookmarks.json",[]));
  ipcMain.handle("add-bookmark",(_e,b)=>{const a=readJSON("bookmarks.json",[]);if(!a.some(x=>x.url===b.url)){a.unshift({...b,createdAt:new Date().toISOString()});writeJSON("bookmarks.json",a);}return a;});
  ipcMain.handle("remove-bookmark",(_e,url)=>{const a=readJSON("bookmarks.json",[]).filter(x=>x.url!==url);writeJSON("bookmarks.json",a);return a;});
  ipcMain.handle("get-history",()=>readJSON("history.json",[]));
  ipcMain.handle("clear-history",()=>{writeJSON("history.json",[]);return[];});
  ipcMain.handle("open-url",(_e,u)=>newTab(u));
  win.webContents.on("did-finish-load",()=>{win.webContents.send("initial-data",{bookmarks:readJSON("bookmarks.json",[]),history:readJSON("history.json",[])});});
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
