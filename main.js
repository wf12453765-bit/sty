const {app,BrowserWindow,WebContentsView,ipcMain,shell,session}=require("electron");
const path=require("path"),fs=require("fs");

let win,activeTabId=0,nextId=1;
const tabs=new Map();
const storeFile=()=>path.join(app.getPath("userData"),"sty-data.json");
const defaults={settings:{home:"sty://home",search:"https://www.google.com/search?q=%s",theme:"dark"},bookmarks:[],history:[],downloads:[]};
function load(){try{return {...defaults,...JSON.parse(fs.readFileSync(storeFile(),"utf8"))};}catch{return JSON.parse(JSON.stringify(defaults));}}
function save(d){fs.mkdirSync(path.dirname(storeFile()),{recursive:true});fs.writeFileSync(storeFile(),JSON.stringify(d,null,2));}
let data=load();

function createWindow(){
 win=new BrowserWindow({width:1440,height:920,minWidth:960,minHeight:620,backgroundColor:"#0f172a",
  webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:false}});
 win.loadFile(path.join(__dirname,"src","index.html"));
 win.on("resize",layout);
}
function area(){const [w,h]=win.getContentSize();return{x:0,y:96,width:w,height:Math.max(0,h-96)}}
function layout(){const t=tabs.get(activeTabId);if(t)t.view.setBounds(area())}
function isHome(u){return u==="sty://home"}
function target(input){
 const v=String(input||"").trim();if(!v)return data.settings.home;
 if(isHome(v))return v;
 if(/^[a-z][a-z\d+.-]*:\/\//i.test(v))return v;
 if(/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v))return "https://"+v;
 return data.settings.search.replace("%s",encodeURIComponent(v));
}
async function loadTarget(t,input){
 const u=target(input);
 if(isHome(u)){await t.view.webContents.loadURL(`file://${path.join(__dirname,"src","home.html")}`);t.home=true;}
 else {t.home=false;await t.view.webContents.loadURL(u);}
 t.logicalUrl=u;notifyTab(t.id);return u;
}
function snapshotTabs(){return [...tabs.values()].map(t=>({id:t.id,title:t.view.webContents.getTitle()||"STY Browser",url:t.logicalUrl||t.view.webContents.getURL(),active:t.id===activeTabId,loading:t.view.webContents.isLoading()}))}
function notify(){win?.webContents.send("tabs",snapshotTabs())}
function notifyTab(id){
 const t=tabs.get(id);if(!t)return;
 win?.webContents.send("tab", {id,title:t.view.webContents.getTitle()||"STY Browser",url:t.logicalUrl||t.view.webContents.getURL(),back:t.view.webContents.canGoBack(),forward:t.view.webContents.canGoForward(),loading:t.view.webContents.isLoading()});
 notify();
}
function addHistory(t){
 const u=t.logicalUrl||t.view.webContents.getURL();if(!/^https?:/.test(u))return;
 data.history=[{url:u,title:t.view.webContents.getTitle()||u,time:new Date().toISOString()},...data.history.filter(x=>x.url!==u)].slice(0,1000);save(data);
 win?.webContents.send("data",data);
}
function switchTab(id){
 const t=tabs.get(id);if(!t)return;
 if(activeTabId&&tabs.has(activeTabId))win.contentView.removeChildView(tabs.get(activeTabId).view);
 activeTabId=id;win.contentView.addChildView(t.view);layout();notifyTab(id);
}
async function newTab(input=data.settings.home){
 const id=nextId++,view=new WebContentsView({webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const t={id,view,logicalUrl:target(input),home:false};tabs.set(id,t);
 view.webContents.setWindowOpenHandler(({url})=>{newTab(url);return{action:"deny"}});
 ["did-navigate","did-navigate-in-page","page-title-updated","did-start-loading","did-stop-loading"].forEach(e=>view.webContents.on(e,()=>{if(e==="did-navigate")addHistory(t);notifyTab(id)}));
 view.webContents.on("will-download",(_e,item)=>{
   const filename=item.getFilename(),savePath=path.join(app.getPath("downloads"),filename);
   item.setSavePath(savePath);
   const rec={id:Date.now().toString(),filename,url:item.getURL(),path:savePath,time:new Date().toISOString(),state:"progressing",received:0,total:item.getTotalBytes()};
   data.downloads=[rec,...data.downloads].slice(0,200);save(data);win.webContents.send("data",data);
   item.on("updated",()=>{rec.received=item.getReceivedBytes();rec.total=item.getTotalBytes();save(data);win.webContents.send("data",data)});
   item.once("done",(_e,state)=>{rec.state=state;save(data);win.webContents.send("data",data)});
 });
 if(activeTabId&&tabs.has(activeTabId))win.contentView.removeChildView(tabs.get(activeTabId).view);
 activeTabId=id;win.contentView.addChildView(view);layout();await loadTarget(t,input);return id;
}
function closeTab(id){
 const t=tabs.get(id);if(!t)return;
 win.contentView.removeChildView(t.view);t.view.webContents.close();tabs.delete(id);
 if(!tabs.size)newTab();else if(activeTabId===id)switchTab([...tabs.keys()][tabs.size-1]);else notify();
}

app.whenReady().then(async()=>{
 createWindow();await newTab();
 ipcMain.handle("new-tab",(_e,u)=>newTab(u));
 ipcMain.handle("close-tab",(_e,id)=>closeTab(id));
 ipcMain.handle("switch-tab",(_e,id)=>switchTab(id));
 ipcMain.handle("navigate",(_e,u)=>loadTarget(tabs.get(activeTabId),u));
 ipcMain.handle("back",()=>tabs.get(activeTabId)?.view.webContents.goBack());
 ipcMain.handle("forward",()=>tabs.get(activeTabId)?.view.webContents.goForward());
 ipcMain.handle("reload",()=>tabs.get(activeTabId)?.view.webContents.reload());
 ipcMain.handle("devtools",()=>tabs.get(activeTabId)?.view.webContents.openDevTools({mode:"detach"}));
 ipcMain.handle("downloads-folder",()=>shell.openPath(app.getPath("downloads")));
 ipcMain.handle("open-file",(_e,p)=>shell.openPath(p));
 ipcMain.handle("get-data",()=>data);
 ipcMain.handle("save-settings",(_e,s)=>{data.settings={...data.settings,...s};save(data);return data});
 ipcMain.handle("add-bookmark",(_e,b)=>{if(!data.bookmarks.some(x=>x.url===b.url))data.bookmarks.unshift({...b,time:new Date().toISOString()});save(data);return data});
 ipcMain.handle("remove-bookmark",(_e,u)=>{data.bookmarks=data.bookmarks.filter(x=>x.url!==u);save(data);return data});
 ipcMain.handle("clear-history",()=>{data.history=[];save(data);return data});
 ipcMain.handle("clear-downloads",()=>{data.downloads=[];save(data);return data});
 ipcMain.handle("home",()=>newTab(data.settings.home));
 win.webContents.on("did-finish-load",()=>win.webContents.send("data",data));
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});
