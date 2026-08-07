const STORAGE_KEY = "photo-paper-keeper-v1";
const SETTINGS_KEY = "photo-paper-settings-v1";
const PATTERN_IMAGES_KEY = "photo-paper-pattern-images-v1";
const DAY = 86400000;

const $ = (selector) => document.querySelector(selector);
const list = $("#paper-list");
const dialog = $("#paper-dialog");
const form = $("#paper-form");
let activeFilter = "all";
let activeModelFilter = "all";
let activePatternFilter = "all";
let activeSort = "expiry-asc";
let activeView = "inventory";
let activeModel = "SQ";
const PATTERNS = {
  SQ: ["白边", "彩虹", "黑边", "落日", "汉白玉", "星空"],
  mini: ["白边", "黑边", "彩虹", "其他"],
  Wide: ["白边", "黑边", "其他"]
};
const SWATCHES = { 白边: "#ede9df", 彩虹: "linear-gradient(135deg,#ec7764,#efc45f,#77b98c,#719be0)", 黑边: "#282723", 落日: "linear-gradient(135deg,#f6c265,#db6246)", 汉白玉: "linear-gradient(135deg,#f3f0e8,#c8c1b5)", 星空: "linear-gradient(135deg,#18243c,#60518e)" };
let papers = loadPapers();
let settings = loadSettings();
let patternImages = loadPatternImages();
let pendingPatternImageKey = "";
let deferredInstallPrompt = null;

function loadSettings() {
  try { return { warningMonths: 6, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
  catch { return { warningMonths: 6 }; }
}

function loadPatternImages() {
  try { return JSON.parse(localStorage.getItem(PATTERN_IMAGES_KEY)) || {}; }
  catch { return {}; }
}

function loadPapers() {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map((paper) => {
      if (paper.model && paper.pattern) return { unit: "张", ...paper };
      const matchedPattern = PATTERNS.SQ.find((pattern) => paper.name?.includes(pattern)) || "白边";
      return { unit: "张", ...paper, model: "SQ", pattern: matchedPattern, customName: paper.name === matchedPattern ? "" : paper.name };
    });
  }
  catch { return []; }
}

function savePapers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(papers));
}

function safe(text) {
  const node = document.createElement("div");
  node.textContent = text;
  return node.innerHTML;
}

function daysUntil(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${date}T00:00:00`) - today) / DAY);
}

function statusFor(paper) {
  const days = daysUntil(paper.expiry);
  if (days < 0) return { key: "expired", label: `已过期 ${Math.abs(days)} 天` };
  if (days <= settings.warningMonths * 30) return { key: "expiring", label: days === 0 ? "今天过期" : `${formatRemaining(days)}后过期` };
  return { key: "fresh", label: "状态良好" };
}

function formatRemaining(days) {
  if (days <= 30) return `${days}天`;
  return `${Math.ceil(days / 30)}个月`;
}

function isLow(paper) {
  return paper.unit === "盒" ? paper.quantity <= 1 : paper.quantity <= 10;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00`));
}

function formatMoney(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value);
}

function render() {
  const query = $("#search-input").value.trim().toLowerCase();
  const visible = papers
    .filter((paper) => {
      const status = statusFor(paper).key;
      const filterMatch = activeFilter === "all" || status === activeFilter || (activeFilter === "low" && isLow(paper));
      const searchMatch = `${paper.name} ${paper.note}`.toLowerCase().includes(query);
      const patternMatch = activePatternFilter === "all"
        || (activePatternFilter === "base" && paper.pattern === "白边")
        || (activePatternFilter === "floral" && paper.pattern !== "白边")
        || paper.pattern === activePatternFilter;
      const modelMatch = activeModelFilter === "all" || paper.model === activeModelFilter;
      return filterMatch && searchMatch && patternMatch && modelMatch;
    })
    .sort((a, b) => {
      if (activeSort === "expiry-desc") return b.expiry.localeCompare(a.expiry);
      return a.expiry.localeCompare(b.expiry);
    });

  const totals = papers.reduce((result, paper) => ({ ...result, [paper.unit || "张"]: result[paper.unit || "张"] + Number(paper.quantity) }), { 盒: 0, 张: 0 });
  const value = papers.reduce((sum, paper) => sum + Number(paper.price), 0);
  const expiring = papers.filter((paper) => ["expiring", "expired"].includes(statusFor(paper).key)).length;
  const nearest = [...papers].filter((paper) => daysUntil(paper.expiry) >= 0).sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
  $("#total-count").textContent = [totals.盒 ? `${totals.盒}盒` : "", totals.张 ? `${totals.张}张` : ""].filter(Boolean).join(" · ") || "0张";
  $("#total-value").textContent = formatMoney(value).replace(".00", "");
  $("#expiring-count").textContent = expiring;
  $("#nearest-expiry").textContent = nearest ? formatRemaining(daysUntil(nearest.expiry)) : "暂无";
  $("#nearest-name").textContent = nearest?.name || "";
  $("#threshold-label").textContent = `${settings.warningMonths}个月`;
  $("#item-count").textContent = `${visible.length} 条`;

  if (!visible.length) {
    list.innerHTML = `<div class="empty"><strong>${papers.length ? "没有匹配的相纸" : "还没有记录相纸"}</strong><span>${papers.length ? "试试切换筛选条件" : "点击右下角的＋添加第一盒"}</span></div>`;
    renderPatterns();
    return;
  }

  list.innerHTML = visible.map((paper) => {
    const status = statusFor(paper);
    return `<article class="paper-card ${status.key}">
      <div class="card-top">
        <div><h3>${safe(paper.name)}</h3><p class="note">${safe(`${paper.model || "未分类"} · ${paper.pattern || "未分类"}${paper.note ? ` · ${paper.note}` : ""}`)}</p></div>
        <span class="status">${status.label}</span>
      </div>
      <div class="card-data">
        <div><span>剩余数量</span><strong>${paper.quantity} ${paper.unit || "张"}${isLow(paper) ? " · 库存低" : ""}</strong></div>
        <div><span>购买价格</span><strong>${formatMoney(paper.price)}</strong></div>
        <div><span>过期日期</span><strong>${formatDate(paper.expiry)}</strong></div>
      </div>
      <div class="card-actions"><button data-edit="${paper.id}">编辑</button><button class="delete" data-delete="${paper.id}">删除</button></div>
    </article>`;
  }).join("");
  renderPatterns();
}

function renderPatterns() {
  const patterns = PATTERNS[activeModel];
  $("#pattern-grid").innerHTML = patterns.map((pattern) => {
    const quantities = papers.filter((paper) => paper.model === activeModel && paper.pattern === pattern).reduce((result, paper) => ({ ...result, [paper.unit || "张"]: result[paper.unit || "张"] + Number(paper.quantity) }), { 盒: 0, 张: 0 });
    const quantityText = [quantities.盒 ? `${quantities.盒}盒` : "", quantities.张 ? `${quantities.张}张` : ""].filter(Boolean).join(" · ") || "0张";
    const isBase = pattern === "白边";
    const imageKey = `${activeModel}:${pattern}`;
    const customImage = patternImages[imageKey];
    return `<article class="pattern-tile ${isBase ? "base" : ""} ${customImage ? "has-image" : ""}" style="--swatch:${SWATCHES[pattern] || "#d8d1c5"}">
      <div class="pattern-actions"><button data-pattern-image="${safe(imageKey)}">${customImage ? "更换图片" : "选择图片"}</button>${customImage ? `<button data-pattern-reset="${safe(imageKey)}">恢复默认</button>` : ""}</div>
      <span>${isBase ? "基础款" : "花边款"}</span><h3>${safe(pattern)}</h3><strong>${quantityText}</strong>
      ${customImage ? `<div class="pattern-photo" style="background-image:url('${customImage}')"></div>` : ""}
    </article>`;
  }).join("");
}

function compressPatternImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSize = 600;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.76));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function updatePatternOptions(selected) {
  const model = $("#paper-model").value;
  $("#paper-pattern").innerHTML = PATTERNS[model].map((pattern) => `<option${pattern === selected ? " selected" : ""}>${pattern}</option>`).join("");
}

function populateDate(expiry) {
  const currentYear = new Date().getFullYear();
  const picked = expiry ? expiry.split("-").map(Number) : [currentYear + 1, 1, 1];
  const startYear = Math.min(currentYear - 5, picked[0]);
  $("#expiry-year").innerHTML = Array.from({ length: currentYear + 15 - startYear + 1 }, (_, i) => startYear + i).map((year) => `<option${year === picked[0] ? " selected" : ""}>${year}年</option>`).join("");
  $("#expiry-month").innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map((month) => `<option value="${month}"${month === picked[1] ? " selected" : ""}>${month}月</option>`).join("");
  updateDays(picked[2]);
}

function updateDays(selectedDay) {
  const year = Number($("#expiry-year").value.replace("年", ""));
  const month = Number($("#expiry-month").value);
  const max = new Date(year, month, 0).getDate();
  const day = Math.min(Number(selectedDay || $("#expiry-day").value || 1), max);
  $("#expiry-day").innerHTML = Array.from({ length: max }, (_, i) => i + 1).map((value) => `<option value="${value}"${value === day ? " selected" : ""}>${value}日</option>`).join("");
}

function openForm(paper) {
  form.reset();
  $("#form-title").textContent = paper ? "编辑相纸" : "添加相纸";
  $("#paper-id").value = paper?.id || "";
  $("#paper-model").value = paper?.model || "SQ";
  updatePatternOptions(paper?.pattern || "白边");
  $("#paper-name").value = paper?.customName || "";
  $("#paper-quantity").value = paper?.quantity ?? "";
  $("#paper-unit").value = paper?.unit || "盒";
  $("#paper-price").value = paper?.price ?? "";
  populateDate(paper?.expiry);
  $("#paper-note").value = paper?.note || "";
  dialog.showModal();
  $("#paper-name").focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#paper-id").value;
  const model = $("#paper-model").value;
  const pattern = $("#paper-pattern").value;
  const customName = $("#paper-name").value.trim();
  const year = $("#expiry-year").value.replace("年", "");
  const month = String($("#expiry-month").value).padStart(2, "0");
  const day = String($("#expiry-day").value).padStart(2, "0");
  const paper = {
    id: id || crypto.randomUUID(),
    name: customName || `${model} ${pattern}`,
    customName,
    model,
    pattern,
    quantity: Number($("#paper-quantity").value),
    unit: $("#paper-unit").value,
    price: Number($("#paper-price").value),
    expiry: `${year}-${month}-${day}`,
    note: $("#paper-note").value.trim()
  };
  papers = id ? papers.map((item) => item.id === id ? paper : item) : [...papers, paper];
  savePapers();
  dialog.close();
  render();
});

list.addEventListener("click", (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) openForm(papers.find((paper) => paper.id === editId));
  if (deleteId && confirm("确定删除这条相纸记录吗？")) {
    papers = papers.filter((paper) => paper.id !== deleteId);
    savePapers();
    render();
  }
});

$("#filters").addEventListener("click", (event) => {
  if (!event.target.dataset.filter) return;
  activeFilter = event.target.dataset.filter;
  document.querySelectorAll("#filters button").forEach((button) => button.classList.toggle("active", button === event.target));
  render();
});

$("#search-input").addEventListener("input", render);
$("#sort-select").addEventListener("change", (event) => { activeSort = event.target.value; render(); });
$("#model-filter").addEventListener("change", (event) => { activeModelFilter = event.target.value; render(); });
$("#pattern-filter").addEventListener("change", (event) => { activePatternFilter = event.target.value; render(); });
$("#paper-model").addEventListener("change", () => updatePatternOptions());
$("#expiry-year").addEventListener("change", () => updateDays());
$("#expiry-month").addEventListener("change", () => updateDays());
document.querySelector(".view-tabs").addEventListener("click", (event) => {
  if (!event.target.dataset.view) return;
  activeView = event.target.dataset.view;
  document.querySelectorAll(".view-tabs button").forEach((button) => button.classList.toggle("active", button === event.target));
  $("#inventory-view").hidden = activeView !== "inventory";
  $("#patterns-view").hidden = activeView !== "patterns";
  $("#open-form-fab").hidden = activeView !== "inventory";
  renderPatterns();
});
$("#model-tabs").addEventListener("click", (event) => {
  if (!event.target.dataset.model) return;
  activeModel = event.target.dataset.model;
  document.querySelectorAll("#model-tabs button").forEach((button) => button.classList.toggle("active", button === event.target));
  renderPatterns();
});
$("#pattern-grid").addEventListener("click", (event) => {
  if (event.target.dataset.patternImage) {
    pendingPatternImageKey = event.target.dataset.patternImage;
    $("#pattern-image-input").click();
  }
  if (event.target.dataset.patternReset && confirm("恢复这个款式的默认样式吗？")) {
    delete patternImages[event.target.dataset.patternReset];
    localStorage.setItem(PATTERN_IMAGES_KEY, JSON.stringify(patternImages));
    renderPatterns();
  }
});
$("#pattern-image-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file || !pendingPatternImageKey) return;
  try {
    patternImages[pendingPatternImageKey] = await compressPatternImage(file);
    localStorage.setItem(PATTERN_IMAGES_KEY, JSON.stringify(patternImages));
    renderPatterns();
  } catch { alert("图片读取失败，请换一张图片重试。"); }
  event.target.value = "";
});
window.receiveAndroidPatternImage = (dataUrl) => {
  if (!pendingPatternImageKey || !dataUrl) return;
  try {
    patternImages[pendingPatternImageKey] = dataUrl;
    localStorage.setItem(PATTERN_IMAGES_KEY, JSON.stringify(patternImages));
    renderPatterns();
  } catch { alert("图片保存失败，请换一张图片重试。"); }
};
$("#open-form").addEventListener("click", () => openForm());
$("#open-form-fab").addEventListener("click", () => openForm());
$("#close-form").addEventListener("click", () => dialog.close());
$("#open-settings").addEventListener("click", () => { $("#warning-months").value = settings.warningMonths; $("#settings-dialog").showModal(); });
$("#close-settings").addEventListener("click", () => $("#settings-dialog").close());
$("#quick-months").addEventListener("click", (event) => { if (event.target.dataset.months) $("#warning-months").value = event.target.dataset.months; });
$("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  settings.warningMonths = Math.max(1, Math.min(24, Number($("#warning-months").value)));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  $("#settings-dialog").close();
  render();
});
$("#close-install").addEventListener("click", () => $("#install-dialog").close());
$("#install-app").addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  } else $("#install-dialog").showModal();
});
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; $("#install-app").textContent = "安装 App"; });
window.addEventListener("appinstalled", () => { $("#install-app").hidden = true; });
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js");
if (location.protocol === "file:") $("#install-app").hidden = true;
render();
