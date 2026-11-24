/* ===== ui/view-practice.js — Daily Practice: new experiment wizard, active experiments, results ===== */
const practiceUI = { mode: "list", step: 0, draft: null, errors: {}, finishId: null, fin: {} };
const STEPS = ["Behaviour", "Situation", "Prediction", "Alternative"];

function blankDraft(behaviourId, alternative) {
  const d = { behaviourId: behaviourId || null, situation: "", trigger: "", thought: "", emotion: "", urge: null, expectedDiscomfort: null, expectedDurationMin: null, expectedConsequence: "", alternative: alternative || "", saveAlt: false, moduleData: {}, when: "" };
  prefillModule(d); return d;
}
function prefillModule(d) {
  const b = behaviourOf(S, d.behaviourId);
  if (b && b.module === "smoking" && d.moduleData.minutesSinceLast == null) { const sm = smokingStats(S); if (sm.sinceLast != null) d.moduleData.minutesSinceLast = Math.round(sm.sinceLast / MIN); }
}
function startNew(behaviourId, alternative) {
  practiceUI.mode = "new"; practiceUI.errors = {};
  practiceUI.draft = blankDraft(behaviourId, alternative); practiceUI.step = behaviourId ? 1 : 0;
  saveNewDraft(); practiceUI.finishId = null; go("practice");
}
function saveNewDraft() { setDraft("newExp", { draft: practiceUI.draft, step: practiceUI.step }); }

VIEWS.practice = function () {
  if (practiceUI.mode === "list" && !practiceUI.draft) { const d = getDraft("newExp"); if (d && d.draft) { practiceUI.draft = d.draft; practiceUI.step = d.step || 0; } }
  if (practiceUI.finishId) { const e = S.experiments[practiceUI.finishId]; if (e && !e.deleted && e.status === "active") return finishView(e); practiceUI.finishId = null; }
  if (practiceUI.mode === "new" && practiceUI.draft) return wizardView();
  return practiceList();
};

function practiceList() {
  const act = activeExps(S);
  const hasSmoking = live(S.behaviours).some(b => b.module === "smoking" && !b.archived);
  const root = h("div", { class: "stack-lg" }, pageHeader("Daily Practice", "Run experiments against your automatic predictions. Several can run at once.",
    [hasSmoking ? linkBtn("Log a cigarette", () => logCigaretteDialog()) : null, h("button", { class: "btn primary", onclick: () => startNew() }, icon("plus"), "New experiment")]));
  if (practiceUI.draft && practiceUI.mode !== "new") root.append(h("div", { class: "banner" }, h("span", {}, "You have an unfinished experiment draft."), h("div", { class: "row" }, linkBtn("Continue", () => { practiceUI.mode = "new"; render(); }, "primary sm"), linkBtn("Discard draft", () => { practiceUI.draft = null; setDraft("newExp", null); render(); }, "ghost sm"))));
  root.append(card(`Active experiments (${act.length})`, act.length ? h("div", { class: "list" }, act.map(e => activeCard(e))) : emptyBox("No active experiments", "Start one when you notice a trigger, or plan one for later today.", h("button", { class: "btn primary", onclick: () => startNew() }, "Start an experiment"))));
  const quick = live(S.behaviours).filter(b => !b.archived);
  root.append(card("Quick start", h("div", { class: "bgrid" }, quick.map(b => h("button", { class: "bcard", type: "button", onclick: () => startNew(b.id) }, h("span", { class: "bcard-e", "aria-hidden": "true" }, b.emoji), h("span", { class: "bcard-n" }, b.name), h("span", { class: "muted xs" }, MODULES[b.module].name)))),
    { desc: "Tap a behaviour to start with the situation step." }));
  const recent = finished(S).slice(-5).reverse();
  if (recent.length) root.append(card("Recently completed", h("div", { class: "list" }, recent.map(e => h("button", { type: "button", class: "erow", onclick: () => openExperiment(e.id) }, h("div", { class: "grow" }, h("b", {}, expTitle(e)), h("div", { class: "muted sm" }, fmtDateTime(e.startedAt) + (gapText(e) ? " · " + gapText(e) : ""))), outcomePill(e.outcome)))), { action: linkBtn("All in journal", () => go("journal")) }));
  root.append(h("p", { class: "muted sm method-note" }, S.settings.windowEnabled ? `Experimental framework: each experiment shows a ${f1(S.settings.windowHours)}-hour window, inspired by memory-reconsolidation research. It is not a proven biological deadline; results recorded later still count. Change it in Settings.` : "The experiment window is turned off in Settings."));
  return root;
}

function activeCard(e) {
  const w = windowInfo(e, S.settings);
  return h("article", { class: "acard" },
    h("div", { class: "row between" }, h("h3", {}, expTitle(e)), w ? h("span", { class: "countdown" + (w.open ? "" : " closed"), "data-countdown": e.startedAt + w.hours * HOUR }, w.open ? "window " + fmtDuration(w.left) + " left" : "window closed (you can still record it)") : null),
    h("div", { class: "kv" }, h("span", {}, "Alternative"), h("b", {}, e.alternative || "–")),
    h("div", { class: "kv" }, h("span", {}, "Prediction"), h("b", {}, `urge ${e.urge ?? "–"} · expected discomfort ${e.expectedDiscomfort ?? "–"}` + (e.expectedDurationMin != null ? ` · ~${e.expectedDurationMin} min` : ""))),
    e.expectedConsequence ? h("div", { class: "kv" }, h("span", {}, "Expected consequence"), h("span", {}, e.expectedConsequence)) : null,
    h("div", { class: "row" }, linkBtn("Record result", () => { practiceUI.finishId = e.id; render(); window.scrollTo(0, 0); }, "primary"),
      linkBtn("Discard", async () => { if (await confirmDialog({ title: "Discard this experiment?", body: "It will be removed and won't count in your analytics. To keep it as data, record it as 'Not this time' instead.", confirm: "Discard", danger: true })) { removeRecord("experiments", e.id); setDraft("finish_" + e.id, null); toast("Experiment discarded."); } }, "ghost")));
}

/* ---------- wizard ---------- */
function wizardView() {
  const d = practiceUI.draft, st = practiceUI.step, err = practiceUI.errors;
  const b = behaviourOf(S, d.behaviourId), m = b ? MODULES[b.module] : MODULES.general;
  const onchange_ = () => saveNewDraft();
  const stepper = h("ol", { class: "stepper", "aria-label": "Steps" }, STEPS.map((t, i) => h("li", { class: i === st ? "on" : i < st ? "done" : "", "aria-current": i === st ? "step" : null }, h("span", {}, i + 1), t)));
  const body = h("div", { class: "stack" });
  if (st === 0) {
    const list = live(S.behaviours).filter(x => !x.archived);
    body.append(h("p", { class: "muted" }, "Which automatic reaction are you working with?"),
      h("div", { class: "bgrid", role: "radiogroup", "aria-label": "Behaviour" }, list.map(x => h("button", { type: "button", role: "radio", "aria-checked": String(d.behaviourId === x.id), class: "bcard" + (d.behaviourId === x.id ? " on" : ""), onclick: () => { d.behaviourId = x.id; d.moduleData = {}; prefillModule(d); practiceUI.step = 1; practiceUI.errors = {}; saveNewDraft(); render(); } }, h("span", { class: "bcard-e", "aria-hidden": "true" }, x.emoji), h("span", { class: "bcard-n" }, x.name), h("span", { class: "muted xs" }, MODULES[x.module].name)))),
      err.behaviourId ? h("div", { class: "field-err", role: "alert" }, err.behaviourId) : null,
      linkBtn("+ Create a custom behaviour", () => newBehaviourDialog(id => { d.behaviourId = id; practiceUI.step = 1; saveNewDraft(); render(); })));
  }
  if (st === 1) {
    const pastTriggers = triggerStats(finished(S).filter(e => e.behaviourId === d.behaviourId)).map(t => t.label);
    body.append(h("div", { class: "callout" }, h("b", {}, b.emoji + " " + b.name), h("div", { class: "muted sm" }, m.blurb)),
      field("Specific situation", textArea(d, "situation", { rows: 2, placeholder: "Where are you, what's happening?", maxlength: 500, onchange_ }), { hint: "Be concrete: 'At my desk after lunch, laptop open'." }),
      chipText("Trigger", [...new Set([...pastTriggers, ...(b.triggers || []), ...m.triggers])], d, "trigger", { placeholder: "What set it off?", maxlength: 80, onchange_ }),
      chipText("Emotion", EMOTIONS, d, "emotion", { placeholder: "Or type your own", maxlength: 40, onchange_ }),
      field("Automatic thought", textArea(d, "thought", { rows: 2, placeholder: b.belief || "What does your mind say will happen?", maxlength: 500, onchange_ }), { hint: "The first thought that showed up, word for word if you can." }),
      field("When did this happen?", h("input", { type: "datetime-local", class: "input", value: d.when || "", max: toLocalDT(Date.now()), oninput: e => { d.when = e.target.value; onchange_(); } }), { hint: "Leave empty for right now. Use it to log an experiment after the fact.", error: err.when }));
  }
  if (st === 2) {
    body.append(rating(m.labels.urge, d, "urge", { color: C.urge, required: true, error: err.urge, lo: "0 none", hi: "10 overwhelming", onchange_ }),
      rating(m.labels.expected, d, "expectedDiscomfort", { color: C.expected, required: true, error: err.expectedDiscomfort, hint: "Your honest gut prediction, before you act.", lo: "0 fine", hi: "10 unbearable", onchange_ }),
      field("How long do you expect it to last? (minutes)", numberInput(d, "expectedDurationMin", { min: 0, max: 10080, step: 1, placeholder: "e.g. 60", onchange_ }), { error: err.expectedDurationMin }),
      field("What do you expect will happen?", textArea(d, "expectedConsequence", { rows: 2, placeholder: "e.g. I'll be irritable all afternoon and can't focus", maxlength: 500, onchange_ })),
      ...moduleFields(m.startFields, d.moduleData, err, onchange_));
  }
  if (st === 3) {
    const used = alternativeStats(finished(S).filter(e => e.behaviourId === d.behaviourId)).map(a => a.label);
    body.append(chipText("Alternative action", [...new Set([...(b.alternatives || []), ...used])], d, "alternative", { placeholder: "What will you do instead?", required: true, error: err.alternative, maxlength: 200, max: 10, onchange_ }),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: d.saveAlt, onchange: e => { d.saveAlt = e.target.checked; onchange_(); } }), "Save this alternative to ", b.name),
      h("div", { class: "summary" }, h("div", { class: "lbl" }, "Your prediction"), h("p", {}, `Urge ${d.urge}/10 · expected discomfort ${d.expectedDiscomfort}/10` + (d.expectedDurationMin != null ? ` for about ${d.expectedDurationMin} min` : "") + (d.expectedConsequence ? ` · "${d.expectedConsequence}"` : ""))));
  }
  const nav = h("div", { class: "wizard-f" },
    st > 0 ? linkBtn("Back", () => { practiceUI.step--; practiceUI.errors = {}; saveNewDraft(); render(); }) : linkBtn("Cancel", async () => { if (await confirmDialog({ title: "Discard this draft?", body: "What you've entered for this experiment will be lost.", confirm: "Discard draft", danger: true })) { practiceUI.draft = null; practiceUI.mode = "list"; setDraft("newExp", null); render(); } }),
    h("div", { class: "row" }, st < 3 ? (st > 0 ? h("button", { class: "btn primary", onclick: () => nextStep() }, "Next", icon("arrow")) : null)
      : [linkBtn("Already done: record result", () => createExperiment(true)), h("button", { class: "btn primary", onclick: () => createExperiment(false) }, "Start experiment")]));
  return h("div", { class: "stack-lg wizard" }, pageHeader("New experiment", "Step " + (st + 1) + " of 4 · " + STEPS[st], linkBtn("Back to practice", () => { practiceUI.mode = "list"; render(); })), stepper, card(null, [body, nav]));
}
function toLocalDT(t) { const d = new Date(t - new Date(t).getTimezoneOffset() * MIN); return d.toISOString().slice(0, 16); }

function moduleFields(fields, data, err, onchange_) {
  return fields.filter(f => !f.showIf || f.showIf(data)).map(f => {
    if (f.type === "bool") return yesNo(f.label, data, f.key, { hint: f.help, onchange_: () => { onchange_ && onchange_(); render(); } });
    return field(f.label + (f.type === "money" ? ` (${S.settings.currency})` : ""), numberInput(data, f.key, { min: f.min, max: f.max, step: f.type === "money" ? "0.01" : "1", onchange_ }), { hint: f.help, error: err["md_" + f.key] });
  });
}
function validateNum(v, lo, hi) { return v == null || (Number.isFinite(v) && v >= lo && v <= hi); }

function validateStep(st) {
  const d = practiceUI.draft, e = {};
  if (st >= 0 && !behaviourOf(S, d.behaviourId)) e.behaviourId = "Choose a behaviour.";
  if (st >= 1 && d.when) { const t = new Date(d.when).getTime(); if (!Number.isFinite(t)) e.when = "Enter a valid date and time."; else if (t > Date.now() + 5 * MIN) e.when = "This can't be in the future."; }
  if (st >= 2) {
    if (d.urge == null) e.urge = "Rate the urge (move the slider).";
    if (d.expectedDiscomfort == null) e.expectedDiscomfort = "Write down your prediction (move the slider).";
    if (!validateNum(d.expectedDurationMin, 0, 10080)) e.expectedDurationMin = "Enter minutes between 0 and 10080.";
    const b = behaviourOf(S, d.behaviourId);
    if (b) MODULES[b.module].startFields.forEach(f => { if (!validateNum(d.moduleData[f.key], f.min ?? 0, f.max ?? 1e6)) e["md_" + f.key] = `Enter a value between ${f.min ?? 0} and ${f.max}.`; });
  }
  if (st >= 3 && !d.alternative.trim()) e.alternative = "Choose or describe the alternative action.";
  return e;
}
function nextStep() {
  const e = validateStep(practiceUI.step); practiceUI.errors = e;
  if (Object.keys(e).length) { render(); const f = document.querySelector(".has-err input,.has-err textarea,.field-err"); f && f.scrollIntoView({ block: "center" }); liveRegion("Please fix the highlighted fields."); return; }
  practiceUI.step++; saveNewDraft(); render(); window.scrollTo(0, 0);
}
function createExperiment(alreadyDone) {
  const e = validateStep(3); practiceUI.errors = e;
  if (Object.keys(e).length) { const firstBad = e.behaviourId ? 0 : e.when ? 1 : (e.urge || e.expectedDiscomfort || e.expectedDurationMin || Object.keys(e).some(k => k.startsWith("md_"))) ? 2 : 3; practiceUI.step = firstBad; render(); return; }
  const d = practiceUI.draft, b = behaviourOf(S, d.behaviourId);
  const startedAt = d.when ? new Date(d.when).getTime() : Date.now();
  const rec = putRecord("experiments", { id: uid(), behaviourId: b.id, module: b.module, status: "active", startedAt, situation: d.situation, trigger: d.trigger.trim(), thought: d.thought, emotion: d.emotion.trim(), urge: d.urge, expectedDiscomfort: d.expectedDiscomfort, expectedDurationMin: d.expectedDurationMin, expectedConsequence: d.expectedConsequence, alternative: d.alternative.trim(), moduleData: d.moduleData, windowHours: S.settings.windowHours });
  if (d.saveAlt && !b.alternatives.some(a => norm(a) === norm(d.alternative))) putRecord("behaviours", Object.assign({}, b, { alternatives: [...b.alternatives, d.alternative.trim()] }));
  if (d.trigger.trim() && !b.triggers.some(t => norm(t) === norm(d.trigger)) && !MODULES[b.module].triggers.some(t => norm(t) === norm(d.trigger))) { const bb = behaviourOf(S, b.id); putRecord("behaviours", Object.assign({}, bb, { triggers: [...bb.triggers, d.trigger.trim()].slice(-30) })); }
  practiceUI.draft = null; practiceUI.mode = "list"; setDraft("newExp", null);
  if (alreadyDone) { practiceUI.finishId = rec.id; render(); window.scrollTo(0, 0); }
  else { toast("Experiment started. Do the alternative action, then record what actually happened."); render(); }
}

/* ---------- finish an active experiment ---------- */
function finishView(e) {
  const saved = getDraft("finish_" + e.id);
  const f = practiceUI.fin[e.id] = practiceUI.fin[e.id] || Object.assign({ outcome: null, actualDiscomfort: null, actualDurationMin: null, actualConsequence: "", surprise: "", learned: "", beliefConfidence: null, tags: [], highlight: false, moduleData: {} }, saved || {});
  const errs = f._errors || {};
  const m = MODULES[e.module] || MODULES.general;
  const onchange_ = () => { const c = Object.assign({}, f); delete c._errors; setDraft("finish_" + e.id, c); };
  if (e.module === "smoking" && f.moduleData.cravingPassed === true && f.moduleData.cigarettesAvoided == null) f.moduleData.cigarettesAvoided = 1;
  const body = h("div", { class: "stack" },
    h("div", { class: "callout" }, h("div", { class: "lbl" }, "You predicted"), h("p", {}, `Urge ${e.urge ?? "–"}/10 · discomfort ${e.expectedDiscomfort ?? "–"}/10` + (e.expectedDurationMin != null ? ` for ~${e.expectedDurationMin} min` : "") + (e.expectedConsequence ? ` · "${e.expectedConsequence}"` : "")), h("div", { class: "muted sm" }, "Alternative: " + (e.alternative || "–"))),
    segmented("Did you do the alternative action?", OUTCOMES.map(o => ({ key: o.key, label: o.label })), f, "outcome", { required: true, error: errs.outcome, hint: "Partial results and 'not this time' are useful data too.", onchange_ }),
    rating(m.labels.actual, f, "actualDiscomfort", { color: C.actual, required: true, error: errs.actualDiscomfort, lo: "0 fine", hi: "10 unbearable", onchange_ }),
    field(`How long did the ${m.labels.duration} actually last? (minutes)`, numberInput(f, "actualDurationMin", { min: 0, max: 10080, placeholder: "e.g. 12", onchange_ }), { error: errs.actualDurationMin }),
    field("What actually happened?", textArea(f, "actualConsequence", { rows: 2, maxlength: 500, placeholder: "Compare with what you expected", onchange_ })),
    moduleFields(m.endFields, f.moduleData, errs, onchange_),
    field("What surprised you?", textArea(f, "surprise", { rows: 2, maxlength: 1000, onchange_ })),
    field("What did you learn?", textArea(f, "learned", { rows: 2, maxlength: 1000, placeholder: "One sentence you want to remember", onchange_ })),
    rating("Confidence in the new belief", f, "beliefConfidence", { max: 100, step: 5, unit: "%", color: C.violet, hint: "How much do you now believe the new action is manageable?", lo: "0%", hi: "100%", onchange_ }),
    field("Tags", tagsInput(f, "tags")),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: f.highlight, onchange: ev => { f.highlight = ev.target.checked; onchange_(); } }), "Highlight this lesson in the journal"));
  const footer = h("div", { class: "wizard-f" }, linkBtn("Back", () => { practiceUI.finishId = null; render(); }), h("button", { class: "btn primary", onclick: () => saveFinish(e, f) }, "Save result"));
  return h("div", { class: "stack-lg" }, pageHeader("Record the result", expTitle(e) + " · started " + fmtDateTime(e.startedAt)), card(null, [body, footer]));
}
function saveFinish(e, f) {
  const errs = {};
  if (!f.outcome) errs.outcome = "Choose what happened.";
  if (f.actualDiscomfort == null) errs.actualDiscomfort = "Rate how it actually felt (move the slider).";
  if (!validateNum(f.actualDurationMin, 0, 10080)) errs.actualDurationMin = "Enter minutes between 0 and 10080.";
  (MODULES[e.module] || MODULES.general).endFields.forEach(fl => { if (fl.type !== "bool" && !validateNum(f.moduleData[fl.key], fl.min ?? 0, fl.max ?? 1e6)) errs["md_" + fl.key] = `Enter a value between ${fl.min ?? 0} and ${fl.max}.`; });
  f._errors = errs;
  if (Object.keys(errs).length) { render(); const x = document.querySelector(".field-err"); x && x.scrollIntoView({ block: "center" }); liveRegion("Please fix the highlighted fields."); return; }
  const md = Object.assign({}, e.moduleData, f.moduleData);
  if (md.cravingPassed !== true) delete md.cigarettesAvoided;
  const cur = S.experiments[e.id];
  if (!cur || cur.deleted || cur.status !== "active") { toast("This experiment was already recorded on another device or tab.", "error"); practiceUI.finishId = null; render(); return; }
  const rec = putRecord("experiments", Object.assign({}, cur, { status: "completed", completedAt: Date.now(), outcome: f.outcome, actualDiscomfort: f.actualDiscomfort, actualDurationMin: f.actualDurationMin, actualConsequence: f.actualConsequence, surprise: f.surprise, learned: f.learned, beliefConfidence: f.beliefConfidence, tags: f.tags, highlight: f.highlight, moduleData: md }));
  if (e.module === "smoking" && md.cravingPassed === false) { putRecord("smokingLog", { id: uid(), ts: Date.now(), count: 1, note: "Logged from experiment", experimentId: e.id }); }
  setDraft("finish_" + e.id, null); delete practiceUI.fin[e.id]; practiceUI.finishId = null;
  render(); resultDialog(rec);
}
function resultDialog(e) {
  const g = gapOf(e);
  const msg = g > 0 ? `You predicted ${e.expectedDiscomfort}, it was ${e.actualDiscomfort}. That ${g}-point gap is the evidence your brain needs.`
    : g === 0 ? `Your prediction matched (${e.actualDiscomfort}). Accurate predictions are useful too; repetition does the rest.`
      : `It was harder than predicted (${e.actualDiscomfort} vs ${e.expectedDiscomfort}). That's valuable data: next time try a smaller step or prepare for this situation.`;
  const extra = e.module === "smoking" && e.moduleData.cravingPassed === false ? h("p", { class: "muted" }, "Logged as a slip in your smoking log. Your previous progress and totals are kept.") : null;
  const actions = [{ label: "Done", kind: "primary", value: true }];
  if (UI.ai && S.settings.aiEnabled) actions.unshift({ label: "Ask the coach about this", value: "coach" });
  openModal("Result saved", [predVsActual(e), h("p", {}, msg), extra, e.outcome === "not_completed" ? h("p", { class: "muted" }, "Not completing the action this time still counts: you now know more about this trigger.") : null], actions)
    .then(v => { if (v === "coach") { coachUI.focusId = e.id; coachUI.pendingMode = "focus"; go("insights"); } });
}

/* ---------- smoking log ---------- */
function logCigaretteDialog() {
  const m = { count: 1, when: "", note: "" }; const err = h("div", { class: "field-err", role: "alert" });
  openModal("Log a cigarette", [h("p", { class: "muted" }, "Slips are data, not failure. Logging one never resets your totals or previous progress."),
    field("How many?", numberInput(m, "count", { min: 1, max: 60 })), field("When? (empty = now)", h("input", { type: "datetime-local", class: "input", max: toLocalDT(Date.now()), oninput: e => m.when = e.target.value })),
    field("What was going on? (optional)", textArea(m, "note", { rows: 2, maxlength: 500 })), err],
    [{ label: "Cancel", value: false }, { label: "Save", kind: "primary", value: () => {
      const t = m.when ? new Date(m.when).getTime() : Date.now();
      if (!Number.isFinite(t) || t > Date.now() + 5 * MIN) { err.textContent = "Enter a valid time that isn't in the future."; return undefined; }
      if (!Number.isInteger(m.count) || m.count < 1 || m.count > 60) { err.textContent = "Enter a whole number from 1 to 60."; return undefined; }
      putRecord("smokingLog", { id: uid(), ts: t, count: m.count, note: m.note }); toast("Logged. Your progress so far is kept."); return true;
    } }]);
}
