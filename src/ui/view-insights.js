/* ===== ui/view-insights.js — AI coach (Claude, via the page's sample capability) + local insights engine ===== */
const coachUI = { history: [], busy: false, input: "", error: null, focusId: null, pendingMode: null, filter: "all", ctrl: null };

VIEWS.insights = function () {
  const root = h("div", { class: "stack-lg" }, pageHeader("Insights & Coach", "Observed patterns from your own records, plus an AI coach that reads the same data."));
  root.append(coachCard());
  root.append(localInsightsCard());
  if (coachUI.pendingMode) { const m = coachUI.pendingMode; coachUI.pendingMode = null; setTimeout(() => runCoach(m), 0); }
  return root;
};

function coachCard() {
  const ai = UI.ai, enabled = S.settings.aiEnabled;
  if (!enabled) return card("AI coach", [h("p", { class: "muted" }, "The AI coach is turned off. The local insights engine below still works."), linkBtn("Turn on in Settings", () => go("prefs"))]);
  if (!ai) return card("AI coach", [h("p", { class: "muted" }, "The AI coach runs in the claude.ai version of this app, where Claude is available without any API key in the page. The local insights engine below works everywhere, offline included.")]);
  const fin = finished(S);
  const msgs = h("div", { class: "chat", "aria-live": "polite" }, coachUI.history.map(m => chatBubble(m)));
  if (coachUI.busy && coachUI.streaming != null) msgs.append(chatBubble({ role: "assistant", content: coachUI.streaming || "Thinking…" }, true));
  if (coachUI.error) msgs.append(h("div", { class: "banner warn" }, coachUI.error));
  const input = h("textarea", { class: "input", rows: 2, placeholder: "Ask about your data, a setback, or what to try next…", "aria-label": "Message to the coach", maxlength: 2000, oninput: e => coachUI.input = e.target.value,
    onkeydown: e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendCoach(); } } });
  input.value = coachUI.input;
  const focusExp = coachUI.focusId && S.experiments[coachUI.focusId];
  return card("AI coach", [
    h("p", { class: "muted sm" }, `Uses Claude. When you press a button, a summary of your records (${plural(fin.length, "completed experiment")}, triggers, outcomes, recent journal entries) is sent to Claude for this answer. The coach is instructed to use only that data and to label guesses as hypotheses.`),
    focusExp && !focusExp.deleted ? h("div", { class: "banner" }, h("span", {}, "Focused on: " + expTitle(focusExp) + " (" + fmtDate(focusExp.startedAt) + ")"), h("button", { class: "icon-btn", "aria-label": "Clear focus", onclick: () => { coachUI.focusId = null; render(); } }, icon("x"))) : null,
    h("div", { class: "chips" }, Object.entries(COACH_MODES).map(([k, m]) => h("button", { type: "button", class: "chip", disabled: coachUI.busy, onclick: () => runCoach(k) }, m.label))),
    fin.length < 2 ? h("p", { class: "muted sm" }, "Tip: the coach becomes useful after a few completed experiments. With little data it will tell you so instead of guessing.") : null,
    msgs,
    h("div", { class: "chat-in" }, input, h("div", { class: "row" },
      coachUI.busy ? linkBtn("Stop", () => { coachUI.ctrl && coachUI.ctrl.abort(); }) : h("button", { class: "btn primary", onclick: sendCoach }, "Send"),
      coachUI.history.length ? linkBtn("New conversation", () => { coachUI.history = []; coachUI.error = null; render(); }) : null)),
    h("p", { class: "muted xs" }, "AI can make mistakes. It is not a therapist or doctor.")
  ], { class: "coach" });
}
function chatBubble(m, streaming) {
  const el = h("div", { class: "bubble " + m.role + (streaming ? " streaming" : "") }, h("div", { class: "bubble-who" }, m.role === "user" ? "You" : "Coach"));
  // safe rendering: text nodes only, simple "- " bullets and paragraphs
  const body = h("div", { class: "bubble-b" });
  let ul = null;
  String(m.content).split("\n").forEach(line => {
    const t = line.trim(); if (!t) { ul = null; return; }
    if (/^[-•*] /.test(t)) { if (!ul) { ul = h("ul"); body.append(ul); } ul.append(h("li", {}, t.replace(/^[-•*] /, "").replace(/\*\*/g, ""))); }
    else { ul = null; body.append(h("p", {}, t.replace(/\*\*/g, "").replace(/^#+\s*/, ""))); }
  });
  el.append(body); return el;
}
function runCoach(mode) {
  if (mode === "focus") { const e = S.experiments[coachUI.focusId]; if (!e) return; coachUI.input = ""; return askCoach("Review this experiment with me: what does the gap between my prediction and the result tell me, and what should I try next time?", e); }
  askCoach(COACH_MODES[mode].prompt, coachUI.focusId ? S.experiments[coachUI.focusId] : null);
}
function sendCoach() { const t = (coachUI.input || "").trim(); if (!t || coachUI.busy) return; coachUI.input = ""; askCoach(t, coachUI.focusId ? S.experiments[coachUI.focusId] : null); }
async function askCoach(text, focusExp) {
  if (coachUI.busy || !UI.ai) return;
  const messages = buildCoachMessages(S, coachUI.history, text, focusExp && !focusExp.deleted ? focusExp : null);
  coachUI.history.push({ role: "user", content: text });
  coachUI.busy = true; coachUI.error = null; coachUI.streaming = ""; coachUI.ctrl = new AbortController();
  render();
  let last = 0;
  try {
    const res = await UI.ai(messages, { cache: false, modelTier: "default", signal: coachUI.ctrl.signal, onText: ({ text }) => { coachUI.streaming = text; if (Date.now() - last > 120) { last = Date.now(); paintStream(); } } });
    coachUI.history.push({ role: "assistant", content: res.text + (res.truncated ? "\n(Answer was cut short.)" : "") });
  } catch (e) {
    const code = e && e.code;
    if (e && e.text) coachUI.history.push({ role: "assistant", content: e.text + "\n(Interrupted.)" });
    coachUI.error = code === "rate_limited" ? "The coach is busy right now. Wait a minute and try again." : code === "not_granted" ? "Permission for the AI coach wasn't granted." : (e && e.name === "AbortError") || code === "aborted" ? "Stopped." : "The coach couldn't answer right now. Your data is unaffected.";
    if (code === "not_granted") UI.ai = null;
  } finally { coachUI.busy = false; coachUI.streaming = null; coachUI.ctrl = null; render(); const c = document.querySelector(".chat"); c && c.lastElementChild && c.lastElementChild.scrollIntoView({ block: "nearest" }); }
}
function paintStream() { const b = document.querySelector(".bubble.streaming"); if (!b) return; b.replaceWith(chatBubble({ role: "assistant", content: coachUI.streaming || "Thinking…" }, true)); }

function localInsightsCard() {
  const bs = live(S.behaviours);
  const fin = finished(S).filter(e => coachUI.filter === "all" || e.behaviourId === coachUI.filter);
  const ins = generateInsights(S, fin);
  const groups = { observation: [], hypothesis: [], info: [] };
  ins.forEach(i => (groups[i.kind] || groups.info).push(i));
  const item = i => h("li", { class: "ins " + (i.tone || "") }, h("span", { class: "ins-tag " + i.kind }, i.kind === "observation" ? "Observed" : i.kind === "hypothesis" ? "Hypothesis" : "Note"), h("div", {}, h("p", {}, i.text), i.evidence ? h("div", { class: "muted xs" }, "Evidence: " + i.evidence) : null));
  return card("Local insights engine", [
    h("p", { class: "muted sm" }, "Rule-based analysis that runs on your device. 'Observed' = directly in your data. 'Hypothesis' = a possible explanation to test, not a fact. Nothing is shown without enough data."),
    h("div", { class: "row" }, h("label", { class: "lbl inline", for: "ins-f" }, "Behaviour"), selectBox([{ value: "all", label: "All behaviours" }].concat(bs.map(b => ({ value: b.id, label: b.emoji + " " + b.name }))), coachUI.filter, v => { coachUI.filter = v; render(); }, { id: "ins-f" })),
    groups.observation.length ? h("h3", { class: "h3" }, "Observations") : null, groups.observation.length ? h("ul", { class: "ins-list" }, groups.observation.map(item)) : null,
    groups.hypothesis.length ? h("h3", { class: "h3" }, "Hypotheses to test") : null, groups.hypothesis.length ? h("ul", { class: "ins-list" }, groups.hypothesis.map(item)) : null,
    groups.info.length ? h("ul", { class: "ins-list" }, groups.info.map(item)) : null
  ]);
}
