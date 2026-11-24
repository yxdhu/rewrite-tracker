/* ===== ui/view-analytics.js — filterable charts over stored records ===== */
const analyticsUI = Object.assign({ behaviourId: "all", range: "90", from: "", to: "", outcome: "all", trigger: "all", period: "week" }, (() => { try { return getUi("analytics", {}); } catch (e) { return {}; } })());

function analyticsRange() {
  const now = Date.now();
  if (analyticsUI.range === "custom") return { from: fromInputDate(analyticsUI.from), to: fromInputDate(analyticsUI.to, true) };
  if (analyticsUI.range === "all") return { from: null, to: null };
  return { from: startOfDay(now - (Number(analyticsUI.range) - 1) * DAY), to: null };
}
function setA(k, v) { analyticsUI[k] = v; setUi("analytics", analyticsUI); render(); }

VIEWS.analytics = function () {
  const all = finished(S);
  const r = analyticsRange();
  const exps = applyFilters(all, { behaviourId: analyticsUI.behaviourId, from: r.from, to: r.to, outcome: analyticsUI.outcome, trigger: analyticsUI.trigger });
  const bs = live(S.behaviours);
  const filters = h("div", { class: "filters", role: "group", "aria-label": "Filters" },
    h("label", {}, h("span", { class: "lbl" }, "Behaviour"), selectBox([{ value: "all", label: "All behaviours" }].concat(bs.map(b => ({ value: b.id, label: b.emoji + " " + b.name + (b.archived ? " (archived)" : "") }))), analyticsUI.behaviourId, v => setA("behaviourId", v))),
    h("label", {}, h("span", { class: "lbl" }, "Period"), selectBox([{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "365", label: "Last 12 months" }, { value: "all", label: "All time" }, { value: "custom", label: "Custom range" }], analyticsUI.range, v => setA("range", v))),
    analyticsUI.range === "custom" ? [h("label", {}, h("span", { class: "lbl" }, "From"), h("input", { type: "date", class: "input", value: analyticsUI.from, onchange: e => setA("from", e.target.value) })), h("label", {}, h("span", { class: "lbl" }, "To"), h("input", { type: "date", class: "input", value: analyticsUI.to, onchange: e => setA("to", e.target.value) }))] : null,
    h("label", {}, h("span", { class: "lbl" }, "Outcome"), selectBox([{ value: "all", label: "All outcomes" }, ...OUTCOMES.map(o => ({ value: o.key, label: o.short })), { value: "unrecorded", label: "Not recorded" }], analyticsUI.outcome, v => setA("outcome", v))),
    h("label", {}, h("span", { class: "lbl" }, "Trigger"), selectBox([{ value: "all", label: "All triggers" }].concat(allTriggers(S).map(t => ({ value: t.key, label: t.label }))), analyticsUI.trigger, v => setA("trigger", v))));
  const root = h("div", { class: "stack-lg" }, pageHeader("Analytics", `${plural(exps.length, "completed experiment")} in this selection (of ${all.length}). Every chart uses your stored records.`), filters);
  if (analyticsUI.range === "custom" && r.from && r.to && r.from > r.to) root.append(h("div", { class: "banner warn", role: "alert" }, "The start date is after the end date."));
  if (!exps.length) { root.append(emptyBox("No data for these filters", all.length ? "Try a wider period or clear a filter." : "Complete an experiment and your charts appear here.", all.length ? linkBtn("Reset filters", () => { Object.assign(analyticsUI, { behaviourId: "all", range: "all", outcome: "all", trigger: "all" }); setUi("analytics", analyticsUI); render(); }) : null)); return root; }

  const s = summarize(exps);
  root.append(h("div", { class: "kpis" },
    kpi("Experiments", String(s.n)), kpi("Avg urge before", f1(s.avgUrge)), kpi("Predicted → actual", `${f1(s.avgExpected)} → ${f1(s.avgActual)}`, s.avgGap != null ? (s.avgGap >= 0 ? `overestimated by ${f1(s.avgGap)}` : `underestimated by ${f1(-s.avgGap)}`) : ""),
    kpi("Prediction accuracy", pct(s.accuracy), s.mae != null ? `mean error ${f1(s.mae)} points` : ""), kpi("Follow-through", pct(s.followThrough), `${s.counts.completed} done · ${s.counts.partial} partly · ${s.counts.not_completed} not`)));

  // 1. before vs after over time (daily averages when long)
  let labels, U, E, A;
  if (exps.length <= 40) { labels = exps.map(e => fmtDate(e.startedAt)); U = exps.map(e => e.urge); E = exps.map(e => e.expectedDiscomfort); A = exps.map(e => e.actualDiscomfort); }
  else { const days = groupStats(exps, e => dayKey(e.startedAt)).sort((a, b) => a.key.localeCompare(b.key)); labels = days.map(d => fmtDate(new Date(d.key + "T12:00").getTime())); U = days.map(d => d.avgUrge); E = days.map(d => d.avgExpected); A = days.map(d => d.avgActual); }
  root.append(card("Before vs after over time", [legend([SERIES.urge, { ...SERIES.expected, dash: true }, SERIES.actual]),
    lineChart({ labels, series: [{ ...SERIES.urge, values: U }, { ...SERIES.expected, dash: true, values: E }, { ...SERIES.actual, values: A }], aria: "Urge, predicted and actual discomfort over time" }),
    dataTable("Ratings over time", ["Date", "Urge", "Predicted", "Actual"], labels.map((l, i) => [l, f1(U[i]), f1(E[i]), f1(A[i])]))], { desc: exps.length > 40 ? "Daily averages." : "One point per experiment, 0–10." }));

  const g1 = h("div", { class: "grid-2" });
  const pts = exps.filter(e => e.expectedDiscomfort != null && e.actualDiscomfort != null).map(e => ({ x: e.expectedDiscomfort, y: e.actualDiscomfort, label: fmtDate(e.startedAt) + " · " + behaviourLabel(S, e.behaviourId).name }));
  g1.append(card("Prediction vs reality", [legend([{ name: "Easier than predicted", color: C.actual }, { name: "As predicted", color: C.expected }, { name: "Harder than predicted", color: C.urge }]), scatter({ points: pts, aria: "Predicted versus actual discomfort" }),
    h("p", { class: "muted sm" }, s.overestimated || s.underestimated ? `${s.overestimated} experiments were 2+ points easier than predicted, ${s.underestimated} were 2+ points harder.` : "No large prediction errors in this selection.")], { desc: "Points below the diagonal were easier than you expected. Bigger dots = several experiments." }));
  const per = periodSeries(applyFilters(all, { behaviourId: analyticsUI.behaviourId, outcome: analyticsUI.outcome, trigger: analyticsUI.trigger }), analyticsUI.period, analyticsUI.period === "week" ? 12 : 12);
  g1.append(card(analyticsUI.period === "week" ? "Weekly comparison" : "Monthly comparison", [
    segmentedInline([{ key: "week", label: "Weeks" }, { key: "month", label: "Months" }], analyticsUI.period, v => setA("period", v)),
    legend([SERIES.expected, SERIES.actual]),
    barChart({ labels: per.map(p => p.label), series: [{ ...SERIES.expected, values: per.map(p => p.avgExpected) }, { ...SERIES.actual, values: per.map(p => p.avgActual) }], yMax: 10, aria: "Average predicted vs actual per period", half: true, countLabel: { name: "Experiments", values: per.map(p => p.n) } }),
    dataTable("Per period", ["Period", "Experiments", "Avg urge", "Predicted", "Actual", "Follow-through"], per.map(p => [p.label, p.n, f1(p.avgUrge), f1(p.avgExpected), f1(p.avgActual), pct(p.followThrough)]))], { desc: "Ignores the period filter so you always see the last 12." }));
  root.append(g1);

  // behaviours
  const prog = behaviourProgress(S, exps).filter(b => b.n > 0);
  const g2 = h("div", { class: "grid-2" });
  g2.append(card("Behaviour-specific progress", h("div", { class: "tbl-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Behaviour", "n", "Urge trend", "Pred. gap", "Follow-through"].map(x => h("th", { scope: "col" }, x)))),
    h("tbody", {}, prog.map(b => h("tr", {}, h("th", { scope: "row" }, b.emoji + " " + b.name), h("td", {}, b.n), h("td", {}, statusPill(b.trend.status), b.trend.first != null ? h("div", { class: "muted xs" }, `${f1(b.trend.first)} → ${f1(b.trend.last)}`) : null), h("td", {}, b.summary.avgGap == null ? "–" : (b.summary.avgGap > 0 ? "+" : "") + f1(b.summary.avgGap)), h("td", {}, pct(b.summary.followThrough))))))),
    { desc: "Prediction gap: + means you expected it to be worse than it was." }));
  const parts = [{ key: "completed", name: "Did it", color: C.good }, { key: "partial", name: "Partly", color: C.warn }, { key: "not_completed", name: "Not this time", color: C.neutral }, { key: "unrecorded", name: "Not recorded", color: "#3a3a37" }];
  g2.append(card("Success and partial-success rates", [legend(parts), stackBars(prog.map(b => ({ label: b.emoji + " " + b.name, values: b.summary.counts })), parts)]));
  root.append(g2);

  const g3 = h("div", { class: "grid-2" });
  const trig = triggerStats(exps).slice(0, 10);
  g3.append(card("Trigger frequency", [hbars(trig.map(t => ({ label: t.label, value: t.n, tip: [{ name: "Experiments", value: t.n }, { name: "Avg urge", value: f1(t.avgUrge) }, { name: "Follow-through", value: pct(t.followThrough) }] })), { fmt: (v, r) => v + "×", color: C.violet, aria: "Trigger frequency" }),
    trig.length ? dataTable("Triggers", ["Trigger", "n", "Avg urge", "Follow-through"], trig.map(t => [t.label, t.n, f1(t.avgUrge), pct(t.followThrough)])) : null]));
  const emo = emotionStats(exps).slice(0, 8);
  g3.append(card("Emotions", [hbars(emo.map(t => ({ label: t.label, value: t.n, tip: [{ name: "Avg urge", value: f1(t.avgUrge) }, { name: "Avg actual", value: f1(t.avgActual) }] })), { fmt: v => v + "×", color: C.expected, aria: "Emotions logged" })]));
  root.append(g3);

  const g4 = h("div", { class: "grid-2" });
  const tod = timeOfDayStats(exps);
  g4.append(card("Time of day", [
    h("div", { class: "lbl" }, "Experiments"), barChart({ labels: tod.map(t => t.label), series: [{ name: "Experiments", color: C.violet, values: tod.map(t => t.n) }], height: 150, yFmt: v => String(Math.round(v)), aria: "Experiments by time of day", half: true }),
    h("div", { class: "lbl" }, "Average starting urge"), barChart({ labels: tod.map(t => t.label), series: [{ name: "Avg urge", color: C.urge, values: tod.map(t => t.avgUrge) }], yMax: 10, height: 150, aria: "Average urge by time of day", half: true }),
    dataTable("Time of day", ["Period", "n", "Avg urge", "Follow-through"], tod.map(t => [t.label + " (" + t.range + ")", t.n, f1(t.avgUrge), pct(t.followThrough)]))]));
  const wd = weekdayStats(exps);
  g4.append(card("Day of week", [barChart({ labels: wd.map(t => t.label), series: [{ name: "Experiments", color: C.violet, values: wd.map(t => t.n) }], height: 150, yFmt: v => String(Math.round(v)), aria: "Experiments by weekday", half: true }),
    barChart({ labels: wd.map(t => t.label), series: [{ name: "Avg urge", color: C.urge, values: wd.map(t => t.avgUrge) }], yMax: 10, height: 150, aria: "Average urge by weekday", half: true }),
    dataTable("Weekdays", ["Day", "n", "Avg urge", "Follow-through"], wd.map(t => [t.label, t.n, f1(t.avgUrge), pct(t.followThrough)]))]));
  root.append(g4);

  // long-term
  const urges = exps.filter(e => e.urge != null);
  const conf = exps.filter(e => e.beliefConfidence != null);
  root.append(card("Long-term improvement", [
    legend([{ name: "Starting urge, 5-experiment rolling average", color: C.urge }]),
    lineChart({ labels: urges.map(e => fmtDate(e.startedAt)), series: [{ name: "Rolling avg urge", color: C.urge, values: rolling(urges.map(e => e.urge), 5) }], minPoints: 5, aria: "Rolling average starting urge" }),
    conf.length >= 3 ? [h("div", { class: "lbl" }, "Confidence in the new belief (%)"), lineChart({ labels: conf.map(e => fmtDate(e.startedAt)), series: [{ name: "Confidence", color: C.violet, values: conf.map(e => e.beliefConfidence) }], yMax: 100, yFmt: v => Math.round(v) + "%", aria: "Belief confidence over time" })] : h("p", { class: "muted sm" }, "Belief confidence appears after 3 ratings.")
  ], { desc: "A falling starting urge over weeks is the clearest sign that the automatic reaction is changing." }));

  const alts = alternativeStats(exps);
  if (alts.length) root.append(card("Which alternative actions work best", h("div", { class: "tbl-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Alternative", "Tried", "Follow-through", "Avg actual", "Drop from urge"].map(x => h("th", { scope: "col" }, x)))),
    h("tbody", {}, alts.map(a => h("tr", {}, h("th", { scope: "row" }, a.label), h("td", {}, a.n), h("td", {}, pct(a.followThrough)), h("td", {}, f1(a.avgActual)), h("td", {}, a.drop == null ? "–" : a.drop >= 0 ? f1(a.drop) + " lower" : f1(-a.drop) + " higher")))))), { desc: "Alternatives tried only once are shown but aren't enough to judge." }));
  return root;
};

function segmentedInline(options, value, onChange) {
  return h("div", { class: "seg sm", role: "radiogroup" }, options.map(o => h("button", { type: "button", role: "radio", "aria-checked": String(value === o.key), class: "seg-b" + (value === o.key ? " on" : ""), onclick: () => onChange(o.key) }, o.label)));
}
