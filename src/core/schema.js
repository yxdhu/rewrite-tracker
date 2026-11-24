/* ===== core/schema.js — data schema v2, validation, migration, merge ===== */
const SCHEMA_VERSION = 2;
const KINDS = ["behaviours", "experiments", "journal", "goals", "smokingLog"];
const GOAL_METRICS = {
  rounds_week: { label: "Experiments this week", dir: ">=", unit: "", needsBehaviour: false, help: "Completed experiments since Monday." },
  followthrough_10: { label: "Follow-through rate (last 10)", dir: ">=", unit: "%", needsBehaviour: false, help: "Share of the last 10 finished experiments where you did the new action (partial counts half)." },
  urge_avg_7: { label: "Average starting urge (last 7)", dir: "<=", unit: "/10", needsBehaviour: false, help: "Lower means the old reaction is weakening." },
  confidence_avg_5: { label: "Confidence in new belief (last 5)", dir: ">=", unit: "%", needsBehaviour: false, help: "Average of your confidence ratings." },
  smokefree_days: { label: "Days since last cigarette", dir: ">=", unit: " days", needsBehaviour: false, help: "From your smoking log. Needs at least one logged cigarette or a last-cigarette date." }
};

function defaultSettings() {
  return { id: "main", windowEnabled: true, windowHours: 5, currency: "€", packPrice: null, cigsPerPack: 20, lastCigaretteAt: null, aiEnabled: true, updatedAt: 1 };
}
function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, settings: defaultSettings(), behaviours: {}, experiments: {}, journal: {}, goals: {}, smokingLog: {}, meta: { createdAt: Date.now() } };
}
function behaviourFromTemplate(t, now) {
  const m = MODULES[t.module] || MODULES.general;
  return { id: t.id, module: t.module, name: t.name, emoji: t.emoji || m.emoji, belief: m.belief, alternatives: [...m.alternatives], triggers: [], archived: false, createdAt: now, updatedAt: now };
}
function seededState(ancient) {
  // ancient=true gives the defaults tiny timestamps so any real copy (e.g. from another device) wins a merge
  const s = emptyState(); const now = Date.now();
  DEFAULT_BEHAVIOURS.forEach((t, i) => { const b = behaviourFromTemplate(t, now); b.updatedAt = ancient ? 1 + i : now + i; s.behaviours[t.id] = b; });
  return s;
}

/* ---------- record sanitizers: return a clean record or null ---------- */
function tombstone(id, updatedAt) { return { id, deleted: true, updatedAt }; }
function baseOk(r) { return isPlainObj(r) && validId(r.id); }
function upd(r) { const n = Number(r.updatedAt); if (Number.isFinite(n) && n >= 1 && n < 4102444800000) return Math.round(n); return ts(r.createdAt, 1) || 1; }

function cleanSettings(r) {
  const d = defaultSettings(); if (!isPlainObj(r)) return d;
  return {
    id: "main",
    windowEnabled: r.windowEnabled === false ? false : true,
    windowHours: num(r.windowHours, 0.5, 48, d.windowHours),
    currency: str(r.currency || d.currency, 5) || "€",
    packPrice: num(r.packPrice, 0, 1000, null),
    cigsPerPack: int(r.cigsPerPack, 1, 100, 20),
    lastCigaretteAt: ts(r.lastCigaretteAt, null),
    aiEnabled: r.aiEnabled === false ? false : true,
    updatedAt: upd(r)
  };
}
function cleanBehaviour(r) {
  if (!baseOk(r)) return null;
  if (r.deleted) return tombstone(r.id, upd(r));
  const module = oneOf(r.module, MODULE_KEYS, "general");
  return {
    id: r.id, module,
    name: str(r.name, 80).trim() || "Untitled behaviour",
    emoji: str(r.emoji, 8).trim() || MODULES[module].emoji,
    belief: str(r.belief, 600), alternatives: strArr(r.alternatives, 20, 200), triggers: strArr(r.triggers, 30, 60),
    archived: bool(r.archived), createdAt: ts(r.createdAt, upd(r)), updatedAt: upd(r)
  };
}
function cleanModuleData(md, module) {
  const out = {}; if (!isPlainObj(md)) return out;
  const m = MODULES[module] || MODULES.general;
  for (const f of [...m.startFields, ...m.endFields]) {
    if (!(f.key in md)) continue;
    if (f.type === "bool") { const b = triBool(md[f.key]); if (b !== null) out[f.key] = b; }
    else { const n = num(md[f.key], f.min ?? 0, f.max ?? 1e6, null); if (n !== null) out[f.key] = n; }
  }
  return out;
}
function cleanExperiment(r) {
  if (!baseOk(r)) return null;
  if (r.deleted) return tombstone(r.id, upd(r));
  const startedAt = ts(r.startedAt, null); if (!startedAt) return null;
  let status = oneOf(r.status, ["active", "completed", "abandoned"], "active");
  const module = oneOf(r.module, MODULE_KEYS, "general");
  const e = {
    id: r.id, behaviourId: validId(r.behaviourId) ? r.behaviourId : null, module, status,
    startedAt, completedAt: ts(r.completedAt, null), updatedAt: upd(r),
    situation: str(r.situation, 500), trigger: str(r.trigger, 80).trim(), thought: str(r.thought, 500), emotion: str(r.emotion, 40).trim(),
    urge: num(r.urge, 0, 10, null), expectedDiscomfort: num(r.expectedDiscomfort, 0, 10, null),
    expectedDurationMin: num(r.expectedDurationMin, 0, 10080, null), expectedConsequence: str(r.expectedConsequence, 500),
    alternative: str(r.alternative, 200).trim(),
    actualDiscomfort: num(r.actualDiscomfort, 0, 10, null), actualDurationMin: num(r.actualDurationMin, 0, 10080, null),
    actualConsequence: str(r.actualConsequence, 500),
    outcome: oneOf(r.outcome, ["completed", "partial", "not_completed"], null),
    surprise: str(r.surprise, 1000), learned: str(r.learned, 1000), notes: str(r.notes, 4000),
    beliefConfidence: num(r.beliefConfidence, 0, 100, null),
    moduleData: cleanModuleData(r.moduleData, module),
    tags: strArr(r.tags, 20, 40), highlight: bool(r.highlight),
    windowHours: num(r.windowHours, 0.5, 48, null), legacy: bool(r.legacy)
  };
  if (e.status === "completed" && !e.completedAt) e.completedAt = e.updatedAt;
  if (e.status === "active") e.completedAt = null;
  return e;
}
function cleanJournal(r) {
  if (!baseOk(r)) return null;
  if (r.deleted) return tombstone(r.id, upd(r));
  const createdAt = ts(r.createdAt, upd(r));
  const a = isPlainObj(r.answers) ? r.answers : {};
  return {
    id: r.id, type: oneOf(r.type, ["note", "weekly"], "note"), title: str(r.title, 160), body: str(r.body, 10000),
    tags: strArr(r.tags, 20, 40), highlight: bool(r.highlight), experimentId: validId(r.experimentId) ? r.experimentId : null,
    weekKey: typeof r.weekKey === "string" ? str(r.weekKey, 20) : null,
    answers: { overestimated: str(a.overestimated, 2000), easier: str(a.easier, 2000), trigger: str(a.trigger, 2000), next: str(a.next, 2000) },
    createdAt, updatedAt: upd(r)
  };
}
function cleanGoal(r) {
  if (!baseOk(r)) return null;
  if (r.deleted) return tombstone(r.id, upd(r));
  const metric = oneOf(r.metric, Object.keys(GOAL_METRICS), null); if (!metric) return null;
  const target = num(r.target, 0, 10000, null); if (target === null) return null;
  return { id: r.id, title: str(r.title, 120), why: str(r.why, 1000), behaviourId: validId(r.behaviourId) ? r.behaviourId : null, metric, target, archived: bool(r.archived), createdAt: ts(r.createdAt, upd(r)), updatedAt: upd(r) };
}
function cleanSmoke(r) {
  if (!baseOk(r)) return null;
  if (r.deleted) return tombstone(r.id, upd(r));
  const t = ts(r.ts, null); if (!t) return null;
  return { id: r.id, ts: t, count: int(r.count, 1, 60, 1), note: str(r.note, 500), experimentId: validId(r.experimentId) ? r.experimentId : null, createdAt: ts(r.createdAt, t), updatedAt: upd(r) };
}
const CLEANERS = { behaviours: cleanBehaviour, experiments: cleanExperiment, journal: cleanJournal, goals: cleanGoal, smokingLog: cleanSmoke };
function cleanRecord(kind, r) { return kind === "settings" ? cleanSettings(r) : CLEANERS[kind] ? CLEANERS[kind](r) : null; }

/* ---------- v1 -> v2 migration ---------- */
function looksV1(raw) { return isPlainObj(raw) && (raw.v === 1 || (Array.isArray(raw.sessions) && Array.isArray(raw.problems))); }
function migrateV1(raw) {
  const s = emptyState(); s.meta.migratedFromV1 = Date.now();
  const base = ts(raw.updatedAt, Date.now() - 1000);
  const problems = Array.isArray(raw.problems) ? raw.problems : [];
  problems.forEach((p, i) => {
    if (!isPlainObj(p) || !validId(p.id)) return;
    const module = V1_MODULE_MAP[p.id] || "general";
    const b = cleanBehaviour({ id: p.id, module, name: p.name, emoji: p.emoji, belief: p.old, alternatives: p.action ? [p.action] : [], createdAt: base, updatedAt: base });
    if (b) s.behaviours[b.id] = b;
  });
  const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  for (const x of sessions) {
    if (!isPlainObj(x) || !validId(x.id)) continue;
    const done = x.after !== null && x.after !== undefined;
    const b = s.behaviours[x.problem];
    const e = cleanExperiment({
      id: x.id, behaviourId: validId(x.problem) ? x.problem : null, module: b ? b.module : (V1_MODULE_MAP[x.problem] || "general"),
      status: done ? "completed" : "active", startedAt: x.startedAt, completedAt: x.doneAt,
      updatedAt: ts(x.doneAt, ts(x.startedAt, base)),
      trigger: x.trigger, urge: x.before, expectedDiscomfort: x.predicted, actualDiscomfort: done ? x.after : null,
      outcome: { yes: "completed", partly: "partial", no: "not_completed" }[x.held] || null,
      learned: x.note, alternative: b && b.alternatives[0] ? b.alternatives[0] : "", windowHours: 5, legacy: true
    });
    if (e) s.experiments[e.id] = e;
  }
  return s;
}

/* ---------- normalise anything into a valid v2 state ---------- */
function normalizeState(raw) {
  const issues = [];
  if (looksV1(raw)) return { state: migrateV1(raw), issues: ["Migrated from version 1 format."] };
  const s = emptyState();
  if (!isPlainObj(raw)) { issues.push("No usable data found."); return { state: s, issues }; }
  if (raw.schemaVersion && raw.schemaVersion > SCHEMA_VERSION) issues.push("Data is from a newer app version; unknown fields were ignored.");
  s.settings = cleanSettings(raw.settings);
  if (isPlainObj(raw.meta)) s.meta = { createdAt: ts(raw.meta.createdAt, Date.now()), migratedFromV1: ts(raw.meta.migratedFromV1, undefined) || undefined };
  for (const k of KINDS) {
    const src = raw[k]; if (src == null) continue;
    const list = Array.isArray(src) ? src : isPlainObj(src) ? Object.values(src) : null;
    if (!list) { issues.push(`"${k}" was not a list and was skipped.`); continue; }
    let bad = 0;
    for (const r of list) { const c = cleanRecord(k, r); if (c) { const prev = s[k][c.id]; if (!prev || c.updatedAt >= prev.updatedAt) s[k][c.id] = c; } else bad++; }
    if (bad) issues.push(`${bad} invalid ${k} record(s) were skipped.`);
  }
  return { state: s, issues };
}

/* ---------- merge: last-writer-wins per record, never whole-state ---------- */
function pickNewer(a, b) {
  if (!a) return b; if (!b) return a;
  if (b.updatedAt > a.updatedAt) return b;
  if (b.updatedAt === a.updatedAt && b.deleted && !a.deleted) return b;
  return a;
}
function mergeStates(a, b) {
  const out = emptyState();
  out.meta = Object.assign({}, b.meta, a.meta);
  out.meta.createdAt = Math.min(a.meta?.createdAt || Infinity, b.meta?.createdAt || Infinity, Date.now());
  out.settings = pickNewer(a.settings, b.settings);
  for (const k of KINDS) {
    const ids = new Set([...Object.keys(a[k] || {}), ...Object.keys(b[k] || {})]);
    for (const id of ids) out[k][id] = pickNewer((a[k] || {})[id], (b[k] || {})[id]);
  }
  return out;
}
function live(map) { return Object.values(map || {}).filter(r => !r.deleted); }

/* ---------- import / export ---------- */
function exportPayload(state) {
  const data = { schemaVersion: SCHEMA_VERSION, settings: state.settings, meta: state.meta };
  for (const k of KINDS) data[k] = live(state[k]);
  return { app: "rewrite-tracker", format: 2, exportedAt: new Date().toISOString(), data };
}
function parseImport(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return { ok: false, error: "This is not valid JSON." }; }
  if (!isPlainObj(raw)) return { ok: false, error: "The file must contain a JSON object." };
  let inner = raw;
  if (raw.app === "rewrite-tracker" && isPlainObj(raw.data)) inner = raw.data;
  const recognised = looksV1(inner) || inner.schemaVersion || KINDS.some(k => k in inner);
  if (!recognised) return { ok: false, error: "This file doesn't look like Rewrite Tracker data." };
  const { state, issues } = normalizeState(inner);
  const counts = {}; for (const k of KINDS) counts[k] = live(state[k]).length;
  if (!Object.values(counts).some(n => n > 0)) return { ok: false, error: "No valid records were found in this file.", issues };
  return { ok: true, state, issues, counts };
}
