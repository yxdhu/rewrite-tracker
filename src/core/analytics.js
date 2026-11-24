/* ===== core/analytics.js — pure analytics over stored records ===== */
const OUTCOME_SCORE = { completed: 1, partial: 0.5, not_completed: 0 };
const MIN_TREND_N = 4;

function finished(state) {
  return live(state.experiments).filter(e => e.status === "completed").sort((a, b) => (a.completedAt || a.startedAt) - (b.completedAt || b.startedAt));
}
function activeExps(state) { return live(state.experiments).filter(e => e.status === "active").sort((a, b) => a.startedAt - b.startedAt); }
function behaviourOf(state, id) { const b = state.behaviours[id]; return b && !b.deleted ? b : null; }
function behaviourLabel(state, id) {
  const b = behaviourOf(state, id);
  if (!b) return { name: "Deleted behaviour", emoji: "•", missing: true };
  return { name: b.name + (b.archived ? " (archived)" : ""), emoji: b.emoji, missing: false };
}
function expTime(e) { return e.startedAt; }
function gapOf(e) { return e.expectedDiscomfort != null && e.actualDiscomfort != null ? e.expectedDiscomfort - e.actualDiscomfort : null; }
function vals(list, f) { return list.map(f).filter(v => v != null && Number.isFinite(v)); }

function applyFilters(exps, f) {
  f = f || {};
  return exps.filter(e =>
    (!f.behaviourId || f.behaviourId === "all" || e.behaviourId === f.behaviourId) &&
    (!f.from || expTime(e) >= f.from) && (!f.to || expTime(e) <= f.to) &&
    (!f.outcome || f.outcome === "all" || (f.outcome === "unrecorded" ? e.outcome == null : e.outcome === f.outcome)) &&
    (!f.trigger || f.trigger === "all" || norm(e.trigger) === f.trigger));
}

function summarize(exps) {
  const gaps = vals(exps, gapOf);
  const scored = vals(exps, e => e.outcome ? OUTCOME_SCORE[e.outcome] : null);
  const counts = { completed: 0, partial: 0, not_completed: 0, unrecorded: 0 };
  exps.forEach(e => counts[e.outcome || "unrecorded"]++);
  return {
    n: exps.length,
    avgUrge: avg(vals(exps, e => e.urge)),
    avgExpected: avg(vals(exps, e => e.expectedDiscomfort)),
    avgActual: avg(vals(exps, e => e.actualDiscomfort)),
    avgGap: avg(gaps), // + means you overestimated
    mae: avg(gaps.map(Math.abs)),
    accuracy: gaps.length ? gaps.filter(g => Math.abs(g) <= 1).length / gaps.length : null,
    nGaps: gaps.length,
    overestimated: gaps.filter(g => g >= 2).length, underestimated: gaps.filter(g => g <= -2).length,
    followThrough: avg(scored), nScored: scored.length, counts,
    avgConfidence: avg(vals(exps, e => e.beliefConfidence))
  };
}

/* trend of the STARTING urge: the real sign that the automatic reaction weakens */
function urgeTrend(exps) {
  const list = exps.filter(e => e.urge != null);
  const n = list.length;
  if (n < MIN_TREND_N) return { status: "insufficient", n, first: null, last: null, delta: null };
  const k = Math.max(2, Math.floor(n / 3));
  const first = avg(list.slice(0, k).map(e => e.urge)), last = avg(list.slice(-k).map(e => e.urge));
  const delta = first - last;
  let status = "steady";
  if (delta >= 1) status = "improving"; else if (delta <= -1) status = "worsening"; else if (n >= 6) status = "stagnating";
  return { status, n, first, last, delta, k };
}

function behaviourProgress(state, exps) {
  const ids = new Set(exps.map(e => e.behaviourId || "_none"));
  live(state.behaviours).filter(b => !b.archived).forEach(b => ids.add(b.id));
  return [...ids].map(id => {
    const list = exps.filter(e => (e.behaviourId || "_none") === id);
    const lbl = behaviourLabel(state, id === "_none" ? null : id);
    return { id, ...lbl, n: list.length, trend: urgeTrend(list), summary: summarize(list), urgeSeries: vals(list, e => e.urge), lastAt: list.length ? expTime(list[list.length - 1]) : null };
  }).sort((a, b) => b.n - a.n);
}

function groupStats(exps, keyFn, labelFn) {
  const m = new Map();
  for (const e of exps) { const k = keyFn(e); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
  return [...m.entries()].map(([key, list]) => ({ key, label: labelFn ? labelFn(key, list) : key, ...summarize(list) })).sort((a, b) => b.n - a.n);
}
function triggerStats(exps) { return groupStats(exps, e => e.trigger ? norm(e.trigger) : null, (k, list) => list[list.length - 1].trigger); }
function emotionStats(exps) { return groupStats(exps, e => e.emotion ? norm(e.emotion) : null, (k, list) => list[list.length - 1].emotion); }
function alternativeStats(exps) {
  return groupStats(exps, e => e.alternative ? norm(e.alternative) : null, (k, list) => list[list.length - 1].alternative)
    .map(g => ({ ...g, drop: g.avgUrge != null && g.avgActual != null ? g.avgUrge - g.avgActual : null }));
}
function timeOfDayStats(exps) {
  return TIME_BUCKETS.map(b => { const list = exps.filter(e => timeBucket(expTime(e)) === b.key); return { key: b.key, label: b.label, range: b.range, ...summarize(list) }; });
}
function weekdayStats(exps) {
  return WEEKDAYS.map((d, i) => { const list = exps.filter(e => weekdayIdx(expTime(e)) === i); return { key: d, label: d, ...summarize(list) }; });
}

function periodSeries(exps, unit, count, now) {
  now = now || Date.now();
  const startFn = unit === "month" ? startOfMonth : startOfWeek;
  const out = [];
  let cur = startFn(now);
  for (let i = 0; i < count; i++) {
    const next = unit === "month" ? new Date(new Date(cur).getFullYear(), new Date(cur).getMonth() + 1, 1).getTime() : startOfWeek(cur + 8 * DAY);
    const list = exps.filter(e => expTime(e) >= cur && expTime(e) < next);
    const d = new Date(cur);
    const label = unit === "month" ? d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    out.unshift({ start: cur, label, ...summarize(list) });
    cur = unit === "month" ? new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime() : startOfWeek(cur - 3 * DAY);
  }
  return out;
}

function rolling(values, w) {
  return values.map((v, i) => { const s = values.slice(Math.max(0, i - w + 1), i + 1); return avg(s); });
}

function durationStats(exps) {
  const pairs = exps.filter(e => e.expectedDurationMin != null && e.actualDurationMin != null);
  return { n: pairs.length, expected: avg(pairs.map(e => e.expectedDurationMin)), actual: avg(pairs.map(e => e.actualDurationMin)) };
}

function moduleTotals(exps, module) {
  const m = MODULES[module]; if (!m) return [];
  const list = exps.filter(e => e.module === module);
  return m.endFields.concat(m.startFields).filter(f => f.type !== "bool").map(f => {
    const v = vals(list, e => e.moduleData[f.key]);
    return { key: f.key, label: f.label, n: v.length, total: sum(v), avg: avg(v) };
  }).filter(x => x.n > 0);
}

function smokingStats(state, now) {
  now = now || Date.now();
  const ids = new Set(Object.values(state.behaviours).filter(b => !b.deleted && b.module === "smoking").map(b => b.id));
  const exps = finished(state).filter(e => e.module === "smoking" || ids.has(e.behaviourId));
  const known = exps.filter(e => e.moduleData.cravingPassed != null);
  const passed = known.filter(e => e.moduleData.cravingPassed === true);
  const avoided = sum(vals(exps, e => e.moduleData.cigarettesAvoided));
  const s = state.settings;
  const pricePerCig = s.packPrice != null && s.cigsPerPack ? s.packPrice / s.cigsPerPack : null;
  const slips = live(state.smokingLog).sort((a, b) => a.ts - b.ts);
  const times = slips.map(x => x.ts); if (s.lastCigaretteAt) times.push(s.lastCigaretteAt);
  times.sort((a, b) => a - b);
  const lastCig = times.length ? times[times.length - 1] : null;
  let longest = null;
  for (let i = 1; i < times.length; i++) longest = Math.max(longest || 0, times[i] - times[i - 1]);
  if (lastCig) longest = Math.max(longest || 0, now - lastCig);
  const durations = vals(exps, e => e.actualDurationMin);
  return {
    cravings: exps.length, knownOutcome: known.length, passed: passed.length,
    passRate: known.length ? passed.length / known.length : null,
    avgCravingMin: avg(durations), avgCravingIntensity: avg(vals(exps, e => e.urge)),
    avoided, pricePerCig, moneySaved: pricePerCig != null ? avoided * pricePerCig : null,
    slips, slipCount: slips.length, cigarettesLogged: sum(slips.map(x => x.count)),
    lastCig, sinceLast: lastCig ? now - lastCig : null, longest, hasSmokingBehaviour: ids.size > 0
  };
}

function spendingStats(state) {
  const exps = finished(state).filter(e => e.module === "spending");
  const decided = exps.filter(e => e.moduleData.purchased != null && e.moduleData.amount != null);
  const saved = sum(decided.filter(e => e.moduleData.purchased === false).map(e => e.moduleData.amount));
  return { n: exps.length, decided: decided.length, notBought: decided.filter(e => e.moduleData.purchased === false).length, saved };
}

function allTriggers(state) {
  const m = new Map();
  live(state.experiments).forEach(e => { if (e.trigger) { const k = norm(e.trigger); if (!m.has(k)) m.set(k, e.trigger); } });
  return [...m.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
}
