/* ===== core/insights.js — local rule-based insights engine (no AI, runs on device) ===== */
const MIN_INSIGHT_N = 4;

function generateInsights(state, exps) {
  const out = [];
  const add = (kind, text, evidence, extra) => out.push(Object.assign({ kind, text, evidence }, extra || {}));
  const n = exps.length;
  if (n < MIN_INSIGHT_N) {
    add("info", `Pattern detection starts after ${MIN_INSIGHT_N} completed experiments. You have ${n} in this selection.`, null);
    return out;
  }

  // 1. systematic over/under-prediction
  const high = exps.filter(e => e.expectedDiscomfort != null && e.expectedDiscomfort >= 8 && e.actualDiscomfort != null);
  if (high.length >= 3) {
    const a = avg(high.map(e => e.actualDiscomfort)), p = avg(high.map(e => e.expectedDiscomfort));
    add("observation", `You predicted a discomfort of ${f1(p)} or more in ${high.length} experiments. The actual average was ${f1(a)}.`, `${high.length} experiments with prediction ≥ 8`);
    if (p - a >= 2) add("hypothesis", "Your strongest predictions may be systematically exaggerating the difficulty. When you next expect a 9, remind yourself what usually happens.", `based on ${high.length} experiments`);
  }
  const s = summarize(exps);
  if (s.nGaps >= MIN_INSIGHT_N && s.avgGap != null) {
    if (s.avgGap >= 1.5) add("observation", `On average you expect ${f1(s.avgGap)} points more discomfort than you actually feel (${s.nGaps} experiments).`, `mean prediction gap +${f1(s.avgGap)}`);
    else if (s.avgGap <= -1.5) add("observation", `Your experiments have been ${f1(-s.avgGap)} points harder than you predicted on average. The actions may be too big right now; smaller steps give cleaner evidence.`, `mean prediction gap ${f1(s.avgGap)}`);
    else if (s.accuracy != null && s.accuracy >= 0.6) add("observation", `Your predictions are now fairly accurate: ${pct(s.accuracy)} were within 1 point of what happened.`, `${s.nGaps} experiments`);
  }

  // 2. time of day concentration
  const tod = timeOfDayStats(exps).filter(b => b.n > 0);
  if (n >= 6 && tod.length) {
    const top = [...tod].sort((a, b) => b.n - a.n)[0];
    if (top.n / n >= 0.4 && top.n >= 3) {
      add("observation", `${pct(top.n / n)} of your experiments happen in the ${top.label.toLowerCase()} (${top.range}).`, `${top.n} of ${n}`);
      if (s.avgUrge != null && top.avgUrge != null && top.avgUrge - s.avgUrge >= 1)
        add("hypothesis", `Urges are stronger in the ${top.label.toLowerCase()} (avg ${f1(top.avgUrge)} vs ${f1(s.avgUrge)} overall). Planning an alternative activity before that time may help.`, `${top.n} experiments`);
    }
    const scored = tod.filter(b => b.nScored >= 3 && b.followThrough != null);
    if (scored.length >= 2) {
      const worst = [...scored].sort((a, b) => a.followThrough - b.followThrough)[0], best = [...scored].sort((a, b) => b.followThrough - a.followThrough)[0];
      if (best.followThrough - worst.followThrough >= 0.3)
        add("observation", `You follow through ${pct(best.followThrough)} of the time in the ${best.label.toLowerCase()} but only ${pct(worst.followThrough)} in the ${worst.label.toLowerCase()}.`, `${best.nScored} and ${worst.nScored} experiments`);
    }
  }

  // 3. triggers
  const trig = triggerStats(exps);
  if (trig.length && trig[0].n >= 3) {
    const t = trig[0];
    add("observation", `"${t.label}" is your most frequent trigger (${t.n} experiments, average urge ${f1(t.avgUrge)}).`, `${t.n} of ${n}`);
  }
  const strong = trig.filter(t => t.n >= 3 && t.avgUrge != null && s.avgUrge != null && t.avgUrge - s.avgUrge >= 1.5);
  if (strong.length) add("observation", `"${strong[0].label}" is linked to stronger urges (${f1(strong[0].avgUrge)} vs ${f1(s.avgUrge)} overall).`, `${strong[0].n} experiments`);

  // 4. alternatives that work
  const alts = alternativeStats(exps).filter(a => a.nScored >= 2);
  if (alts.length >= 2) {
    const ranked = [...alts].sort((a, b) => (b.followThrough - a.followThrough) || ((a.avgActual ?? 10) - (b.avgActual ?? 10)));
    const best = ranked[0], worst = ranked[ranked.length - 1];
    if (best.followThrough - worst.followThrough >= 0.25)
      add("observation", `"${best.label}" works best so far: done ${pct(best.followThrough)} of the time vs ${pct(worst.followThrough)} for "${worst.label}".`, `${best.nScored} vs ${worst.nScored} experiments`);
  }

  // 5. behaviour trends
  behaviourProgress(state, exps).forEach(b => {
    const t = b.trend;
    if (t.status === "improving") add("observation", `${b.emoji} ${b.name}: your starting urge dropped from ${f1(t.first)} to ${f1(t.last)} (first vs last ${t.k} experiments).`, `${t.n} experiments`, { behaviourId: b.id, tone: "good" });
    if (t.status === "worsening") add("observation", `${b.emoji} ${b.name}: your starting urge rose from ${f1(t.first)} to ${f1(t.last)}. Check stress, sleep, or whether the action is too hard.`, `${t.n} experiments`, { behaviourId: b.id, tone: "warn" });
    if (t.status === "stagnating") add("hypothesis", `${b.emoji} ${b.name} has plateaued (urge ${f1(t.first)} → ${f1(t.last)}). A different alternative action or a new situation may produce new evidence.`, `${t.n} experiments`, { behaviourId: b.id });
  });

  // 6. recurring setbacks
  const setbacks = exps.filter(e => e.outcome === "not_completed");
  if (setbacks.length >= 2) {
    const st = triggerStats(setbacks).filter(t => t.n >= 2);
    if (st.length) add("observation", `${st[0].n} of your ${setbacks.length} unsuccessful attempts followed "${st[0].label}". That situation might need a prepared plan.`, `${setbacks.length} setbacks`);
    const sb = timeOfDayStats(setbacks).filter(b => b.n >= 2).sort((a, b) => b.n - a.n)[0];
    if (sb && sb.n / setbacks.length >= 0.5) add("observation", `Most setbacks (${sb.n} of ${setbacks.length}) happen in the ${sb.label.toLowerCase()}.`, `${setbacks.length} setbacks`);
  }

  // 7. emotional intensity over time
  const emo = emotionStats(exps);
  if (emo.length && emo[0].n >= 3) add("observation", `The emotion you log most is "${emo[0].label}" (${emo[0].n} times, average urge ${f1(emo[0].avgUrge)}).`, `${emo[0].n} experiments`);
  const urges = vals(exps, e => e.urge);
  if (urges.length >= 8) {
    const half = Math.floor(urges.length / 2), a = avg(urges.slice(0, half)), b = avg(urges.slice(half));
    if (Math.abs(a - b) >= 1) add("observation", `Overall starting intensity went from ${f1(a)} (earlier half) to ${f1(b)} (recent half).`, `${urges.length} experiments`, { tone: b < a ? "good" : "warn" });
  }

  // 8. durations
  const d = durationStats(exps);
  if (d.n >= 3 && d.expected > 0 && d.actual != null && d.expected / Math.max(d.actual, 1) >= 1.5)
    add("observation", `You expect discomfort to last about ${Math.round(d.expected)} minutes; it actually lasted about ${Math.round(d.actual)} minutes on average.`, `${d.n} experiments`);

  // 9. belief confidence
  const conf = exps.filter(e => e.beliefConfidence != null);
  if (conf.length >= 4) {
    const k = Math.max(2, Math.floor(conf.length / 3)), a = avg(conf.slice(0, k).map(e => e.beliefConfidence)), b = avg(conf.slice(-k).map(e => e.beliefConfidence));
    if (b - a >= 15) add("observation", `Your confidence in the new belief grew from ${Math.round(a)}% to ${Math.round(b)}%.`, `${conf.length} ratings`, { tone: "good" });
  }
  if (out.length === 0) add("info", "No clear patterns yet in this selection. That's normal; keep logging and check back.", `${n} experiments`);
  return out;
}

/* evidence-based achievements, each dated by the record that earned it */
function achievements(state) {
  const fin = finished(state), out = [];
  const add = (key, title, text, at) => at && out.push({ key, title, text, at });
  if (fin[0]) add("first", "First experiment", "You tested an old prediction for the first time.", fin[0].completedAt);
  if (fin[9]) add("ten", "10 experiments", "Ten pieces of real evidence.", fin[9].completedAt);
  if (fin[49]) add("fifty", "50 experiments", "A serious body of evidence.", fin[49].completedAt);
  const busted = fin.find(e => gapOf(e) != null && gapOf(e) >= 3);
  if (busted) add("busted", "Prediction busted", `Expected ${busted.expectedDiscomfort}, actually ${busted.actualDiscomfort}.`, busted.completedAt);
  const byB = {};
  fin.forEach(e => { (byB[e.behaviourId] = byB[e.behaviourId] || []).push(e); });
  for (const id in byB) {
    const list = byB[id];
    const i = list.findIndex((e, j) => j > 0 && e.outcome === "completed" && list.slice(0, j).some(x => x.outcome === "not_completed"));
    if (i > 0) { add("comeback-" + id, "Back after a setback", `${behaviourLabel(state, id).name}: you followed through after an unsuccessful attempt.`, list[i].completedAt); }
    const t = urgeTrend(list);
    if (t.status === "improving") add("weaker-" + id, "Reaction weakening", `${behaviourLabel(state, id).name}: starting urge ${f1(t.first)} → ${f1(t.last)}.`, list[list.length - 1].completedAt);
    const alts = new Set(list.map(e => norm(e.alternative)).filter(Boolean));
    if (alts.size >= 3) add("explorer-" + id, "Experimenter", `${behaviourLabel(state, id).name}: you've tested ${alts.size} different alternatives.`, list[list.length - 1].completedAt);
  }
  const passed = fin.filter(e => e.moduleData.cravingPassed === true);
  if (passed[0]) add("craving1", "Craving ridden out", "A craving passed without a cigarette.", passed[0].completedAt);
  if (passed[4]) add("craving5", "5 cravings passed", "Five cravings passed without smoking.", passed[4].completedAt);
  const weekly = live(state.journal).filter(j => j.type === "weekly").sort((a, b) => a.createdAt - b.createdAt);
  if (weekly[0]) add("weekly", "First weekly reflection", "You reviewed a whole week of evidence.", weekly[0].createdAt);
  return out.sort((a, b) => b.at - a.at);
}

function windowInfo(e, settings, now) {
  if (!settings.windowEnabled) return null;
  const hours = e.windowHours || settings.windowHours;
  const left = e.startedAt + hours * HOUR - (now || Date.now());
  return { hours, left, open: left > 0 };
}

function recommendNext(state, now) {
  now = now || Date.now();
  const act = activeExps(state);
  for (const e of act) {
    const w = windowInfo(e, state.settings, now);
    if (w && w.open && w.left < HOUR) return { title: `Record your ${behaviourLabel(state, e.behaviourId).name} result`, body: `The experiment window closes in ${fmtDuration(w.left)}. Record what actually happened while it's fresh.`, action: { type: "finish", id: e.id } };
  }
  if (act.length) return { title: `${plural(act.length, "experiment")} in progress`, body: "Do the alternative action, then record what actually happened, including partial results.", action: { type: "practice" } };
  const fin = finished(state);
  const behaviours = live(state.behaviours).filter(b => !b.archived);
  if (!fin.length) {
    const b = behaviours[0];
    return { title: "Run your first experiment", body: "Pick one behaviour, write down what you predict will happen, do the alternative action, then compare. One experiment takes 10–20 minutes.", action: { type: "start", behaviourId: b ? b.id : null } };
  }
  const wk = startOfWeek(now), thisWeek = fin.filter(e => e.completedAt >= wk);
  const hasWeekly = live(state.journal).some(j => j.type === "weekly" && j.weekKey === weekKey(now));
  if (thisWeek.length >= 3 && !hasWeekly && weekdayIdx(now) >= 4) return { title: "Write this week's reflection", body: `You ran ${thisWeek.length} experiments this week. A 5-minute review turns them into lessons.`, action: { type: "weekly" } };
  const prog = behaviourProgress(state, fin).filter(b => !b.missing && behaviours.some(x => x.id === b.id));
  const stag = prog.find(b => b.trend.status === "stagnating" || b.trend.status === "worsening");
  if (stag) {
    const b = state.behaviours[stag.id];
    const tried = new Set(fin.filter(e => e.behaviourId === stag.id).map(e => norm(e.alternative)));
    const untried = (b.alternatives || []).find(a => !tried.has(norm(a)));
    return { title: `Change the experiment for ${stag.name}`, body: untried ? `Progress has flattened. Try a different alternative: "${untried}".` : "Progress has flattened. Try the same action in a different situation, or make it smaller.", action: { type: "start", behaviourId: stag.id, alternative: untried || null } };
  }
  const stale = prog.filter(b => b.n > 0 && b.lastAt && now - b.lastAt > 4 * DAY).sort((a, b) => a.lastAt - b.lastAt)[0];
  if (stale) return { title: `Pick ${stale.name} back up`, body: `Your last experiment here was ${fmtDuration(now - stale.lastAt)} ago. Evidence fades without repetition.`, action: { type: "start", behaviourId: stale.id } };
  const recent = fin.slice(-10), byUrge = groupStats(recent, e => e.behaviourId).filter(g => behaviours.some(b => b.id === g.key) && g.avgUrge != null).sort((a, b) => b.avgUrge - a.avgUrge)[0];
  if (byUrge) return { title: `Practise ${behaviourLabel(state, byUrge.key).name}`, body: `It currently has your strongest starting urge (avg ${f1(byUrge.avgUrge)}). That's where new evidence counts most.`, action: { type: "start", behaviourId: byUrge.key } };
  return { title: "Run another experiment", body: "Repetition is what turns single results into a new automatic reaction.", action: { type: "start", behaviourId: behaviours[0] ? behaviours[0].id : null } };
}

/* data shown next to each weekly reflection question */
function weeklyHints(state, weekStart) {
  const end = weekStart + 7 * DAY;
  const fin = finished(state), week = fin.filter(e => e.startedAt >= weekStart && e.startedAt < end);
  const over = week.filter(e => gapOf(e) != null && gapOf(e) >= 2);
  const before = fin.filter(e => e.startedAt < weekStart);
  let easier = null;
  groupStats(week, e => e.behaviourId).forEach(g => {
    const prev = summarize(before.filter(e => e.behaviourId === g.key));
    if (prev.avgActual != null && g.avgActual != null) { const d = prev.avgActual - g.avgActual; if (d > 0 && (!easier || d > easier.d)) easier = { d, name: behaviourLabel(state, g.key).name, now: g.avgActual, prev: prev.avgActual }; }
  });
  const trig = triggerStats(week)[0];
  return {
    n: week.length,
    overestimated: !week.length ? "No experiments this week." : over.length ? `${over.length} of ${week.length} experiments were at least 2 points easier than predicted (avg gap ${f1(avg(over.map(gapOf)))}).` : "No big overestimates this week.",
    easier: easier ? `${easier.name}: actual discomfort ${f1(easier.prev)} before this week → ${f1(easier.now)} this week.` : "Not enough history to compare yet.",
    trigger: trig ? `Most frequent trigger: "${trig.label}" (${trig.n}×).` : "No triggers logged this week.",
    next: recommendNext(state, end - 1).title
  };
}
