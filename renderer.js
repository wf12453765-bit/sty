const tabsEl = document.getElementById("tabs");
const addressEl = document.getElementById("address");
const addressForm = document.getElementById("addressForm");
const menu = document.getElementById("menu");

function renderTabs(tabs) {
  tabsEl.innerHTML = "";

  for (const tab of tabs) {
    const el = document.createElement("div");
    el.className = `tab ${tab.active ? "active" : ""}`;
    el.dataset.id = tab.id;

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "新标签页";

    const close = document.createElement("span");
    close.className = "close";
    close.textContent = "×";
    close.title = "关闭";

    el.appendChild(title);
    el.appendChild(close);

    el.addEventListener("click", (event) => {
      if (event.target === close) {
        window.browserAPI.closeTab(tab.id);
      } else {
        window.browserAPI.activateTab(tab.id);
      }
    });

    tabsEl.appendChild(el);
  }
}

addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  window.browserAPI.navigate(addressEl.value);
});

document.getElementById("newTab").addEventListener("click", () => {
  window.browserAPI.newTab();
});

document.getElementById("back").addEventListener("click", () => {
  window.browserAPI.back();
});

document.getElementById("forward").addEventListener("click", () => {
  window.browserAPI.forward();
});

document.getElementById("reload").addEventListener("click", () => {
  window.browserAPI.reload();
});

document.getElementById("devtools").addEventListener("click", () => {
  menu.classList.add("hidden");
  window.browserAPI.devtools();
});

document.getElementById("downloads").addEventListener("click", () => {
  window.browserAPI.openDownloads();
});

document.getElementById("openDownloads").addEventListener("click", () => {
  menu.classList.add("hidden");
  window.browserAPI.openDownloads();
});

document.getElementById("menuBtn").addEventListener("click", () => {
  menu.classList.toggle("hidden");
});

window.browserAPI.onTabsUpdated(renderTabs);

window.browserAPI.onTabState((state) => {
  addressEl.value = state.url || "";
  document.title = state.title ? `${state.title} - STY Browser` : "STY Browser";
});

window.browserAPI.onDownloadFinished((data) => {
  console.log("下载完成:", data);
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
    event.preventDefault();
    addressEl.focus();
    addressEl.select();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") {
    event.preventDefault();
    window.browserAPI.newTab();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
    event.preventDefault();
  }

  if (event.key === "F12") {
    event.preventDefault();
    window.browserAPI.devtools();
  }
});
