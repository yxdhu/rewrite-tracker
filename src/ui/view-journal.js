/* ===== ui/view-journal.js — searchable journal, experiment reviews, weekly reflection ===== */
const journalUI = { q: "", type: "all", tag: "", from: "", to: "", openWeekly: false, limit: 30 };

function journalItems() {
  const exps = live(S.experiments).filter(e => e.status === "completed").map(e => ({ kind: "experiment", id: e.id, at: e.startedAt, rec: e, tags: e.tags, highlight: e.highlight,
    text: [bName(e.behaviourId), e.situation, e.trigger, e.thought, e.emotion, e.expectedConsequence, e.alternative, e.actualConsequence, e.surprise, e.learned, e.notes, e.tags.join(" ")].join(" ") }));
  const notes = live(S.journal).map(j => ({ kind: j.type, id: j.id, at: j.createdAt, rec: j, tags: j.tags, highlight: j.highlight, text: [j.title, j.body, Object.values(j.answers).join(" "), j.tags.join(" ")].join(" ") }));
  return exps.concat(notes).sort((a, b) => b.at - a.at);
}

VIEWS.journal = function () {
  const all = journalItems();
  const from = fromInputDate(journalUI.from), to = fromInputDate(journalUI.to, true), q = norm(journalUI.q);
  const list = all.filter(it => (journalUI.type === "all" || (journalUI.type === "highlights" ? it.highlight : it.kind === journalUI.type)) && (!journalUI.tag || it.tags.includes(journalUI.tag)) && (!from || it.at >= from) && (!to || it.at <= to) && (!q || norm(it.text).includes(q)));
  const tags = [...new Set(all.flatMap(i => i.tags))].sort();
  const root = h("div", { class: "stack-lg" }, pageHeader("Journal", "Every completed experiment, your notes and weekly reflections.", h("button", { class: "btn primary", onclick: () => noteDialog() }, icon("plus"), "New entry")));
  root.append(weeklyCard());
  const search = h("input", { type: "search", class: "input", placeholder: "Search lessons, triggers, thoughts…", "aria-label": "Search the journal", value: journalUI.q, oninput: e => { journalUI.q = e.target.value; clearTimeout(journalUI.t); journalUI.t = setTimeout(() => { const pos = e.target.selectionStart; render(); const s = document.querySelector("#view input[type=search]"); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (x) { } } }, 250); } });
  root.append(h("div", { class: "filters", role: "group", "aria-label": "Journal filters" },
    h("label", { class: "grow" }, h("span", { class: "lbl" }, "Search"), search),
    h("label", {}, h("span", { class: "lbl" }, "Show"), selectBox([{ value: "all", label: "Everything" }, { value: "experiment", label: "Experiments" }, { value: "note", label: "Notes" }, { value: "weekly", label: "Weekly reflections" }, { value: "highlights", label: "Highlighted lessons" }], journalUI.type, v => { journalUI.type = v; render(); })),
    tags.length ? h("label", {}, h("span", { class: "lbl" }, "Tag"), selectBox([{ value: "", label: "Any tag" }].concat(tags.map(t => ({ value: t, label: "#" + t }))), journalUI.tag, v => { journalUI.tag = v; render(); })) : null,
    h("label", {}, h("span", { class: "lbl" }, "From"), h("input", { type: "date", class: "input", value: journalUI.from, onchange: e => { journalUI.from = e.target.value; render(); } })),
    h("label", {}, h("span", { class: "lbl" }, "To"), h("input", { type: "date", class: "input", value: journalUI.to, onchange: e => { journalUI.to = e.target.value; render(); } }))));
  root.append(h("p", { class: "muted sm", role: "status" }, `${plural(list.length, "entry", "entries")}` + (list.length !== all.length ? ` of ${all.length}` : "")));
  if (!list.length) root.append(emptyBox(all.length ? "Nothing matches" : "Your journal is empty", all.length ? "Try a different search or clear the filters." : "Completed experiments appear here automatically. You can also write a free entry."));
  root.append(h("div", { class: "list journal" }, list.slice(0, journalUI.limit).map(journalRow)));
  if (list.length > journalUI.limit) root.append(linkBtn(`Show more (${list.length - journalUI.limit} left)`, () => { journalUI.limit += 30; render(); }));
  if (journalUI.openWeekly) { journalUI.openWeekly = false; setTimeout(() => { const w = document.getElementById("weekly"); if (w) { w.open = true; w.scrollIntoView({ block: "start" }); } }, 0); }
  return root;
};

function journalRow(it) {
  if (it.kind === "experiment") {
    const e = it.rec;
    return h("button", { type: "button", class: "jrow", onclick: () => openExperiment(e.id) },
      h("div", { class: "jrow-h" }, h("span", { class: "jtype exp" }, "Experiment"), h("span", { class: "muted xs" }, fmtDateTime(e.startedAt)), e.highlight ? h("span", { class: "star", "aria-label": "Highlighted" }, "★") : null),
      h("b", {}, expTitle(e)), h("div", { class: "row wrap" }, outcomePill(e.outcome), gapText(e) ? h("span", { class: "muted sm" }, gapText(e)) : null),
      e.learned ? h("p", { class: "jrow-q" }, "Lesson: " + e.learned) : null, e.tags.length ? h("div", { class: "muted xs" }, e.tags.map(t => "#" + t).join(" ")) : null);
  }
  const j = it.rec;
  return h("button", { type: "button", class: "jrow", onclick: () => j.type === "weekly" ? weeklyDialog(j) : noteDialog(j) },
    h("div", { class: "jrow-h" }, h("span", { class: "jtype " + j.type }, j.type === "weekly" ? "Weekly reflection" : "Note"), h("span", { class: "muted xs" }, fmtDateTime(j.createdAt)), j.highlight ? h("span", { class: "star", "aria-label": "Highlighted" }, "★") : null),
    h("b", {}, j.title || (j.type === "weekly" ? "Week of " + fmtDate(fromInputDate(j.weekKey.slice(1)) || j.createdAt) : "Untitled")),
    h("p", { class: "jrow-q" }, (j.body || Object.values(j.answers).filter(Boolean).join(" · ")).slice(0, 220)),
    j.experimentId && S.experiments[j.experimentId] && !S.experiments[j.experimentId].deleted ? h("div", { class: "muted xs" }, "Linked to: " + expTitle(S.experiments[j.experimentId])) : null,
    j.tags.length ? h("div", { class: "muted xs" }, j.tags.map(t => "#" + t).join(" ")) : null);
}

/* ---------- experiment detail / edit ---------- */
function openExperiment(id) {
  const e = S.experiments[id]; if (!e || e.deleted) { toast("That experiment no longer exists.", "error"); return; }
  if (e.status === "active") { practiceUI.finishId = id; go("practice"); return; }
  const m = MODULES[e.module] || MODULES.general;
  const f = { outcome: e.outcome, actualDiscomfort: e.actualDiscomfort, actualDurationMin: e.actualDurationMin, actualConsequence: e.actualConsequence, surprise: e.surprise, learned: e.learned, notes: e.notes, beliefConfidence: e.beliefConfidence, tags: [...e.tags], highlight: e.highlight };
  const err = h("div", { class: "field-err", role: "alert" });
  const kv = (k, v) => v || v === 0 ? h("div", { class: "kv" }, h("span", {}, k), h("span", {}, String(v))) : null;
  const mdRows = [...m.startFields, ...m.endFields].filter(fl => e.moduleData[fl.key] != null).map(fl => kv(fl.label.replace(/\?$/, ""), fl.type === "bool" ? (e.moduleData[fl.key] ? "Yes" : "No") : fl.type === "money" ? fmtMoney(e.moduleData[fl.key], S.settings.currency) : e.moduleData[fl.key]));
  const actions = [
    { label: "Delete", kind: "danger-ghost", value: "delete" },
    UI.ai && S.settings.aiEnabled ? { label: "Ask coach", value: "coach" } : null,
    { label: "Save", kind: "primary", value: () => {
      if (!f.outcome) { err.textContent = "Choose an outcome."; return undefined; }
      if (f.actualDiscomfort == null) { err.textContent = "Rate the actual discomfort."; return undefined; }
      if (!validateNum(f.actualDurationMin, 0, 10080)) { err.textContent = "Duration must be 0–10080 minutes."; return undefined; }
      const cur = S.experiments[id]; if (!cur || cur.deleted) { err.textContent = "This experiment was deleted elsewhere."; return undefined; }
      putRecord("experiments", Object.assign({}, cur, f)); toast("Saved."); return true;
    } }].filter(Boolean);
  openModal(expTitle(e), [
    h("div", { class: "muted sm" }, fmtDateTime(e.startedAt) + (e.legacy ? " · imported from version 1" : "")),
    predVsActual(e), gapText(e) ? h("p", {}, "Result: " + gapText(e) + ".") : null,
    h("div", { class: "kvs" }, kv("Situation", e.situation), kv("Trigger", e.trigger), kv("Emotion", e.emotion), kv("Automatic thought", e.thought), kv("Expected duration (min)", e.expectedDurationMin), kv("Expected consequence", e.expectedConsequence), kv("Alternative", e.alternative), mdRows),
    h("h3", { class: "h3" }, "Result and reflection (editable)"),
    segmented("Outcome", OUTCOMES.map(o => ({ key: o.key, label: o.label })), f, "outcome"),
    rating("Actual discomfort", f, "actualDiscomfort", { color: C.actual }),
    field("Actual duration (minutes)", numberInput(f, "actualDurationMin", { min: 0, max: 10080 })),
    field("What actually happened", textArea(f, "actualConsequence", { rows: 2, maxlength: 500 })),
    field("What surprised you", textArea(f, "surprise", { rows: 2, maxlength: 1000 })),
    field("What you learned", textArea(f, "learned", { rows: 2, maxlength: 1000 })),
    field("Reflection notes", textArea(f, "notes", { rows: 3, maxlength: 4000 })),
    rating("Confidence in the new belief", f, "beliefConfidence", { max: 100, step: 5, unit: "%", color: C.violet }),
    field("Tags", tagsInput(f, "tags")),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: f.highlight, onchange: ev => f.highlight = ev.target.checked }), "Highlight this lesson"), err
  ], actions, { wide: true, focus: ".btn.primary" }).then(async v => {
    if (v === "delete") { if (await confirmDialog({ title: "Delete this experiment?", body: "It will be removed from your journal and analytics on all your devices. This can't be undone (except from a backup).", confirm: "Delete", danger: true })) { removeRecord("experiments", id); toast("Experiment deleted."); } }
    if (v === "coach") { coachUI.focusId = id; coachUI.pendingMode = "focus"; go("insights"); }
  });
}

/* ---------- free notes ---------- */
function noteDialog(j) {
  const n = j ? { title: j.title, body: j.body, tags: [...j.tags], highlight: j.highlight, experimentId: j.experimentId || "" } : { title: "", body: "", tags: [], highlight: false, experimentId: "" };
  const err = h("div", { class: "field-err", role: "alert" });
  const exps = finished(S).slice(-40).reverse();
  const actions = [{ label: "Cancel", value: false }, { label: "Save", kind: "primary", value: () => {
    if (!n.title.trim() && !n.body.trim()) { err.textContent = "Write a title or some text."; return undefined; }
    putRecord("journal", { id: j ? j.id : uid(), type: "note", title: n.title.trim(), body: n.body, tags: n.tags, highlight: n.highlight, experimentId: n.experimentId || null, createdAt: j ? j.createdAt : Date.now() }); toast("Saved to journal."); return true;
  } }];
  if (j) actions.unshift({ label: "Delete", kind: "danger-ghost", value: "delete" });
  openModal(j ? "Edit entry" : "New journal entry", [
    field("Title", textInput(n, "title", { maxlength: 160 })), field("Reflection", textArea(n, "body", { rows: 6, maxlength: 10000 })),
    field("Link to an experiment (optional)", selectBox([{ value: "", label: "No link" }].concat(exps.map(e => ({ value: e.id, label: fmtDate(e.startedAt) + " · " + expTitle(e) }))), n.experimentId, v => n.experimentId = v)),
    field("Tags", tagsInput(n, "tags")), h("label", { class: "check" }, h("input", { type: "checkbox", checked: n.highlight, onchange: e => n.highlight = e.target.checked }), "Highlight as an important lesson"), err
  ], actions, { wide: true }).then(async v => { if (v === "delete" && await confirmDialog({ title: "Delete this entry?", body: "This can't be undone (except from a backup).", confirm: "Delete", danger: true })) { removeRecord("journal", j.id); toast("Entry deleted."); } });
}

/* ---------- weekly reflection ---------- */
const WEEKLY_QS = [
  { key: "overestimated", q: "What did you consistently overestimate this week?" },
  { key: "easier", q: "Which behaviour became easier?" },
  { key: "trigger", q: "What situation repeatedly triggered the old pattern?" },
  { key: "next", q: "What will you experiment with next week?" }
];
function weeklyCard() {
  const wk = weekKey(Date.now()), existing = S.journal["wk" + wk.slice(1).replace(/-/g, "")];
  const hasIt = existing && !existing.deleted;
  const hints = weeklyHints(S, startOfWeek(Date.now()));
  return h("details", { class: "card weekly", id: "weekly" }, h("summary", {}, h("b", {}, "This week's reflection"), h("span", { class: "muted sm" }, hasIt ? " · saved, tap to edit" : ` · ${plural(hints.n, "experiment")} this week`)),
    h("p", { class: "muted sm" }, "Each question shows what your data says, so the reflection starts from evidence."),
    linkBtn(hasIt ? "Edit reflection" : "Write reflection", () => weeklyDialog(hasIt ? existing : null), "primary"));
}
function weeklyDialog(j) {
  const ws = j && j.weekKey ? fromInputDate(j.weekKey.slice(1)) : startOfWeek(Date.now());
  const wk = weekKey(ws), id = "wk" + wk.slice(1).replace(/-/g, "");
  const cur = S.journal[id];
  const a = Object.assign({ overestimated: "", easier: "", trigger: "", next: "" }, cur && !cur.deleted ? cur.answers : {});
  const extra = { body: cur && !cur.deleted ? cur.body : "" };
  const hints = weeklyHints(S, ws);
  openModal("Weekly reflection · week of " + fmtDate(ws), [
    ...WEEKLY_QS.map(x => field(x.q, textArea(a, x.key, { rows: 2, maxlength: 2000 }), { hint: "Your data: " + hints[x.key] })),
    field("Anything else?", textArea(extra, "body", { rows: 3, maxlength: 10000 }))
  ], [{ label: "Cancel", value: false }, { label: "Save reflection", kind: "primary", value: () => {
    putRecord("journal", { id, type: "weekly", weekKey: wk, title: "", body: extra.body, answers: a, tags: cur && !cur.deleted ? cur.tags : ["weekly"], highlight: cur ? !!cur.highlight : false, createdAt: cur && !cur.deleted ? cur.createdAt : Date.now() });
    toast("Weekly reflection saved."); return true; } }], { wide: true });
}
