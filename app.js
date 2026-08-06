const STORAGE_KEY = "photo-paper-keeper-v1";
const DAY = 86400000;

const $ = (selector) => document.querySelector(selector);
const list = $("#paper-list");
const dialog = $("#paper-dialog");
const form = $("#paper-form");
let activeFilter = "all";
let papers = loadPapers();

function loadPapers() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
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
  if (days <= 30) return { key: "expiring", label: days === 0 ? "今天过期" : `${days} 天后过期` };
  return { key: "fresh", label: "状态良好" };
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
      const filterMatch = activeFilter === "all" || status === activeFilter || (activeFilter === "low" && paper.quantity <= 10);
      const searchMatch = `${paper.name} ${paper.note}`.toLowerCase().includes(query);
      return filterMatch && searchMatch;
    })
    .sort((a, b) => a.expiry.localeCompare(b.expiry));

  const total = papers.reduce((sum, paper) => sum + Number(paper.quantity), 0);
  const value = papers.reduce((sum, paper) => sum + Number(paper.price), 0);
  const expiring = papers.filter((paper) => ["expiring", "expired"].includes(statusFor(paper).key)).length;
  $("#total-count").textContent = total;
  $("#total-value").textContent = formatMoney(value).replace(".00", "");
  $("#expiring-count").textContent = expiring;
  $("#item-count").textContent = `${visible.length} 盒`;

  if (!visible.length) {
    list.innerHTML = `<div class="empty"><strong>${papers.length ? "没有匹配的相纸" : "还没有记录相纸"}</strong><span>${papers.length ? "试试切换筛选条件" : "点击右下角的＋添加第一盒"}</span></div>`;
    return;
  }

  list.innerHTML = visible.map((paper) => {
    const status = statusFor(paper);
    return `<article class="paper-card ${status.key}">
      <div class="card-top">
        <div><h3>${safe(paper.name)}</h3><p class="note">${safe(paper.note || "暂无备注")}</p></div>
        <span class="status">${status.label}</span>
      </div>
      <div class="card-data">
        <div><span>剩余数量</span><strong>${paper.quantity} 张${paper.quantity <= 10 ? " · 库存低" : ""}</strong></div>
        <div><span>购买价格</span><strong>${formatMoney(paper.price)}</strong></div>
        <div><span>过期日期</span><strong>${formatDate(paper.expiry)}</strong></div>
      </div>
      <div class="card-actions"><button data-edit="${paper.id}">编辑</button><button class="delete" data-delete="${paper.id}">删除</button></div>
    </article>`;
  }).join("");
}

function openForm(paper) {
  form.reset();
  $("#form-title").textContent = paper ? "编辑相纸" : "添加相纸";
  $("#paper-id").value = paper?.id || "";
  $("#paper-name").value = paper?.name || "";
  $("#paper-quantity").value = paper?.quantity ?? "";
  $("#paper-price").value = paper?.price ?? "";
  $("#paper-expiry").value = paper?.expiry || "";
  $("#paper-note").value = paper?.note || "";
  dialog.showModal();
  $("#paper-name").focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#paper-id").value;
  const paper = {
    id: id || crypto.randomUUID(),
    name: $("#paper-name").value.trim(),
    quantity: Number($("#paper-quantity").value),
    price: Number($("#paper-price").value),
    expiry: $("#paper-expiry").value,
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
$("#open-form").addEventListener("click", () => openForm());
$("#open-form-fab").addEventListener("click", () => openForm());
$("#close-form").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js");
render();
