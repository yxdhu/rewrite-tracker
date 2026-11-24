/* ===== ui/view-home.js — Command Center ===== */
VIEWS.home = function () {
  const now = Date.now();
  const fin = finished(S), act = activeExps(S);
  const sum30 = summarize(fin.filter(e => e.startedAt >= now - 30 * DAY));
  const all = summarize(fin);
  const rec = recommendNext(S, now);
  const greet = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const root = h("div", { class: "stack-lg" });
  root.append(pageHeader(greet, new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) + " · Prediction → Experience → Evidence → Learning",
    h("button", { class: "btn primary", onclick: () => startNew() }, icon("plus"), "New experiment")));

  // recommended next action
  const recBtn = rec.action.type === "finish" ? linkBtn("Record result", () => { practiceUI.finishId = rec.action.id; go("practice"); }, "primary")
    : rec.action.type === "practice" ? linkBtn("Open practice", () => go("practice"), "primary")
      : rec.action.type === "weekly" ? linkBtn("Open weekly reflection", () => { journalUI.openWeekly = true; go("journal"); }, "primary")
        : linkBtn("Start experiment", () => startNew(rec.action.behaviourId, rec.action.alternative), "primary");
  root.append(h("section", { class: "card hero", "aria-label": "Recommended next action" },
    h("div", { class: "eyebrow" }, icon("spark", 14), "Recommended next action"), h("h2", { class: "hero-t" }, rec.title), h("p", { class: "muted" }, rec.body), h("div", { class: "row" }, recBtn)));

  if (!fin.length && !act.length) {
    root.append(card("How this works", h("ol", { class: "steps" },
      ["Pick a behaviour and notice the trigger and the automatic thought.", "Rate the urge and write down what you predict will happen.", "Do the healthier alternative action.", "Record what actually happened, including partial results.", "Compare prediction with reality and note the lesson. Repeat over weeks."].map(t => h("li", {}, t))),
      { desc: "Your dashboard fills with real numbers as you log experiments. Nothing here is estimated or made up." }));
  }

  // KPI row
  root.append(h("div", { class: "kpis" },
    kpi("Completed experiments", String(fin.length), sum30.n ? `${sum30.n} in the last 30 days` : "None in the last 30 days"),
    kpi("Active now", String(act.length), act.length ? "waiting for a result" : "none open"),
    kpi("Prediction accuracy", all.accuracy == null ? "–" : pct(all.accuracy), all.nGaps ? `within ±1 point · ${all.nGaps} experiments` : "needs completed experiments"),
    kpi("Predicted vs actual", all.avgExpected == null ? "–" : `${f1(all.avgExpected)} → ${f1(all.avgActual)}`, all.avgGap == null ? "average discomfort" : all.avgGap > 0 ? `you overestimate by ${f1(all.avgGap)} on average` : all.avgGap < 0 ? `harder than predicted by ${f1(-all.avgGap)}` : "predictions match", { tone: all.avgGap > 0.5 ? "good" : "" }),
    kpi("Follow-through", all.followThrough == null ? "–" : pct(all.followThrough), all.nScored ? `${all.counts.completed} done · ${all.counts.partial} partly · ${all.counts.not_completed} not` : "partial counts as half")));

  // active experiments
  if (act.length) root.append(card("Active experiments", h("div", { class: "list" }, act.map(e => activeRow(e))), { action: linkBtn("Open practice", () => go("practice")) }));

  // behaviour progress + weekly trend
  const prog = behaviourProgress(S, fin).filter(b => b.n > 0 || !b.missing);
  const grid = h("div", { class: "grid-2" });
  grid.append(card("Behaviour progress", prog.length ? h("div", { class: "list" }, prog.map(b => h("button", { class: "brow", type: "button", onclick: () => { libraryUI.selected = b.id; go("library"); } },
    h("span", { class: "brow-n" }, b.emoji + " " + b.name), sparkline(b.urgeSeries.slice(-20), C.urge), statusPill(b.trend.status, b.n)))) : emptyBox("No behaviours yet", "Add one in the Behaviour Library."),
    { desc: "Trend = change in your starting urge (first vs latest experiments). Lower is better." }));
  const weeks = periodSeries(fin, "week", 8, now);
  grid.append(card("Last 8 weeks", [
    legend([SERIES.expected, SERIES.actual]),
    barChart({ labels: weeks.map(w => w.label), series: [{ ...SERIES.expected, values: weeks.map(w => w.avgExpected) }, { ...SERIES.actual, values: weeks.map(w => w.avgActual) }], yMax: 10, aria: "Average predicted versus actual discomfort per week", half: true, countLabel: { name: "Experiments", values: weeks.map(w => w.n) } }),
    dataTable("Weekly averages", ["Week", "Experiments", "Predicted", "Actual"], weeks.map(w => [w.label, w.n, f1(w.avgExpected), f1(w.avgActual)]))
  ]));
  root.append(grid);

  // triggers + most improved / difficult
  const grid2 = h("div", { class: "grid-2" });
  const trig = triggerStats(fin).slice(0, 5);
  grid2.append(card("Most common triggers", trig.length ? hbars(trig.map(t => ({ label: t.label, value: t.n, tip: [{ name: "Experiments", value: t.n }, { name: "Avg urge", value: f1(t.avgUrge) }, { name: "Follow-through", value: pct(t.followThrough) }] })), { fmt: v => v + "×", color: C.violet, aria: "Most common triggers" }) : emptyBox("No triggers logged yet", "Add a trigger when you start an experiment.")));
  const withTrend = prog.filter(b => b.trend.status !== "insufficient");
  const improved = [...withTrend].sort((a, b) => b.trend.delta - a.trend.delta)[0];
  const difficult = prog.filter(b => b.summary.nScored >= 3).sort((a, b) => a.summary.followThrough - b.summary.followThrough || (b.summary.avgActual || 0) - (a.summary.avgActual || 0))[0];
  grid2.append(card("Most improved & most difficult", h("div", { class: "list" },
    improved && improved.trend.delta > 0 ? h("div", { class: "mini" }, h("div", { class: "mini-l" }, "Most improved"), h("b", {}, improved.emoji + " " + improved.name), h("span", { class: "muted" }, ` starting urge ${f1(improved.trend.first)} → ${f1(improved.trend.last)}`)) : h("div", { class: "mini muted" }, `Most improved: needs ${MIN_TREND_N}+ experiments in a behaviour with a falling urge.`),
    difficult ? h("div", { class: "mini" }, h("div", { class: "mini-l" }, "Most difficult right now"), h("b", {}, difficult.emoji + " " + difficult.name), h("span", { class: "muted" }, ` follow-through ${pct(difficult.summary.followThrough)}, actual discomfort ${f1(difficult.summary.avgActual)}`)) : h("div", { class: "mini muted" }, "Most difficult: needs 3+ experiments with a recorded outcome."))));
  root.append(grid2);

  // smoking quick panel
  const sm = smokingStats(S, now);
  if (sm.hasSmokingBehaviour && (sm.cravings || sm.slipCount || S.settings.lastCigaretteAt)) root.append(smokingPanel(sm, true));

  // achievements
  const ach = achievements(S).slice(0, 4);
  root.append(card("Recent achievements", ach.length ? h("div", { class: "achs" }, ach.map(a => h("div", { class: "ach" }, h("div", { class: "ach-i", "aria-hidden": "true" }, icon("star", 16)), h("div", {}, h("b", {}, a.title), h("div", { class: "muted sm" }, a.text), h("div", { class: "muted xs" }, fmtDate(a.at)))))) : emptyBox("Nothing yet", "Achievements are earned from real evidence, like your first busted prediction."),
    { desc: "Streaks alone don't show change. These are based on what your data actually shows." }));
  return root;
};

function activeRow(e) {
  const w = windowInfo(e, S.settings);
  return h("div", { class: "arow" },
    h("div", { class: "grow" }, h("b", {}, expTitle(e)), h("div", { class: "muted sm" }, "Started " + fmtDateTime(e.startedAt) + " · " + (e.alternative || "no alternative set")),
      w ? h("div", { class: "countdown" + (w.open ? "" : " closed"), "data-countdown": e.startedAt + w.hours * HOUR }, w.open ? "window " + fmtDuration(w.left) + " left" : "window closed (you can still record it)") : null),
    linkBtn("Record result", () => { practiceUI.finishId = e.id; go("practice"); }, "primary sm"));
}
