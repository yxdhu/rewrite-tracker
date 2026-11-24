/* ===== ui/app.js — shell, router, shared components, boot ===== */
const ROUTES = [
  { key: "home", label: "Command Center", short: "Home", icon: "home", primary: true },
  { key: "practice", label: "Daily Practice", short: "Practice", icon: "practice", primary: true },
  { key: "insights", label: "Insights & Coach", short: "Insights", icon: "insights", primary: true },
  { key: "journal", label: "Journal", short: "Journal", icon: "journal", primary: true },
  { key: "analytics", label: "Analytics", short: "Analytics", icon: "analytics" },
  { key: "library", label: "Behaviour Library", short: "Library", icon: "library" },
  { key: "goals", label: "Goals", short: "Goals", icon: "goals" },
  { key: "prefs", label: "Settings & Data", short: "Settings", icon: "prefs" }
];
const VIEWS = {};               // filled by view files
const UI = { route: "home", pendingRender: false, ai: null, downloads: null };

function routeFromHash() { const k = (location.hash || "").replace("#", ""); return ROUTES.some(r => r.key === k) ? k : "home"; }
function go(route, opts) {
  if (opts && opts.then) opts.then();
  if (UI.route === route) { render(); return; }
  if (location.hash !== "#" + route) { try { history.pushState(null, "", "#" + route); } catch (e) { location.hash = route; } }
  UI.route = route; render(); window.scrollTo(0, 0);
  setTimeout(() => { const t = document.querySelector("#view h1"); if (t) t.focus({ preventScroll: true }); }, 0);
}

/* ---------- shared components ---------- */
function pageHeader(title, sub, actions) {
  return h("header", { class: "page-h" }, h("div", {}, h("h1", { tabindex: "-1" }, title), sub ? h("p", { class: "sub" }, sub) : null), actions ? h("div", { class: "page-actions" }, actions) : null);
}
function card(title, kids, opts) {
  opts = opts || {};
  return h("section", { class: "card " + (opts.class || ""), "aria-label": typeof title === "string" ? title : null },
    title || opts.action ? h("div", { class: "card-h" }, title ? h("h2", {}, title) : h("span"), opts.action || null) : null,
    opts.desc ? h("p", { class: "card-desc" }, opts.desc) : null, kids);
}
function kpi(label, value, sub, opts) {
  opts = opts || {};
  return h("div", { class: "kpi " + (opts.tone || "") }, h("div", { class: "kpi-l" }, label), h("div", { class: "kpi-v" }, value), sub ? h("div", { class: "kpi-s" }, sub) : null);
}
const STATUS_META = {
  improving: { label: "Improving", cls: "good", sym: "↓" }, worsening: { label: "Getting harder", cls: "warn", sym: "↑" },
  stagnating: { label: "Plateau", cls: "neutral", sym: "→" }, steady: { label: "Early trend", cls: "neutral", sym: "→" },
  insufficient: { label: "Needs data", cls: "muted", sym: "·" }
};
function statusPill(status, n) {
  const m = STATUS_META[status] || STATUS_META.insufficient;
  return h("span", { class: "pill " + m.cls, title: status === "insufficient" ? `Trends need at least ${MIN_TREND_N} experiments` : "Based on your starting urge over time" }, h("span", { "aria-hidden": "true" }, m.sym + " "), m.label, n != null ? h("span", { class: "pill-n" }, " · " + n) : null);
}
function outcomePill(o) {
  if (!o) return h("span", { class: "pill muted" }, "Outcome not recorded");
  const m = { completed: ["good", "✓ Did it"], partial: ["warn", "◐ Partly"], not_completed: ["neutral", "○ Not this time"] }[o];
  return h("span", { class: "pill " + m[0] }, m[1]);
}
function emptyBox(title, text, btn) { return h("div", { class: "empty" }, h("h3", {}, title), h("p", { class: "muted" }, text), btn || null); }
function bName(id) { const b = behaviourLabel(S, id); return b.emoji + " " + b.name; }
function expTitle(e) { return bName(e.behaviourId) + (e.trigger ? " · " + e.trigger : ""); }
function gapText(e) {
  const g = gapOf(e); if (g == null) return null;
  if (g > 0) return `${g} point${g === 1 ? "" : "s"} easier than predicted`;
  if (g < 0) return `${-g} point${g === -1 ? "" : "s"} harder than predicted`;
  return "exactly as predicted";
}
function predVsActual(e) {
  const row = (name, v, color) => h("div", { class: "pva-r" }, h("span", { class: "pva-l" }, name), h("div", { class: "pva-t" }, h("div", { class: "pva-f", style: { width: (v == null ? 0 : v * 10) + "%", background: color } })), h("b", {}, v == null ? "–" : v));
  return h("div", { class: "pva", role: "group", "aria-label": "Prediction versus result" },
    row("Urge before", e.urge, C.urge), row("Predicted", e.expectedDiscomfort, C.expected), row("Actual", e.actualDiscomfort, C.actual));
}
function linkBtn(label, onclick, cls) { return h("button", { type: "button", class: "btn " + (cls || "ghost"), onclick }, label); }

/* ---------- shell ---------- */
function buildShell() {
  const app = document.getElementById("app");
  const navItems = (list, cls) => list.map(r => h("a", { href: "#" + r.key, class: cls, "data-route": r.key, onclick: e => { e.preventDefault(); closeMore(); go(r.key); } }, icon(r.icon), h("span", {}, cls === "tab" ? r.short : r.label)));
  const sidebar = h("nav", { class: "sidebar", "aria-label": "Main" },
    h("div", { class: "brand" }, h("div", { class: "logo", "aria-hidden": "true" }, "R"), h("div", {}, h("b", {}, "Rewrite"), h("span", {}, "Prediction → Evidence"))),
    h("div", { class: "nav-list" }, navItems(ROUTES, "nav-i")),
    h("div", { class: "side-foot" }, h("button", { type: "button", class: "sync-chip", id: "sync-side", onclick: () => go("prefs") })));
  const more = h("div", { class: "more-sheet", id: "more", hidden: true, role: "menu" }, navItems(ROUTES.filter(r => !r.primary), "nav-i"));
  const tabs = h("nav", { class: "tabbar", "aria-label": "Main" }, navItems(ROUTES.filter(r => r.primary), "tab"),
    h("button", { type: "button", class: "tab", id: "more-btn", "aria-expanded": "false", "aria-controls": "more", onclick: toggleMore }, icon("more"), h("span", {}, "More")));
  const top = h("div", { class: "topbar" }, h("div", { class: "brand sm" }, h("div", { class: "logo", "aria-hidden": "true" }, "R"), h("b", {}, "Rewrite")), h("button", { type: "button", class: "sync-chip", id: "sync-top", onclick: () => go("prefs") }));
  app.replaceChildren(h("a", { class: "skip", href: "#view" }, "Skip to content"), sidebar, h("div", { class: "main" }, top, h("div", { id: "banners" }), h("main", { id: "view", tabindex: "-1" })), more, tabs, h("div", { id: "sr-live", class: "sr", "aria-live": "polite" }));
  document.addEventListener("click", e => { const m = document.getElementById("more"); if (m && !m.hidden && !m.contains(e.target) && !e.target.closest("#more-btn")) closeMore(); });
}
function toggleMore() { const m = document.getElementById("more"), b = document.getElementById("more-btn"); m.hidden = !m.hidden; b.setAttribute("aria-expanded", String(!m.hidden)); }
function closeMore() { const m = document.getElementById("more"); if (m) { m.hidden = true; document.getElementById("more-btn").setAttribute("aria-expanded", "false"); } }

function paintSync() {
  const st = syncState;
  const cls = { synced: "good", pending: "warn", connecting: "muted", offline: "warn", error: "bad", local: "muted" }[st.mode] || "muted";
  const short = { synced: "Synced", pending: "Syncing…", connecting: "Connecting…", offline: "Offline · saved locally", error: "Sync issue", local: "On this device" }[st.mode] || "";
  ["sync-side", "sync-top"].forEach(id => { const el = document.getElementById(id); if (!el) return; el.className = "sync-chip " + cls; el.replaceChildren(h("i", { class: "dot", "aria-hidden": "true" }), h("span", {}, short + (st.pending && ["pending", "offline", "error"].includes(st.mode) ? ` (${st.pending})` : ""))); el.title = st.message; el.setAttribute("aria-label", "Sync status: " + st.message); });
  const el = document.getElementById("sync-detail"); if (el) el.textContent = st.message + (st.lastSyncAt ? ` · last sync ${fmtTime(st.lastSyncAt)}` : "");
}

function paintBanners() {
  const b = document.getElementById("banners"); if (!b) return;
  const items = [];
  loadNotices.forEach((n, i) => items.push(h("div", { class: "banner" }, h("span", {}, n), h("button", { class: "icon-btn", "aria-label": "Dismiss", onclick: () => { loadNotices.splice(i, 1); paintBanners(); } }, icon("x")))));
  if (!storageOk) items.push(h("div", { class: "banner warn" }, "This browser blocked local storage. Your changes can't be saved on this device. Export your data from Settings to keep a copy."));
  b.replaceChildren(...items);
}

function render() {
  const view = document.getElementById("view"); if (!view) return;
  UI.pendingRender = false;
  document.querySelectorAll("[data-route]").forEach(a => { const on = a.dataset.route === UI.route; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const more = document.getElementById("more-btn"); if (more) more.classList.toggle("on", !ROUTES.find(r => r.key === UI.route).primary);
  let content;
  try { content = (VIEWS[UI.route] || VIEWS.home)(); }
  catch (e) { console.error(e); content = h("div", { class: "card" }, h("h2", {}, "Something went wrong showing this page"), h("p", { class: "muted" }, String(e && e.message || e)), h("p", { class: "muted" }, "Your data is safe. Try another section, or export your data from Settings.")); }
  view.replaceChildren(content);
  document.title = (ROUTES.find(r => r.key === UI.route) || {}).label + " · Rewrite Tracker";
  paintSync(); paintBanners();
}
/* re-render without destroying text the user is typing */
function requestRender() {
  const a = document.activeElement, view = document.getElementById("view");
  if (view && a && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "range") { UI.pendingRender = true; return; }
  render();
}

async function boot() {
  storeLoad();
  UI.route = routeFromHash();
  buildShell(); render();
  window.addEventListener("popstate", () => { UI.route = routeFromHash(); render(); });
  window.addEventListener("hashchange", () => { const r = routeFromHash(); if (r !== UI.route) { UI.route = r; render(); } });
  document.getElementById("view").addEventListener("focusout", () => setTimeout(() => { if (UI.pendingRender) requestRender(); }, 150));
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (["analytics", "home", "library"].includes(UI.route)) requestRender(); }, 250); });
  onStoreChange(info => { if (info.source !== "remote" && info.source !== "tab") requestSync(); requestRender(); });
  onSyncChange(paintSync);
  setInterval(() => { document.querySelectorAll("[data-countdown]").forEach(el => { const left = Number(el.dataset.countdown) - Date.now(); el.textContent = left > 0 ? "window " + fmtDuration(left) + " left" : "window closed (you can still record it)"; el.classList.toggle("closed", left <= 0); }); document.querySelectorAll("[data-since]").forEach(el => { el.textContent = fmtDuration(Date.now() - Number(el.dataset.since)); }); }, 30000);
  if (typeof claude !== "undefined" && claude && claude.use) {
    claude.use("sample").then(x => { UI.ai = x; if (UI.route === "insights" || UI.route === "journal") requestRender(); }).catch(() => { });
    claude.use("downloads").then(x => { UI.downloads = x; if (UI.route === "prefs") requestRender(); }).catch(() => { });
  }
  startSync();
  registerPWA();
}
/* standalone web app: offline cache + ask the browser to keep local data (no-op inside claude.ai) */
function registerPWA() {
  try {
    if (!/^https?:$/.test(location.protocol) || window.self !== window.top) return;
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  } catch (e) { }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
