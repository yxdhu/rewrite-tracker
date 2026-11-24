/* ===== ui/view-goals.js — measurable goals computed from records ===== */
function goalProgress(g, now) {
  now = now || Date.now();
  const fin = finished(S).filter(e => !g.behaviourId || e.behaviourId === g.behaviourId);
  let cur = null, n = 0, note = "";
  if (g.metric === "rounds_week") { cur = fin.filter(e => e.startedAt >= startOfWeek(now)).length; n = cur; note = "since Monday"; }
  if (g.metric === "followthrough_10") { const sc = fin.filter(e => e.outcome).slice(-10); n = sc.length; cur = n ? avg(sc.map(e => OUTCOME_SCORE[e.outcome])) * 100 : null; note = `last ${n} with an outcome`; }
  if (g.metric === "urge_avg_7") { const u = fin.filter(e => e.urge != null).slice(-7); n = u.length; cur = n >= 3 ? avg(u.map(e => e.urge)) : null; note = n >= 3 ? `last ${n} experiments` : "needs 3+ experiments"; }
  if (g.metric === "confidence_avg_5") { const c = fin.filter(e => e.beliefConfidence != null).slice(-5); n = c.length; cur = n ? avg(c.map(e => e.beliefConfidence)) : null; note = n ? `last ${n} ratings` : "no ratings yet"; }
  if (g.metric === "smokefree_days") { const sm = smokingStats(S, now); cur = sm.sinceLast != null ? sm.sinceLast / DAY : null; n = sm.lastCig ? 1 : 0; note = sm.lastCig ? "since last logged cigarette" : "log a cigarette or set a date in Settings"; }
  const meta = GOAL_METRICS[g.metric];
  const met = cur == null ? false : meta.dir === ">=" ? cur >= g.target : cur <= g.target;
  const frac = cur == null ? 0 : meta.dir === ">=" ? Math.min(1, g.target ? cur / g.target : 1) : (met ? 1 : Math.max(0, Math.min(1, (10 - cur) / Math.max(0.01, 10 - g.target))));
  return { cur, met, frac, note, n };
}

VIEWS.goals = function () {
  const goals = live(S.goals).sort((a, b) => a.archived - b.archived || b.createdAt - a.createdAt);
  const root = h("div", { class: "stack-lg" }, pageHeader("Goals", "Targets measured from your experiments, not from ticking boxes.", h("button", { class: "btn primary", onclick: () => goalDialog() }, icon("plus"), "New goal")));
  if (!goals.length) root.append(emptyBox("No goals yet", "Example: 'Average starting urge for smoking at or below 5' or '4 experiments per week'.", h("button", { class: "btn primary", onclick: () => goalDialog() }, "Create a goal")));
  root.append(h("div", { class: "goal-grid" }, goals.map(g => {
    const p = goalProgress(g), meta = GOAL_METRICS[g.metric];
    const val = p.cur == null ? "–" : (g.metric === "smokefree_days" ? f1(p.cur) : meta.unit === "%" ? Math.round(p.cur) : f1(p.cur));
    return h("article", { class: "card goal" + (g.archived ? " archived" : "") },
      h("div", { class: "row between" }, h("h3", {}, g.title || meta.label), p.met ? h("span", { class: "pill good" }, "✓ On target") : h("span", { class: "pill muted" }, "In progress")),
      h("div", { class: "muted sm" }, meta.label + (g.behaviourId ? " · " + bName(g.behaviourId) : " · all behaviours")),
      h("div", { class: "goal-v" }, h("b", {}, val + (p.cur == null ? "" : meta.unit)), h("span", { class: "muted" }, ` ${meta.dir === ">=" ? "target ≥" : "target ≤"} ${g.target}${meta.unit}`)),
      h("div", { class: "meter", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(p.frac * 100), "aria-label": "Progress towards goal" }, h("div", { style: { width: p.frac * 100 + "%", background: p.met ? C.good : C.violet } })),
      h("div", { class: "muted xs" }, p.note),
      g.why ? h("p", { class: "goal-why" }, "Why: " + g.why) : null,
      h("div", { class: "row" }, linkBtn("Edit", () => goalDialog(g), "ghost sm"), linkBtn(g.archived ? "Unarchive" : "Archive", () => putRecord("goals", Object.assign({}, g, { archived: !g.archived })), "ghost sm"),
        linkBtn("Delete", async () => { if (await confirmDialog({ title: "Delete this goal?", body: "Only the goal is removed; your experiments stay.", confirm: "Delete", danger: true })) removeRecord("goals", g.id); }, "danger-ghost sm")));
  })));
  return root;
};

function goalDialog(g) {
  const m = g ? { title: g.title, metric: g.metric, target: g.target, behaviourId: g.behaviourId || "", why: g.why } : { title: "", metric: "rounds_week", target: 4, behaviourId: "", why: "" };
  const err = h("div", { class: "field-err", role: "alert" });
  const help = h("div", { class: "hint" }, GOAL_METRICS[m.metric].help);
  openModal(g ? "Edit goal" : "New goal", [
    field("Name (optional)", textInput(m, "title", { maxlength: 120, placeholder: "e.g. Craving control" })),
    field("Measure", selectBox(Object.entries(GOAL_METRICS).map(([k, v]) => ({ value: k, label: v.label })), m.metric, v => { m.metric = v; help.textContent = GOAL_METRICS[v].help; })), help,
    field("Target", numberInput(m, "target", { min: 0, max: 10000, step: "0.5" }), { hint: "For urge use 0–10, for rates and confidence use 0–100." }),
    field("Behaviour", selectBox([{ value: "", label: "All behaviours" }].concat(live(S.behaviours).map(b => ({ value: b.id, label: b.emoji + " " + b.name }))), m.behaviourId, v => m.behaviourId = v)),
    field("Why this matters (optional)", textArea(m, "why", { rows: 2, maxlength: 1000 })), err
  ], [{ label: "Cancel", value: false }, { label: "Save goal", kind: "primary", value: () => {
    const t = m.target; const max = ["followthrough_10", "confidence_avg_5"].includes(m.metric) ? 100 : m.metric === "urge_avg_7" ? 10 : 10000;
    if (t == null || !Number.isFinite(t) || t < 0 || t > max) { err.textContent = `Enter a target between 0 and ${max}.`; return undefined; }
    putRecord("goals", { id: g ? g.id : uid(), title: m.title.trim(), metric: m.metric, target: t, behaviourId: m.behaviourId || null, why: m.why, archived: g ? g.archived : false, createdAt: g ? g.createdAt : Date.now() }); toast("Goal saved."); return true;
  } }]);
}
