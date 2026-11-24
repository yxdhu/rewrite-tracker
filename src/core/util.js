/* ===== core/util.js — small pure helpers shared everywhere ===== */
const DAY = 86400000, HOUR = 3600000, MIN = 60000;

function uid() {
  // ids use only [a-z0-9] so they are valid db path segments
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function isPlainObj(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function num(x, lo, hi, dflt = null) {
  if (x === "" || x === null || x === undefined) return dflt;
  const n = Number(x);
  if (!Number.isFinite(n)) return dflt;
  return clamp(n, lo, hi);
}
function int(x, lo, hi, dflt = null) { const n = num(x, lo, hi, dflt); return n === null ? null : Math.round(n); }
function str(x, max = 2000) { return typeof x === "string" ? x.slice(0, max) : (x == null ? "" : String(x).slice(0, max)); }
function bool(x) { return x === true; }
function triBool(x) { return x === true ? true : x === false ? false : null; }
function ts(x, dflt = null) { const n = Number(x); return Number.isFinite(n) && n > 946684800000 && n < 4102444800000 ? Math.round(n) : dflt; }
function strArr(x, maxItems = 30, maxLen = 60) {
  if (!Array.isArray(x)) return [];
  const out = [];
  for (const v of x) { const s = str(v, maxLen).trim(); if (s && !out.includes(s)) out.push(s); if (out.length >= maxItems) break; }
  return out;
}
function validId(x) { return typeof x === "string" && /^[A-Za-z0-9_\-]{1,80}$/.test(x); }
function oneOf(x, list, dflt) { return list.includes(x) ? x : dflt; }

const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sum = a => a.reduce((x, y) => x + y, 0);
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const f1 = n => n == null || !Number.isFinite(n) ? "–" : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
const pct = n => n == null || !Number.isFinite(n) ? "–" : Math.round(n * 100) + "%";
const plural = (n, w, p) => n + " " + (n === 1 ? w : (p || w + "s"));
const norm = s => str(s, 200).toLowerCase().replace(/\s+/g, " ").trim();

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function startOfWeek(t) { const d = new Date(startOfDay(t)); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime(); } // Monday
function startOfMonth(t) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
function dayKey(t) { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function weekKey(t) { return "w" + dayKey(startOfWeek(t)); }
function fmtDate(t) { return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }); }
function fmtDateTime(t) { return new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function fmtTime(t) { return new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
function fmtDuration(ms) {
  if (ms == null || ms < 0) return "–";
  const m = Math.floor(ms / MIN), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return d + "d " + (h % 24) + "h";
  if (h >= 1) return h + "h " + String(m % 60).padStart(2, "0") + "m";
  return m + "m";
}
function fmtMoney(n, cur) { if (n == null || !Number.isFinite(n)) return "–"; return (Math.round(n * 100) / 100).toFixed(2) + " " + (cur || "€"); }
function toInputDate(t) { return dayKey(t); }
function fromInputDate(s, endOfDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(y, m - 1, d).getTime();
  return endOfDay ? t + DAY - 1 : t;
}
const TIME_BUCKETS = [
  { key: "night", label: "Night", range: "0–5h", from: 0, to: 5 },
  { key: "morning", label: "Morning", range: "5–12h", from: 5, to: 12 },
  { key: "afternoon", label: "Afternoon", range: "12–17h", from: 12, to: 17 },
  { key: "evening", label: "Evening", range: "17–21h", from: 17, to: 21 },
  { key: "late", label: "Late evening", range: "21–24h", from: 21, to: 24 }
];
function timeBucket(t) { const h = new Date(t).getHours(); return TIME_BUCKETS.find(b => h >= b.from && h < b.to).key; }
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function weekdayIdx(t) { return (new Date(t).getDay() + 6) % 7; }
function deepClone(x) { return JSON.parse(JSON.stringify(x)); }
