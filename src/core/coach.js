/* ===== core/coach.js — AI coach: builds a grounded prompt from REAL records only ===== */
const COACH_RULES = `You are the behavioural coach inside "Rewrite Tracker", a personal app built on prediction-error learning: the user writes down what they predict will happen, tries an alternative behaviour, records what actually happened, and learns from the gap.

Rules:
- Use ONLY the data in <user_data>. Never invent experiments, numbers, dates, triggers or history. If the data is too thin to answer, say so plainly and suggest what to log.
- Label claims: say "Your data shows…" for things directly in the data, and "A possibility…" or "Hypothesis:" for interpretations.
- Be direct, warm and practical. No judgement about setbacks; treat them as useful data.
- Gently challenge distorted predictions (catastrophising, all-or-nothing, fortune-telling) and point out rationalisations or avoidance when the data suggests them.
- Do not present memory reconsolidation or any time window as proven. It is an experimental framework.
- No medical diagnosis. For smoking, mention that nicotine replacement, prescription medication from a doctor and counselling improve success when relevant. For trauma, serious relationship harm or crisis, recommend professional help.
- Format: short paragraphs and short bullet lists using "- ". No tables, no headings with #. Max ~250 words unless the user asks for more.
- End with one or two reflective questions when it fits.`;

const COACH_MODES = {
  review: { label: "Review my recent progress", prompt: "Review my recent experiments. Compare my most recent experiments with my earlier history. What is improving, what is stuck, and what should I focus on next?" },
  predictions: { label: "Challenge my predictions", prompt: "Look at how my predicted discomfort compares with what actually happened. Challenge any distorted predictions you can see in my data, quoting the relevant experiments." },
  setback: { label: "Review my last setback", prompt: "Look at my most recent unsuccessful or partial attempt. Review it without judgement: what happened, what the trigger was, and one concrete plan for next time." },
  next: { label: "Plan my next experiment", prompt: "Recommend the single most useful next experiment for me, based on my data. Give the behaviour, the situation, the alternative action, and what prediction I should write down." },
  avoidance: { label: "Spot avoidance patterns", prompt: "Look for avoidance or rationalisation patterns in my data (behaviours I stopped testing, alternatives I never complete, triggers I keep giving in to). Be honest and specific." }
};

function compactExp(state, e) {
  const b = behaviourLabel(state, e.behaviourId);
  const o = { date: dayKey(e.startedAt) + " " + fmtTime(e.startedAt), behaviour: b.name, status: e.status };
  const put = (k, v) => { if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) o[k] = v; };
  put("situation", e.situation); put("trigger", e.trigger); put("thought", e.thought); put("emotion", e.emotion);
  put("urge", e.urge); put("expectedDiscomfort", e.expectedDiscomfort); put("expectedDurationMin", e.expectedDurationMin); put("expectedConsequence", e.expectedConsequence);
  put("alternative", e.alternative); put("outcome", e.outcome); put("actualDiscomfort", e.actualDiscomfort); put("actualDurationMin", e.actualDurationMin);
  put("actualConsequence", e.actualConsequence); put("surprise", e.surprise); put("learned", e.learned); put("beliefConfidence", e.beliefConfidence);
  if (Object.keys(e.moduleData || {}).length) o.extra = e.moduleData;
  return o;
}

function buildCoachContext(state, now) {
  now = now || Date.now();
  const fin = finished(state), act = activeExps(state);
  const s = summarize(fin);
  const ctx = {
    today: dayKey(now),
    totals: { completedExperiments: fin.length, activeExperiments: act.length, avgUrge: s.avgUrge, avgExpectedDiscomfort: s.avgExpected, avgActualDiscomfort: s.avgActual, avgPredictionGap: s.avgGap, predictionsWithin1Point: s.accuracy, followThroughRate: s.followThrough, outcomes: s.counts },
    behaviours: behaviourProgress(state, fin).filter(b => !b.missing).map(b => ({ name: b.name, experiments: b.n, urgeTrend: b.trend.status, urgeFirst: b.trend.first, urgeLast: b.trend.last, avgGap: b.summary.avgGap, followThrough: b.summary.followThrough })),
    topTriggers: triggerStats(fin).slice(0, 6).map(t => ({ trigger: t.label, n: t.n, avgUrge: t.avgUrge })),
    timeOfDay: timeOfDayStats(fin).filter(b => b.n).map(b => ({ period: b.label, n: b.n, avgUrge: b.avgUrge, followThrough: b.followThrough })),
    alternatives: alternativeStats(fin).slice(0, 8).map(a => ({ alternative: a.label, n: a.n, followThrough: a.followThrough, avgActual: a.avgActual })),
    recentExperiments: fin.slice(-25).map(e => compactExp(state, e)),
    activeExperiments: act.map(e => compactExp(state, e)),
    recentJournal: live(state.journal).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map(j => ({ date: dayKey(j.createdAt), type: j.type, title: j.title, text: (j.body || Object.values(j.answers).join(" | ")).slice(0, 400) }))
  };
  const sm = smokingStats(state, now);
  if (sm.hasSmokingBehaviour) ctx.smoking = { cravingsLogged: sm.cravings, cravingsPassedWithoutSmoking: sm.passed, passRate: sm.passRate, avgCravingMinutes: sm.avgCravingMin, cigarettesLoggedAsSmoked: sm.cigarettesLogged, hoursSinceLastLoggedCigarette: sm.sinceLast ? Math.round(sm.sinceLast / HOUR) : null };
  return JSON.stringify(ctx, (k, v) => typeof v === "number" ? Math.round(v * 100) / 100 : v);
}

function buildCoachMessages(state, history, userText, focusExp) {
  const data = buildCoachContext(state);
  const focus = focusExp ? `\n<focus_experiment>${JSON.stringify(compactExp(state, focusExp))}</focus_experiment>` : "";
  const header = `${COACH_RULES}\n\n<user_data>${data}</user_data>${focus}\n\n`;
  const msgs = history.slice(-10).map(m => ({ role: m.role, content: m.content }));
  if (!msgs.length) return [{ role: "user", content: header + userText }];
  msgs[0] = { role: "user", content: header + msgs[0].content };
  msgs.push({ role: "user", content: userText });
  return msgs;
}
