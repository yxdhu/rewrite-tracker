/* ===== ui/dom.js — tiny DOM toolkit: elements, toasts, dialogs ===== */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") e.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "open") e[k] = !!v;
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  appendKids(e, kids);
  return e;
}
function appendKids(e, kids) {
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
}
const SVGNS = "http://www.w3.org/2000/svg";
function s(tag, attrs, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in (attrs || {})) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  practice: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8",
  library: "M4 4h6v16H4zM14 4h6v16h-6z",
  insights: "M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3zM9.5 20h5",
  analytics: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  journal: "M6 3h11a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-3 2V5a2 2 0 0 1 2-2zM8 8h8M8 12h6",
  goals: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  prefs: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14", x: "M6 6l12 12M18 6 6 18", check: "M5 12l5 5L20 7", star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4", trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13", search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2", arrow: "M5 12h14M13 6l6 6-6 6", spark: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z"
};
function icon(name, size) {
  return s("svg", { viewBox: "0 0 24 24", width: size || 18, height: size || 18, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "ic" }, s("path", { d: ICONS[name] || ICONS.more }));
}

/* ---------- toasts ---------- */
function toast(msg, kind) {
  let wrap = document.getElementById("toasts");
  if (!wrap) { wrap = h("div", { id: "toasts", role: "status", "aria-live": "polite" }); document.body.append(wrap); }
  const t = h("div", { class: "toast " + (kind || "") }, msg);
  wrap.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, kind === "error" ? 7000 : 4200);
}

/* ---------- modal dialogs ---------- */
function openModal(title, bodyNodes, actions, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const close = (v) => { overlay.remove(); document.removeEventListener("keydown", onKey, true); try { prevFocus && prevFocus.focus(); } catch (e) { } resolve(v); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(null); }
      if (e.key === "Tab") { const f = [...box.querySelectorAll("button,input,textarea,select,a[href]")].filter(x => !x.disabled); if (!f.length) return; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    };
    const btns = actions.map(a => h("button", { class: "btn " + (a.kind || "ghost"), type: "button", onclick: () => { const v = a.value === undefined ? true : (typeof a.value === "function" ? a.value() : a.value); if (v !== undefined) close(v); } }, a.label));
    const box = h("div", { class: "modal " + (opts.wide ? "wide" : ""), role: "dialog", "aria-modal": "true", "aria-labelledby": "mdl-t" },
      h("div", { class: "modal-h" }, h("h2", { id: "mdl-t" }, title), h("button", { class: "icon-btn", "aria-label": "Close", type: "button", onclick: () => close(null) }, icon("x"))),
      h("div", { class: "modal-b" }, bodyNodes), h("div", { class: "modal-f" }, btns));
    const overlay = h("div", { class: "overlay", onmousedown: (e) => { if (e.target === overlay) close(null); } }, box);
    document.body.append(overlay); document.addEventListener("keydown", onKey, true);
    setTimeout(() => { const f = box.querySelector(opts.focus || "input,textarea,.btn.primary,.btn.danger") || btns[btns.length - 1]; f && f.focus(); }, 30);
  });
}
/* destructive actions always come through here */
function confirmDialog({ title, body, confirm, danger, requireText }) {
  const inp = requireText ? h("input", { type: "text", class: "input", "aria-label": `Type ${requireText} to confirm`, placeholder: requireText, autocomplete: "off" }) : null;
  const err = h("p", { class: "field-err", role: "alert" });
  const nodes = [h("p", { class: "muted" }, body), inp ? h("label", { class: "lbl" }, `Type ${requireText} to confirm`) : null, inp, err];
  return openModal(title, nodes, [
    { label: "Cancel", value: false },
    { label: confirm || "Confirm", kind: danger ? "danger" : "primary", value: () => { if (inp && inp.value.trim() !== requireText) { err.textContent = `Please type ${requireText} exactly.`; return undefined; } return true; } }
  ]).then(v => v === true);
}
function liveRegion(text) { const r = document.getElementById("sr-live"); if (r) { r.textContent = ""; setTimeout(() => r.textContent = text, 30); } }
