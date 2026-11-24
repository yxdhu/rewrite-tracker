/* ===== ui/charts.js — dependency-free SVG/HTML charts with hover tooltips and table views ===== */
const C = { urge: "#d95926", expected: "#3987e5", actual: "#199e70", good: "#0ca30c", warn: "#fab219", bad: "#d03b3b", neutral: "#6f6e69", grid: "#2b2b29", axis: "#8f8e87", violet: "#9085e9" };
const SERIES = { urge: { name: "Starting urge", color: C.urge }, expected: { name: "Predicted discomfort", color: C.expected }, actual: { name: "Actual discomfort", color: C.actual } };

function chartWidth(half) {
  // matches the layout: sidebar 236px + page padding, card padding 2x18px, two-column grid above 820px
  const w = window.innerWidth;
  const content = Math.min(w >= 960 ? w - 236 - 64 : w - 28, 1036);
  const inner = half && w > 820 ? (content - 18) / 2 - 38 : content - 38;
  return Math.max(260, Math.floor(inner));
}

let tipEl = null;
function tip(show, html, x, y) {
  if (!tipEl) { tipEl = h("div", { class: "tip", role: "tooltip" }); document.body.append(tipEl); }
  if (!show) { tipEl.style.opacity = "0"; return; }
  tipEl.replaceChildren(...html); tipEl.style.opacity = "1";
  const r = tipEl.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
  tipEl.style.left = Math.max(8, left) + "px"; tipEl.style.top = Math.max(8, top) + "px";
}
function tipRows(title, rows) {
  return [h("div", { class: "tip-t" }, title), ...rows.map(r => h("div", { class: "tip-r" }, r.color ? h("i", { class: "sw", style: { background: r.color } }) : null, h("span", {}, r.name), h("b", {}, r.value)))];
}
function bindTip(el, fn) {
  const show = e => { const p = e.touches ? e.touches[0] : e; tip(true, fn(), p.clientX, p.clientY); };
  el.addEventListener("pointermove", show); el.addEventListener("pointerdown", show);
  el.addEventListener("pointerleave", () => tip(false));
}

function legend(items) {
  return h("div", { class: "legend", role: "list" }, items.map(i => h("span", { role: "listitem" }, h("i", { class: "sw" + (i.dash ? " dash" : ""), style: { background: i.dash ? "none" : i.color, borderColor: i.color } }), i.name)));
}
function dataTable(caption, headers, rows) {
  return h("details", { class: "tbl" }, h("summary", {}, "Show data table"),
    h("div", { class: "tbl-wrap" }, h("table", {}, h("caption", { class: "sr" }, caption), h("thead", {}, h("tr", {}, headers.map(x => h("th", { scope: "col" }, x)))),
      h("tbody", {}, rows.map(r => h("tr", {}, r.map((c, i) => i === 0 ? h("th", { scope: "row" }, c) : h("td", {}, c))))))));
}
function emptyChart(msg) { return h("div", { class: "chart-empty" }, msg || "Not enough data for this chart yet."); }

/* line chart over categorical x positions; y fixed 0..yMax */
function lineChart({ labels, series, yMax = 10, height = 220, aria, yFmt = f1, minPoints = 2, half }) {
  const n = labels.length;
  if (n < minPoints || !series.some(s => s.values.some(v => v != null))) return emptyChart();
  const W = chartWidth(half), H = height, L = 34, R = 12, T = 12, B = 26;
  const px = i => n === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (n - 1);
  const py = v => T + (H - T - B) * (1 - v / yMax);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart", role: "img", "aria-label": aria });
  const ticks = yMax === 100 ? [0, 50, 100] : [0, yMax / 2, yMax];
  ticks.forEach(t => { svg.append(s("line", { x1: L, x2: W - R, y1: py(t), y2: py(t), stroke: C.grid }), s("text", { x: L - 8, y: py(t) + 4, "text-anchor": "end", class: "ax" }, t)); });
  const every = Math.max(1, Math.ceil(n / Math.floor((W - L - R) / 64)));
  labels.forEach((lb, i) => { if ((i % every === 0 && n - 1 - i >= every * 0.7) || i === n - 1) svg.append(s("text", { x: px(i), y: H - 6, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle", class: "ax" }, lb)); });
  for (const se of series) {
    let d = "", pen = false;
    se.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + px(i).toFixed(1) + " " + py(v).toFixed(1); pen = true; });
    svg.append(s("path", { d, fill: "none", stroke: se.color, "stroke-width": 2, "stroke-dasharray": se.dash ? "5 4" : null, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    if (n <= 40) se.values.forEach((v, i) => { if (v != null) svg.append(s("circle", { cx: px(i), cy: py(v), r: 3.5, fill: se.color, stroke: "#1a1a19", "stroke-width": 2 })); });
  }
  const cross = s("line", { y1: T, y2: H - B, stroke: C.axis, "stroke-width": 1, opacity: 0 }); svg.append(cross);
  const colW = n === 1 ? W : (W - L - R) / (n - 1);
  labels.forEach((lb, i) => {
    const hit = s("rect", { x: px(i) - colW / 2, y: 0, width: colW, height: H, fill: "transparent" });
    bindTip(hit, () => { cross.setAttribute("x1", px(i)); cross.setAttribute("x2", px(i)); cross.setAttribute("opacity", 1); return tipRows(lb, series.map(se => ({ name: se.name, color: se.color, value: se.values[i] == null ? "–" : yFmt(se.values[i]) }))); });
    hit.addEventListener("pointerleave", () => cross.setAttribute("opacity", 0));
    svg.append(hit);
  });
  return svg;
}

/* grouped vertical bars */
function barChart({ labels, series, yMax, height = 200, aria, yFmt = f1, countLabel, half }) {
  const n = labels.length; if (!n || !series.some(s => s.values.some(v => v))) return emptyChart();
  const max = yMax || Math.max(1, ...series.flatMap(s => s.values.map(v => v || 0)));
  const W = chartWidth(half), H = height, L = 34, R = 8, T = 10, B = 26;
  const gw = (W - L - R) / n, bw = Math.max(3, Math.min(22, (gw - 6) / series.length - 2));
  const py = v => T + (H - T - B) * (1 - v / max);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart", role: "img", "aria-label": aria });
  [0, max / 2, max].forEach(t => svg.append(s("line", { x1: L, x2: W - R, y1: py(t), y2: py(t), stroke: C.grid }), s("text", { x: L - 8, y: py(t) + 4, "text-anchor": "end", class: "ax" }, yFmt(t))));
  const every = Math.max(1, Math.ceil(n / Math.floor((W - L - R) / 56)));
  labels.forEach((lb, i) => {
    const gx = L + gw * i + (gw - (bw + 2) * series.length) / 2;
    series.forEach((se, j) => {
      const v = se.values[i]; if (!v) return;
      const x = gx + j * (bw + 2), y = py(v), hgt = Math.max(1, H - B - y);
      const r = Math.min(4, bw / 2, hgt);
      svg.append(s("path", { d: `M${x} ${H - B}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + bw - r}Q${x + bw} ${y} ${x + bw} ${y + r}V${H - B}Z`, fill: se.color }));
    });
    if (i % every === 0) svg.append(s("text", { x: L + gw * i + gw / 2, y: H - 6, "text-anchor": "middle", class: "ax" }, lb));
    const hit = s("rect", { x: L + gw * i, y: 0, width: gw, height: H, fill: "transparent" });
    bindTip(hit, () => tipRows(lb, series.map(se => ({ name: se.name, color: se.color, value: se.values[i] == null ? "–" : yFmt(se.values[i]) })).concat(countLabel ? [{ name: countLabel.name, value: countLabel.values[i] }] : [])));
    svg.append(hit);
  });
  return svg;
}

/* horizontal bars (HTML, labels never collide) */
function hbars(rows, { max, fmt = v => String(v), color = C.expected, aria } = {}) {
  if (!rows.length) return emptyChart();
  const m = max || Math.max(1, ...rows.map(r => r.value || 0));
  return h("div", { class: "hbars", role: "list", "aria-label": aria }, rows.map(r => {
    const row = h("div", { class: "hbar", role: "listitem" },
      h("div", { class: "hbar-l", title: r.label }, r.label),
      h("div", { class: "hbar-t" }, h("div", { class: "hbar-f", style: { width: Math.max(2, (r.value || 0) / m * 100) + "%", background: r.color || color } })),
      h("div", { class: "hbar-v" }, fmt(r.value, r)));
    if (r.tip) bindTip(row, () => tipRows(r.label, r.tip));
    return row;
  }));
}

/* predicted vs actual scatter with the "perfect prediction" diagonal */
function scatter({ points, aria }) {
  if (points.length < 2) return emptyChart();
  const W = Math.min(chartWidth(true), 520), H = Math.min(W, 380), L = 36, R = 12, T = 12, B = 34;
  const px = v => L + (W - L - R) * v / 10, py = v => T + (H - T - B) * (1 - v / 10);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart scatter", role: "img", "aria-label": aria });
  [0, 5, 10].forEach(t => svg.append(s("line", { x1: L, x2: W - R, y1: py(t), y2: py(t), stroke: C.grid }), s("line", { x1: px(t), x2: px(t), y1: T, y2: H - B, stroke: C.grid }), s("text", { x: L - 8, y: py(t) + 4, "text-anchor": "end", class: "ax" }, t), s("text", { x: px(t), y: H - B + 16, "text-anchor": "middle", class: "ax" }, t)));
  svg.append(s("line", { x1: px(0), y1: py(0), x2: px(10), y2: py(10), stroke: C.axis, "stroke-dasharray": "4 4" }));
  svg.append(s("text", { x: px(10) - 4, y: py(10) + 14, "text-anchor": "end", class: "ax" }, "perfect prediction"));
  svg.append(s("text", { x: (L + W - R) / 2, y: H - 4, "text-anchor": "middle", class: "ax" }, "Predicted discomfort →"));
  svg.append(s("text", { x: 10, y: (T + H - B) / 2, transform: `rotate(-90 10 ${(T + H - B) / 2})`, "text-anchor": "middle", class: "ax" }, "Actual →"));
  const groups = new Map();
  points.forEach(p => { const k = p.x + "," + p.y; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  for (const [k, list] of groups) {
    const [x, y] = k.split(",").map(Number);
    const c = s("circle", { cx: px(x), cy: py(y), r: Math.min(14, 4.5 + Math.sqrt(list.length) * 2), fill: y < x ? C.actual : y > x ? C.urge : C.expected, "fill-opacity": 0.85, stroke: "#1a1a19", "stroke-width": 2 });
    bindTip(c, () => tipRows(`Predicted ${x} → actual ${y}`, [{ name: "Experiments", value: list.length }, ...list.slice(-3).map(p => ({ name: p.label, value: "" }))]));
    svg.append(c);
  }
  return svg;
}

/* 100% stacked outcome bars (HTML) */
function stackBars(rows, parts) {
  if (!rows.length) return emptyChart();
  return h("div", { class: "stks", role: "list" }, rows.map(r => {
    const total = parts.reduce((a, p) => a + (r.values[p.key] || 0), 0);
    const bar = h("div", { class: "stack-t" }, total ? parts.filter(p => r.values[p.key]).map(p => h("div", { class: "stack-f", style: { width: (r.values[p.key] / total * 100) + "%", background: p.color } })) : h("div", { class: "stack-empty" }, "no data"));
    const row = h("div", { class: "stk", role: "listitem" }, h("div", { class: "hbar-l" }, r.label), bar, h("div", { class: "hbar-v" }, total));
    bindTip(row, () => tipRows(r.label, parts.map(p => ({ name: p.name, color: p.color, value: (r.values[p.key] || 0) + (total ? " (" + pct((r.values[p.key] || 0) / total) + ")" : "") }))));
    return row;
  }));
}

function sparkline(values, color, w = 96, hgt = 28, max = 10) {
  if (values.length < 2) return h("span", { class: "spark-empty muted" }, values.length ? "1 point" : "—");
  const px = i => 2 + (w - 4) * i / (values.length - 1), py = v => 2 + (hgt - 4) * (1 - v / max);
  return s("svg", { viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, class: "spark", "aria-hidden": "true" },
    s("path", { d: values.map((v, i) => (i ? "L" : "M") + px(i).toFixed(1) + " " + py(v).toFixed(1)).join(""), fill: "none", stroke: color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    s("circle", { cx: px(values.length - 1), cy: py(values[values.length - 1]), r: 2.5, fill: color }));
}
