/* ===== ui/view-library.js — Behaviour Library, module templates, smoking panel ===== */
const libraryUI = { selected: null, edit: null, showArchived: false };

VIEWS.library = function () {
  if (libraryUI.selected) { const b = S.behaviours[libraryUI.selected]; if (b && !b.deleted) return behaviourDetail(b); libraryUI.selected = null; }
  const fin = finished(S);
  const prog = behaviourProgress(S, fin);
  const all = live(S.behaviours), active = all.filter(b => !b.archived), archived = all.filter(b => b.archived);
  const row = b => { const p = prog.find(x => x.id === b.id) || { n: 0, trend: { status: "insufficient" }, urgeSeries: [] };
    return h("button", { type: "button", class: "lib-card", onclick: () => { libraryUI.selected = b.id; libraryUI.edit = null; render(); window.scrollTo(0, 0); } },
      h("div", { class: "row between" }, h("span", { class: "lib-e", "aria-hidden": "true" }, b.emoji), statusPill(p.trend.status)),
      h("b", {}, b.name), h("div", { class: "muted xs" }, MODULES[b.module].name + " · " + plural(p.n, "experiment")), sparkline(p.urgeSeries.slice(-20), C.urge, 140, 30)); };
  const root = h("div", { class: "stack-lg" }, pageHeader("Behaviour Library", "Each behaviour has its own old prediction, alternatives and specialised metrics.", h("button", { class: "btn primary", onclick: () => newBehaviourDialog(id => { libraryUI.selected = id; render(); }) }, icon("plus"), "New behaviour")));
  root.append(active.length ? h("div", { class: "lib-grid" }, active.map(row)) : emptyBox("No behaviours", "Create one from a template below."));
  root.append(card("Templates", h("div", { class: "tpl-grid" }, MODULE_KEYS.filter(k => k !== "general").map(k => h("div", { class: "tpl" }, h("div", { class: "row" }, h("span", { "aria-hidden": "true" }, MODULES[k].emoji), h("b", {}, MODULES[k].name)), h("p", { class: "muted sm" }, MODULES[k].blurb),
    h("div", { class: "muted xs" }, "Tracks: " + ["urge", "prediction", "outcome"].concat([...MODULES[k].startFields, ...MODULES[k].endFields].map(f => f.label.replace(/\?.*$/, "").toLowerCase())).join(", ")),
    linkBtn("Use template", () => newBehaviourDialog(id => { libraryUI.selected = id; render(); }, k), "ghost sm")))), { desc: "Specialised trackers with fitting metrics and alternative actions." }));
  if (archived.length) root.append(card("Archived", h("div", { class: "lib-grid" }, archived.map(row)), { desc: "Archived behaviours keep their history and still appear in analytics." }));
  return root;
};

function newBehaviourDialog(onCreated, moduleKey) {
  const m = { name: moduleKey ? MODULES[moduleKey].name : "", emoji: moduleKey ? MODULES[moduleKey].emoji : "⭐", module: moduleKey || "general" };
  const err = h("div", { class: "field-err", role: "alert" });
  const sel = selectBox(MODULE_KEYS.map(k => ({ value: k, label: MODULES[k].emoji + " " + MODULES[k].name })), m.module, v => { m.module = v; }, { "aria-label": "Template" });
  openModal("New behaviour", [field("Name", textInput(m, "name", { maxlength: 80, placeholder: "e.g. Late-night snacking" }), { required: true }), field("Emoji", textInput(m, "emoji", { maxlength: 4 })), field("Template", sel, { hint: "Sets the specialised metrics and starting alternatives. 'Custom' is a blank template." }), err],
    [{ label: "Cancel", value: false }, { label: "Create", kind: "primary", value: () => {
      if (!m.name.trim()) { err.textContent = "Give the behaviour a name."; return undefined; }
      const t = MODULES[m.module];
      const b = putRecord("behaviours", { id: uid(), module: m.module, name: m.name.trim(), emoji: m.emoji.trim() || t.emoji, belief: t.belief, alternatives: [...t.alternatives], triggers: [], archived: false });
      toast("Behaviour created."); onCreated && onCreated(b.id); return true;
    } }]);
}

function behaviourDetail(b) {
  const m = MODULES[b.module];
  const exps = finished(S).filter(e => e.behaviourId === b.id);
  const sm = summarize(exps), tr = urgeTrend(exps);
  const ed = libraryUI.edit = libraryUI.edit && libraryUI.edit.id === b.id ? libraryUI.edit : { id: b.id, name: b.name, emoji: b.emoji, belief: b.belief, module: b.module, alternatives: [...b.alternatives], triggers: [...b.triggers], newAlt: "", dirty: false };
  const mark = () => { ed.dirty = true; const s = document.getElementById("save-b"); if (s) s.disabled = false; };
  const root = h("div", { class: "stack-lg" }, pageHeader(b.emoji + " " + b.name, m.name + (b.archived ? " · archived" : ""), [linkBtn("← Library", () => { libraryUI.selected = null; libraryUI.edit = null; render(); }), h("button", { class: "btn primary", onclick: () => startNew(b.id) }, icon("plus"), "Experiment")]));
  root.append(h("div", { class: "kpis" }, kpi("Experiments", String(sm.n)), kpi("Starting urge trend", tr.status === "insufficient" ? "–" : `${f1(tr.first)} → ${f1(tr.last)}`, STATUS_META[tr.status].label), kpi("Predicted vs actual", sm.avgExpected == null ? "–" : `${f1(sm.avgExpected)} → ${f1(sm.avgActual)}`), kpi("Follow-through", pct(sm.followThrough), sm.nScored ? `${sm.counts.completed} · ${sm.counts.partial} partly · ${sm.counts.not_completed} not` : "")));
  if (exps.length >= 2) root.append(card("Before vs after", [legend([SERIES.urge, { ...SERIES.expected, dash: true }, SERIES.actual]), lineChart({ labels: exps.map(e => fmtDate(e.startedAt)), series: [{ ...SERIES.urge, values: exps.map(e => e.urge) }, { ...SERIES.expected, dash: true, values: exps.map(e => e.expectedDiscomfort) }, { ...SERIES.actual, values: exps.map(e => e.actualDiscomfort) }], aria: b.name + " ratings over time" })]));
  if (b.module === "smoking") root.append(smokingPanel(smokingStats(S), false));
  if (b.module === "spending") { const sp = spendingStats(S); root.append(card("Spending", h("div", { class: "kpis" }, kpi("Urges tested", String(sp.n)), kpi("Didn't buy", `${sp.notBought} of ${sp.decided}`), kpi("Money not spent", fmtMoney(sp.saved, S.settings.currency), "sum of prices you entered for items you didn't buy")))); }
  const tot = moduleTotals(exps, b.module);
  if (tot.length && b.module !== "smoking") root.append(card("Tracked totals", h("div", { class: "kpis" }, tot.map(t => kpi(t.label.replace(/\(.*\)/, ""), f1(t.total), `avg ${f1(t.avg)} · ${t.n} entries`)))));
  const alts = alternativeStats(exps);
  if (alts.length) root.append(card("Which alternatives work", h("div", { class: "tbl-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Alternative", "Tried", "Follow-through", "Avg actual"].map(x => h("th", { scope: "col" }, x)))), h("tbody", {}, alts.map(a => h("tr", {}, h("th", { scope: "row" }, a.label), h("td", {}, a.n), h("td", {}, pct(a.followThrough)), h("td", {}, f1(a.avgActual)))))))));

  // editor
  const altList = h("div", { class: "list" });
  const drawAlts = () => altList.replaceChildren(...ed.alternatives.map((a, i) => h("div", { class: "alt-row" }, h("span", {}, a), h("button", { type: "button", class: "icon-btn", "aria-label": "Remove " + a, onclick: () => { ed.alternatives.splice(i, 1); mark(); drawAlts(); } }, icon("x")))));
  drawAlts();
  const addAlt = () => { const v = (ed.newAlt || "").trim(); if (!v) return; if (!ed.alternatives.some(a => norm(a) === norm(v))) ed.alternatives.push(v.slice(0, 200)); ed.newAlt = ""; newAltIn.value = ""; mark(); drawAlts(); };
  const newAltIn = textInput(ed, "newAlt", { placeholder: "Add an alternative action", maxlength: 200, onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); addAlt(); } } });
  const err = h("div", { class: "field-err", role: "alert" });
  root.append(card("Edit behaviour", [
    h("div", { class: "grid-2 tight" }, field("Name", textInput(ed, "name", { maxlength: 80, oninput: e => { ed.name = e.target.value; mark(); } })), field("Emoji", textInput(ed, "emoji", { maxlength: 4, oninput: e => { ed.emoji = e.target.value; mark(); } }))),
    field("Template", selectBox(MODULE_KEYS.map(k => ({ value: k, label: MODULES[k].emoji + " " + MODULES[k].name })), ed.module, v => { ed.module = v; mark(); }), { hint: "Changing the template changes which extra metrics new experiments collect. Past data is kept." }),
    field("Old prediction / automatic belief", textArea(ed, "belief", { rows: 2, maxlength: 600, oninput: e => { ed.belief = e.target.value; mark(); } })),
    h("div", { class: "field" }, h("div", { class: "lbl" }, "Alternative actions"), altList, h("div", { class: "row" }, newAltIn, linkBtn("Add", addAlt))),
    err,
    h("div", { class: "row between wrap" },
      h("div", { class: "row" },
        linkBtn(b.archived ? "Unarchive" : "Archive", () => { putRecord("behaviours", Object.assign({}, b, { archived: !b.archived })); toast(b.archived ? "Behaviour restored." : "Archived. Its history is kept."); }),
        linkBtn("Delete", async () => {
          if (await confirmDialog({ title: `Delete "${b.name}"?`, body: `Its ${plural(exps.length, "experiment")} stay in your journal and analytics under "Deleted behaviour". Consider archiving instead.`, confirm: "Delete behaviour", danger: true })) { removeRecord("behaviours", b.id); libraryUI.selected = null; toast("Behaviour deleted. Its experiments were kept."); }
        }, "danger-ghost")),
      h("button", { class: "btn primary", id: "save-b", disabled: !ed.dirty, onclick: () => {
        if (!ed.name.trim()) { err.textContent = "Name can't be empty."; return; }
        putRecord("behaviours", Object.assign({}, b, { name: ed.name.trim(), emoji: ed.emoji.trim() || MODULES[ed.module].emoji, belief: ed.belief, module: ed.module, alternatives: ed.alternatives }));
        libraryUI.edit = null; toast("Saved.");
      } }, "Save changes"))]));
  if (m.resources.length) root.append(card("Support", h("ul", { class: "res" }, m.resources.map(r => h("li", {}, r)))));
  const recent = exps.slice(-8).reverse();
  if (recent.length) root.append(card("Recent experiments", h("div", { class: "list" }, recent.map(e => h("button", { type: "button", class: "erow", onclick: () => openExperiment(e.id) }, h("div", { class: "grow" }, h("b", {}, fmtDateTime(e.startedAt) + (e.trigger ? " · " + e.trigger : "")), h("div", { class: "muted sm" }, gapText(e) || "")), outcomePill(e.outcome))))));
  return root;
}

function smokingPanel(sm, compact) {
  const cur = S.settings.currency;
  const body = h("div", { class: "stack" },
    h("div", { class: "kpis" },
      kpi("Since last cigarette", sm.lastCig ? h("span", { "data-since": sm.lastCig }, fmtDuration(sm.sinceLast)) : "–", sm.lastCig ? "from your smoking log" : "log a cigarette or set a date in Settings"),
      kpi("Cravings passed without smoking", sm.knownOutcome ? `${sm.passed} of ${sm.knownOutcome}` : "–", sm.passRate != null ? pct(sm.passRate) : ""),
      kpi("Avg craving length", sm.avgCravingMin == null ? "–" : Math.round(sm.avgCravingMin) + " min", sm.avgCravingIntensity != null ? `avg intensity ${f1(sm.avgCravingIntensity)}` : ""),
      kpi("Cigarettes avoided", String(sm.avoided), sm.moneySaved != null ? fmtMoney(sm.moneySaved, cur) + " saved" : "add pack price in Settings to see money saved"),
      kpi("Slips logged", String(sm.slipCount), sm.longest ? "longest smoke-free stretch " + fmtDuration(sm.longest) : "")),
    compact ? null : h("p", { class: "muted sm" }, "Relapses are recorded as separate events. They never erase cravings you've ridden out or cigarettes you've avoided."),
    compact ? null : sm.slips.length ? h("div", { class: "list" }, sm.slips.slice(-6).reverse().map(x => h("div", { class: "alt-row" }, h("span", {}, fmtDateTime(x.ts) + " · " + plural(x.count, "cigarette") + (x.note ? " · " + x.note : "")),
      h("button", { type: "button", class: "icon-btn", "aria-label": "Delete this log entry", onclick: async () => { if (await confirmDialog({ title: "Delete this log entry?", body: "Only delete it if it was logged by mistake.", confirm: "Delete", danger: true })) removeRecord("smokingLog", x.id); } }, icon("trash", 16))))) : null,
    h("div", { class: "row" }, linkBtn("Log a cigarette", () => logCigaretteDialog()), compact ? null : linkBtn("Craving experiment", () => { const b = live(S.behaviours).find(x => x.module === "smoking" && !x.archived); startNew(b && b.id); }, "primary")));
  return card("🚬 Smoking", body);
}
