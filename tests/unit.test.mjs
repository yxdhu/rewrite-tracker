// Unit tests for the core engine. Run: node tests/unit.test.mjs
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = ["util", "modules", "schema", "analytics", "insights", "coach", "store", "sync"].map(f => fs.readFileSync(path.join(root, "src/core", f + ".js"), "utf8")).join("\n");
const MOCK = fs.readFileSync(path.join(root, "tests/mock-claude.js"), "utf8");
const EXPORTS = "globalThis.T = { normalizeState, migrateV1, mergeStates, parseImport, exportPayload, seededState, emptyState, cleanExperiment, finished, summarize, urgeTrend, triggerStats, timeOfDayStats, alternativeStats, periodSeries, smokingStats, generateInsights, achievements, recommendNext, weeklyHints, buildCoachMessages, buildCoachContext, storeLoad, putRecord, removeRecord, putSettings, bulkApply, resetAll, listBackups, restoreBackup, startSync, flushOutbox, onRemoteSnapshot, get S(){return S}, outbox, syncState, live, uid, LS, readLocalState };";

function makeEnv(lsInit, claudeObj) {
  const store = new Map(Object.entries(lsInit || {}));
  const localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = { console, setTimeout, clearTimeout, Date, Math, JSON, localStorage, window: { addEventListener() { } }, Promise };
  if (claudeObj !== undefined) ctx.claude = claudeObj;
  vm.createContext(ctx); vm.runInContext(MOCK + "\n" + CORE + "\n" + EXPORTS, ctx);
  return { T: ctx.T, ls: store, ctx };
}
let pass = 0, fail = 0; const results = [];
async function test(name, fn) { try { await fn(); pass++; results.push("PASS " + name); } catch (e) { fail++; results.push("FAIL " + name + " :: " + (e && e.stack || e)); } }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || "") + " expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
function ok(c, m) { if (!c) throw new Error(m || "assertion failed"); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const V1 = {
  v: 1, updatedAt: Date.parse("2026-11-23T23:00:00Z"),
  problems: [{ id: "smoking", name: "Quit smoking", emoji: "🚬", old: "A cigarette = relief", action: "Do not smoke" }, { id: "abc123", name: "My custom", emoji: "⭐", old: "", action: "" }],
  sessions: [
    { id: "s1", problem: "smoking", trigger: "coffee", before: 8, predicted: 9, after: 5, held: "yes", note: "passed fast", startedAt: Date.parse("2026-11-20T09:00:00Z"), doneAt: Date.parse("2026-11-20T09:20:00Z"), inWindow: true },
    { id: "s2", problem: "abc123", trigger: "", before: 4, predicted: 6, after: null, held: null, note: "", startedAt: Date.parse("2026-11-23T10:00:00Z"), doneAt: null },
    { id: "s3", problem: "gone", trigger: "x", before: 3, predicted: 3, after: 3, held: "partly", note: "", startedAt: Date.parse("2026-11-21T10:00:00Z"), doneAt: Date.parse("2026-11-21T11:00:00Z") },
    { garbage: true }
  ]
};

function mkExp(T, i, o) {
  const t = Date.parse("2026-10-01T08:00:00Z") + i * 86400000;
  return T.cleanExperiment(Object.assign({ id: "e" + i, behaviourId: "smoking", module: "smoking", status: "completed", startedAt: t, completedAt: t + 1800000, updatedAt: t + 1800000, urge: 8, expectedDiscomfort: 9, actualDiscomfort: 5, outcome: "completed", trigger: "Coffee", alternative: "Ride it out" }, o || {}));
}

await test("v1 migration maps fields, keeps ids, skips garbage", () => {
  const { T } = makeEnv();
  const s = T.migrateV1(V1);
  eq(Object.keys(s.behaviours).sort(), ["abc123", "smoking"]);
  eq(s.behaviours.smoking.module, "smoking"); eq(s.behaviours.abc123.module, "general");
  eq(s.behaviours.smoking.alternatives, ["Do not smoke"]);
  const e1 = s.experiments.s1;
  eq([e1.status, e1.urge, e1.expectedDiscomfort, e1.actualDiscomfort, e1.outcome, e1.learned, e1.trigger], ["completed", 8, 9, 5, "completed", "passed fast", "coffee"]);
  eq(s.experiments.s2.status, "active"); eq(s.experiments.s2.actualDiscomfort, null);
  eq(s.experiments.s3.outcome, "partial"); eq(s.experiments.s3.behaviourId, "gone");
  eq(Object.keys(s.experiments).length, 3);
});

await test("normalizeState survives corrupt / wrong-typed data", () => {
  const { T } = makeEnv();
  const r = T.normalizeState({ schemaVersion: 2, settings: { windowHours: "abc", currency: 5 }, experiments: "nope", behaviours: [{ id: "ok1", name: "A", module: "weird" }, { id: "bad id!" }, null], journal: { j1: { id: "j1", body: "hi", createdAt: "x" } } });
  eq(r.state.settings.windowHours, 5); eq(Object.keys(r.state.behaviours), ["ok1"]); eq(r.state.behaviours.ok1.module, "general");
  ok(r.issues.some(i => i.includes("experiments")), "issue for experiments"); ok(r.issues.some(i => i.includes("behaviours")), "issue for behaviours");
  eq(T.normalizeState(null).state.schemaVersion, 2); eq(T.normalizeState([1, 2]).issues.length, 1);
});

await test("clean experiment clamps values and rejects missing startedAt", () => {
  const { T } = makeEnv();
  const e = T.cleanExperiment({ id: "x1", startedAt: Date.now(), urge: 15, expectedDiscomfort: -3, beliefConfidence: 400, outcome: "maybe", status: "weird" });
  eq([e.urge, e.expectedDiscomfort, e.beliefConfidence, e.outcome, e.status], [10, 0, 100, null, "active"]);
  eq(T.cleanExperiment({ id: "x2" }), null);
});

await test("merge is last-writer-wins per record, tombstones respected", () => {
  const { T } = makeEnv();
  const a = T.emptyState(), b = T.emptyState();
  a.behaviours.x = { id: "x", name: "A-new", module: "general", updatedAt: 200 };
  b.behaviours.x = { id: "x", name: "B-old", module: "general", updatedAt: 100 };
  b.behaviours.y = { id: "y", name: "only in B", updatedAt: 50 };
  a.behaviours.z = { id: "z", deleted: true, updatedAt: 300 }; b.behaviours.z = { id: "z", name: "z", updatedAt: 299 };
  const m = T.mergeStates(a, b);
  eq(m.behaviours.x.name, "A-new"); eq(m.behaviours.y.name, "only in B"); eq(m.behaviours.z.deleted, true);
  const m2 = T.mergeStates(b, a); eq(m2.behaviours.x.name, "A-new");
});

await test("import: rejects bad JSON, unknown shape, empty; accepts export + v1", () => {
  const { T } = makeEnv();
  eq(T.parseImport("{oops").ok, false); eq(T.parseImport("[]").ok, false); eq(T.parseImport('{"hello":1}').ok, false);
  eq(T.parseImport('{"schemaVersion":2,"experiments":[]}').ok, false);
  const v1 = T.parseImport(JSON.stringify(V1)); eq(v1.ok, true); eq(v1.counts.experiments, 3);
  const s = T.migrateV1(V1); const exp = JSON.stringify(T.exportPayload(s));
  const r = T.parseImport(exp); eq(r.ok, true); eq(r.counts.behaviours, 2);
});

await test("analytics: summary, accuracy, trend, triggers, time of day", () => {
  const { T } = makeEnv();
  const list = [];
  for (let i = 0; i < 9; i++) list.push(mkExp(T, i, { urge: 9 - i * 0.75 >= 0 ? Math.round(9 - i * 0.75) : 0, actualDiscomfort: i % 2 ? 5 : 8, outcome: i === 2 ? "not_completed" : i === 3 ? "partial" : "completed" }));
  const s = T.summarize(list);
  eq(s.n, 9); eq(s.counts, { completed: 7, partial: 1, not_completed: 1, unrecorded: 0 });
  ok(Math.abs(s.followThrough - 7.5 / 9) < 1e-9, "follow through");
  eq(s.accuracy, 5 / 9); // gaps: 1 (actual 8) ok x5; 4 (actual 5) x4
  const t = T.urgeTrend(list); eq(t.status, "improving"); ok(t.delta >= 1);
  eq(T.urgeTrend(list.slice(0, 3)).status, "insufficient");
  eq(T.triggerStats(list)[0].n, 9);
  const tod = T.timeOfDayStats(list); eq(tod.reduce((a, b) => a + b.n, 0), 9);
});

await test("insights: no fabricated insights with little data; real ones with enough", () => {
  const { T } = makeEnv();
  const st = T.seededState(); const few = [mkExp(T, 1), mkExp(T, 2)];
  const r = T.generateInsights(st, few); eq(r.length, 1); eq(r[0].kind, "info");
  const many = []; for (let i = 0; i < 8; i++) many.push(mkExp(T, i, { expectedDiscomfort: 9, actualDiscomfort: 5 }));
  const r2 = T.generateInsights(st, many);
  ok(r2.some(x => x.kind === "observation" && /predicted a discomfort of 9/.test(x.text)), "overestimate observation");
  ok(r2.some(x => x.kind === "hypothesis"), "has hypothesis");
});

await test("recommendation + achievements + weekly hints on empty and filled data", () => {
  const { T } = makeEnv();
  const st = T.seededState();
  eq(T.recommendNext(st).action.type, "start");
  eq(T.achievements(st).length, 0);
  for (let i = 0; i < 10; i++) { const e = mkExp(T, i, { actualDiscomfort: i === 0 ? 4 : 6, expectedDiscomfort: i === 0 ? 9 : 7 }); st.experiments[e.id] = e; }
  const a = T.achievements(st).map(x => x.key);
  ok(a.includes("first") && a.includes("ten") && a.includes("busted"), "achievements " + a);
  const h = T.weeklyHints(st, Date.parse("2026-10-05T00:00:00"));
  ok(typeof h.overestimated === "string" && typeof h.next === "string");
});

await test("smoking stats: avoided, money, slips do not reset totals", () => {
  const { T } = makeEnv();
  const st = T.seededState(); st.settings.packPrice = 9; st.settings.cigsPerPack = 20;
  const e1 = mkExp(T, 1, { moduleData: { cravingPassed: true, cigarettesAvoided: 2 }, actualDurationMin: 12 });
  const e2 = mkExp(T, 2, { moduleData: { cravingPassed: false } });
  st.experiments[e1.id] = e1; st.experiments[e2.id] = e2;
  const t0 = Date.parse("2026-11-01T10:00:00Z");
  st.smokingLog.a = { id: "a", ts: t0, count: 1, updatedAt: t0 }; st.smokingLog.b = { id: "b", ts: t0 + 3 * 86400000, count: 2, updatedAt: t0 };
  const s = T.smokingStats(st, t0 + 4 * 86400000);
  eq([s.cravings, s.passed, s.passRate, s.avoided, s.cigarettesLogged, s.slipCount], [2, 1, 0.5, 2, 3, 2]);
  ok(Math.abs(s.moneySaved - 0.9) < 1e-9, "money"); eq(s.longest, 3 * 86400000); eq(s.sinceLast, 86400000);
});

await test("coach prompt only contains real records and rules", () => {
  const { T } = makeEnv();
  const st = T.seededState(); const e = mkExp(T, 1, { learned: "it passed" }); st.experiments[e.id] = e;
  const msgs = T.buildCoachMessages(st, [], "hello", null);
  eq(msgs.length, 1); ok(msgs[0].content.includes("Use ONLY the data") && msgs[0].content.includes("it passed") && msgs[0].content.includes('"completedExperiments":1'));
  const msgs2 = T.buildCoachMessages(st, [{ role: "user", content: "q1" }, { role: "assistant", content: "a1" }], "q2");
  eq(msgs2.map(m => m.role), ["user", "assistant", "user"]);
});

await test("store: fresh load seeds defaults with ancient timestamps", () => {
  const { T } = makeEnv();
  T.storeLoad();
  eq(T.live(T.S.behaviours).length, 8); ok(T.S.behaviours.smoking.updatedAt < 100, "ancient");
});

await test("store: loads v1 from old localStorage key, keeps the original", () => {
  const raw = JSON.stringify(V1);
  const { T, ls } = makeEnv({ rewrite_tracker_state: raw });
  T.storeLoad();
  eq(T.live(T.S.experiments).length, 3); eq(ls.get("rewrite_tracker_state"), raw); ok(ls.get("rt2_state"));
});

await test("store: corrupt local data is kept aside and restored from backup", () => {
  const { T } = makeEnv();
  T.storeLoad(); const e = mkExp(T, 1); T.putRecord("experiments", e);
  const backups = T.ls ? null : null;
  const env1 = makeEnv(); env1.T.storeLoad(); env1.T.putRecord("experiments", mkExp(env1.T, 1));
  env1.T.bulkApply(env1.T.S, "merge"); // creates a backup
  const bk = env1.ls.get("rt2_backups");
  const env2 = makeEnv({ rt2_state: "{not json", rt2_backups: bk });
  env2.T.storeLoad();
  eq(env2.T.live(env2.T.S.experiments).length, 1);
  ok([...env2.ls.keys()].some(k => k.startsWith("rt2_corrupt_")), "corrupt copy kept");
  const env3 = makeEnv({ rt2_state: "garbage" }); env3.T.storeLoad(); eq(env3.T.live(env3.T.S.behaviours).length, 8);
});

await test("store: two tabs writing do not overwrite each other", () => {
  const { T, ls, ctx } = makeEnv();
  T.storeLoad();
  // simulate another tab writing directly to localStorage
  const other = JSON.parse(ls.get("rt2_state")); const e = mkExp(T, 5); other.experiments[e.id] = e; ls.set("rt2_state", JSON.stringify(other));
  T.putRecord("experiments", mkExp(T, 6));
  const final = JSON.parse(ls.get("rt2_state"));
  ok(final.experiments.e5 && final.experiments.e6, "both tabs' records kept");
});

await test("store: delete is a tombstone; bulk replace/merge/reset behave", () => {
  const { T } = makeEnv();
  T.storeLoad(); T.putRecord("experiments", mkExp(T, 1)); T.putRecord("experiments", mkExp(T, 2));
  T.removeRecord("experiments", "e1"); eq(T.S.experiments.e1.deleted, true);
  const inc = T.emptyState(); inc.experiments.e1 = mkExp(T, 1); inc.experiments.e9 = mkExp(T, 9);
  const r = T.bulkApply(inc, "merge"); eq(r.added, 2); eq(T.live(T.S.experiments).length, 3); // e1 restored, e9 added, e2 kept
  const r2 = T.bulkApply(inc, "replace"); ok(T.S.experiments.e2.deleted && !T.S.experiments.e9.deleted, "replace");
  T.resetAll(); eq(T.live(T.S.experiments).length, 0); eq(T.live(T.S.behaviours).length, 8);
  ok(T.listBackups().length >= 2, "backups made before destructive ops");
});

await test("sync: pushes local records, pulls newer remote, no duplicates", async () => {
  const cloud = new Map();
  const mock = (() => { const { ctx } = makeEnv(); return ctx.__makeMockClaude({ docs: cloud }); })();
  const A = makeEnv({}, mock); A.T.storeLoad(); A.T.putRecord("experiments", mkExp(A.T, 1));
  await A.T.startSync(); await sleep(50); await A.T.flushOutbox(); await sleep(20);
  ok([...cloud.keys()].some(k => k.endsWith("experiments~e1")), "pushed e1");
  eq(A.T.outbox.size, 0, "outbox empty");
  // device B with its own seeded defaults and an edited behaviour in the cloud
  const mockB = (() => { const { ctx } = makeEnv(); return ctx.__makeMockClaude({ docs: cloud }); })();
  const B = makeEnv({}, mockB); B.T.storeLoad();
  await B.T.startSync(); await sleep(50); await B.T.flushOutbox(); await sleep(20);
  eq(B.T.live(B.T.S.experiments).length, 1, "B pulled e1");
  eq(B.T.live(B.T.S.behaviours).length, 8, "no duplicate behaviours");
});

await test("sync: stale remote never overwrites newer local edit; offline queues", async () => {
  const cloud = new Map();
  const { ctx } = makeEnv(); const mock = ctx.__makeMockClaude({ docs: cloud });
  const A = makeEnv({}, mock); A.T.storeLoad();
  const old = mkExp(A.T, 1); cloud.set("data/users/user1/rt2/records/experiments~e1", { kind: "experiments", id: "e1", updatedAt: 5, deleted: false, data: Object.assign({}, old, { learned: "STALE" }) });
  A.T.putRecord("experiments", Object.assign({}, old, { learned: "fresh" }));
  await A.T.startSync(); await sleep(50); await A.T.flushOutbox(); await sleep(20);
  eq(A.T.S.experiments.e1.learned, "fresh"); eq(cloud.get("data/users/user1/rt2/records/experiments~e1").data.learned, "fresh");
  mock.__setOffline(true);
  A.T.putRecord("experiments", mkExp(A.T, 2)); await A.T.flushOutbox();
  ok(A.T.outbox.has("experiments~e2"), "queued while offline"); eq(A.T.syncState.mode, "offline");
  mock.__setOffline(false); await sleep(30); await A.T.flushOutbox(); await sleep(20);
  ok(!A.T.outbox.has("experiments~e2"), "flushed after reconnect");
});

await test("sync: migrates the first version's cloud copy once", async () => {
  const cloud = new Map(); cloud.set("data/users/user1/state", { json: JSON.stringify(V1), updatedAt: 1 });
  const { ctx } = makeEnv(); const mock = ctx.__makeMockClaude({ docs: cloud });
  const A = makeEnv({}, mock); A.T.storeLoad(); await A.T.startSync(); await sleep(50);
  eq(A.T.live(A.T.S.experiments).length, 3); ok(A.T.S.behaviours.abc123, "custom problem kept");
});

await test("sync: no claude runtime -> local mode", async () => {
  const A = makeEnv(); A.T.storeLoad(); await A.T.startSync(); eq(A.T.syncState.mode, "local");
});

console.log(results.join("\n")); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
