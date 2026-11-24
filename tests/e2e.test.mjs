// Browser tests (real Chrome via Playwright) against dist/index.html. Run: node tests/e2e.test.mjs
import { createRequire } from "node:module"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/npm-tools/node_modules/playwright");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL = "file://" + path.join(root, "dist/index.html");
const MOCK = fs.readFileSync(path.join(root, "tests/mock-claude.js"), "utf8");
const SHOTS = path.join(root, "tests/screens"); fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
let pass = 0, fail = 0; const out = [];
const ONLY = process.argv[2];
async function test(name, fn) { if (ONLY && !name.includes(ONLY)) return; const t0 = Date.now(); try { await fn(); pass++; out.push("PASS " + name); console.log("PASS", name, Date.now() - t0 + "ms"); } catch (e) { fail++; const m = "FAIL " + name + " :: " + (e && e.message || e).split("\n").slice(0, 4).join(" | "); out.push(m); console.log(m); } }
function ok(c, m) { if (!c) throw new Error(m || "assertion failed"); }

async function newPage({ claude = null, ls = null, viewport = { width: 1280, height: 900 }, ctx = null } = {}) {
  const context = ctx || await browser.newContext({ viewport, reducedMotion: "reduce" });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await context.newPage(); page.setDefaultTimeout(4000);
  page.errors = [];
  page.on("pageerror", e => page.errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/fonts|ERR_FAILED|net::/.test(m.text())) page.errors.push(m.text()); });
  await page.addInitScript(({ MOCK, claude, ls }) => {
    if (ls && !sessionStorage.getItem("__seeded")) { localStorage.clear(); for (const k in ls) localStorage.setItem(k, ls[k]); sessionStorage.setItem("__seeded", "1"); }
    if (claude) {
      eval(MOCK);
      // cloud persisted in sessionStorage so it survives reloads within a test
      const saved = JSON.parse(sessionStorage.getItem("__cloud") || "[]");
      const docs = new Map(saved);
      const origSet = Map.prototype.set;
      docs.set = function (k, v) { const r = origSet.call(this, k, v); sessionStorage.setItem("__cloud", JSON.stringify([...this.entries()])); return r; };
      window.claude = window.__makeMockClaude(Object.assign({ docs }, claude));
    }
  }, { MOCK, claude, ls });
  await page.goto(URL);
  await page.waitForSelector("#view h1");
  return page;
}
async function setRange(page, idx, val) { await page.locator("input[type=range]").nth(idx).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, String(val)); }
const DEF_B = { smoking: ["smoking", "Quit smoking", "🚬"], procrastination: ["procrastination", "Procrastination", "⏳"], gym: ["exercise", "Gym", "🏋️"] };
function seedBehaviours() { const o = {}; for (const id in DEF_B) o[id] = { id, module: DEF_B[id][0], name: DEF_B[id][1], emoji: DEF_B[id][2], alternatives: ["Ride it out"], updatedAt: 10, createdAt: 10 }; return o; }
const noErrors = (page) => ok(!page.errors.length, "page errors: " + page.errors.join(" || "));
const text = (page) => page.locator("#view").innerText();

function seedExperiments(n) {
  const exps = {}; const now = Date.now();
  const trig = ["Coffee", "Stress", "After eating", "Work break"], alts = ["Ride it out", "Walk outside", "Use NRT gum"];
  for (let i = 0; i < n; i++) {
    const t = now - (n - i) * 86400000 * 1.3 + (i % 5) * 3600000 * 3;
    const b = ["smoking", "procrastination", "gym"][i % 3], mod = { smoking: "smoking", procrastination: "procrastination", gym: "exercise" }[b];
    exps["x" + i] = { id: "x" + i, behaviourId: b, module: mod, status: "completed", startedAt: t, completedAt: t + 1800000, updatedAt: t + 1800000,
      trigger: trig[i % 4], emotion: ["Stressed", "Bored", "Tired"][i % 3], urge: Math.max(1, 9 - Math.floor(i / 6)), expectedDiscomfort: 8 + (i % 3 === 0 ? 1 : 0), actualDiscomfort: 4 + (i % 4),
      expectedDurationMin: 45, actualDurationMin: 10 + i % 10, alternative: alts[i % 3], outcome: ["completed", "completed", "partial", "not_completed"][i % 4], beliefConfidence: 30 + i * 2, learned: "Lesson number " + i,
      moduleData: mod === "smoking" ? { cravingPassed: i % 4 !== 3, cigarettesAvoided: i % 4 !== 3 ? 1 : undefined } : {} };
  }
  return exps;
}

await test("empty database: all 8 sections render without errors (desktop)", async () => {
  const page = await newPage();
  for (const r of ["home", "practice", "insights", "journal", "analytics", "library", "goals", "prefs"]) {
    await page.click(`.sidebar [data-route=${r}]`); await page.waitForTimeout(120);
    const t = await text(page); ok(!/Something went wrong/.test(t), r + " crashed: " + t.slice(0, 200));
  }
  await page.click(".sidebar [data-route=home]");
  ok(/Run your first experiment/.test(await text(page)), "empty-state recommendation");
  ok(/On this device/.test(await page.locator("#sync-side").innerText()), "local sync mode");
  await page.screenshot({ path: SHOTS + "/01-home-empty.png", fullPage: true });
  noErrors(page);
});

await test("wizard validates, supports multiple active experiments, survives reload", async () => {
  const page = await newPage();
  await page.click(".sidebar [data-route=practice]");
  await page.click("button:has-text('New experiment')");
  await page.click(".bcard:has-text('Quit smoking')");
  await page.fill("textarea >> nth=0", "At my desk after lunch");
  await page.click(".chip:has-text('Coffee')");
  await page.click(".chip:has-text('Stressed')");
  await page.click(".wizard-f button:has-text('Next')");
  await page.click(".wizard-f button:has-text('Next')"); // sliders untouched -> errors
  ok((await page.locator(".field-err").count()) >= 2, "validation errors shown");
  const ranges = page.locator("input[type=range]");
  await setRange(page, 0, 8); await setRange(page, 1, 9);
  await page.fill("input[type=number] >> nth=0", "60");
  await page.click(".wizard-f button:has-text('Next')");
  ok(/Step 4 of 4/.test(await text(page)), "on step 4");
  // draft survives reload
  await page.reload(); await page.waitForSelector("#view h1");
  ok(/unfinished experiment draft/.test(await text(page)) || /Step 4 of 4/.test(await text(page)), "draft kept after reload");
  if (/unfinished/.test(await text(page))) await page.click("text=Continue");
  await page.click("text=Start experiment"); // no alternative -> error
  ok(/Choose or describe the alternative/.test(await text(page)), "alternative required");
  await page.click(".chip:has-text('Ride the craving out')");
  await page.click("text=Start experiment");
  // second experiment
  await page.click("button:has-text('New experiment')");
  await page.click(".bcard:has-text('Procrastination')");
  await page.click(".wizard-f button:has-text('Next')");
  await setRange(page, 0, 6); await setRange(page, 1, 7);
  await page.click(".wizard-f button:has-text('Next')");
  await page.click(".chip >> nth=0");
  await page.click("text=Start experiment");
  ok(/Active experiments \(2\)/.test(await text(page)), "two active");
  await page.reload(); await page.waitForSelector("#view h1");
  await page.click(".sidebar [data-route=practice]");
  ok(/Active experiments \(2\)/.test(await text(page)), "two active after reload");
  ok((await page.locator(".countdown").count()) === 2, "countdowns shown");
  await page.screenshot({ path: SHOTS + "/02-practice-active.png", fullPage: true });
  noErrors(page);
});

await test("finish: partial result + smoking slip logged without resetting totals", async () => {
  const page = await newPage();
  await page.click(".sidebar [data-route=practice]");
  await page.click("button:has-text('New experiment')"); await page.click(".bcard:has-text('Quit smoking')"); await page.click(".wizard-f button:has-text('Next')");
  await setRange(page, 0, 7); await setRange(page, 1, 9); await page.click(".wizard-f button:has-text('Next')");
  await page.click(".chip >> nth=0"); await page.click("text=Start experiment");
  await page.click("text=Record result");
  await page.click("text=Save result");
  ok((await page.locator(".field-err").count()) >= 2, "outcome & actual required");
  await page.click(".seg-b:has-text('Partly')");
  await setRange(page, 0, 5);
  await page.click(".seg-b >> text='No'"); // craving did not pass
  await page.fill("textarea >> nth=2", "It passed faster than I thought");
  await page.click("text=Save result");
  await page.waitForSelector(".modal");
  const m = await page.locator(".modal").innerText();
  ok(/9, it was 5/.test(m) && /slip/.test(m), "result dialog: " + m.slice(0, 200));
  await page.screenshot({ path: SHOTS + "/03-result.png" });
  await page.click(".modal >> text=Done");
  await page.click(".sidebar [data-route=library]"); await page.click(".lib-card:has-text('Quit smoking')");
  const t = await text(page);
  ok(/Slips logged\s*1/.test(t), "slip counted");
  ok(/1 of 1|0 of 1/.test(t), "craving outcome counted");
  noErrors(page);
});

await test("v1 data in localStorage is migrated and kept", async () => {
  const v1 = { v: 1, updatedAt: Date.now() - 5000, problems: [{ id: "smoking", name: "Quit smoking", emoji: "🚬", old: "relief", action: "Do not smoke" }, { id: "zz1", name: "Nail biting", emoji: "💅", old: "", action: "Fidget toy" }],
    sessions: [{ id: "a1", problem: "smoking", trigger: "coffee", before: 8, predicted: 9, after: 4, held: "yes", note: "Fine", startedAt: Date.now() - 86400000, doneAt: Date.now() - 86000000 }, { id: "a2", problem: "zz1", trigger: "", before: 5, predicted: 6, after: null, held: null, note: "", startedAt: Date.now() - 3600000, doneAt: null }] };
  const page = await newPage({ ls: { rewrite_tracker_state: JSON.stringify(v1) } });
  ok(/upgraded/.test(await page.locator("#banners").innerText()), "migration banner");
  ok(/1\s*\n?\s*in the last 30 days|Completed experiments\s*1/.test(await text(page)), "completed count");
  ok(await page.evaluate(() => !!localStorage.getItem("rewrite_tracker_state")), "v1 copy kept");
  await page.click(".sidebar [data-route=practice]");
  ok(/Nail biting/.test(await text(page)), "custom problem + active session migrated");
  noErrors(page);
});

await test("corrupt stored data: recovered with notice, app usable", async () => {
  const page = await newPage({ ls: { rt2_state: "{{{not json" } });
  ok(/damaged/.test(await page.locator("#banners").innerText()), "corruption notice");
  ok(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("rt2_corrupt_"))), "corrupt copy preserved");
  noErrors(page);
});

await test("analytics, insights, journal with 36 records; filters; deleted behaviour", async () => {
  const st = { schemaVersion: 2, settings: { id: "main", windowEnabled: true, windowHours: 5, currency: "€", packPrice: 9, cigsPerPack: 20, aiEnabled: true, updatedAt: 5 }, behaviours: seedBehaviours(), experiments: seedExperiments(36), journal: {}, goals: {}, smokingLog: {}, meta: { createdAt: Date.now() } };
  const page = await newPage({ ls: { rt2_state: JSON.stringify(st) } });
  ok(/Completed experiments\s*36/.test(await text(page)), "36 completed");
  await page.screenshot({ path: SHOTS + "/04-home-data.png", fullPage: true });
  await page.click(".sidebar [data-route=analytics]");
  await page.selectOption(".filters select >> nth=1", "all");
  ok((await page.locator("svg.chart").count()) >= 6, "charts rendered");
  await page.screenshot({ path: SHOTS + "/05-analytics.png", fullPage: true });
  // hover tooltip
  const box = await page.locator("svg.chart >> nth=0").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(100);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector(".tip")).opacity === "1"), "tooltip visible");
  await page.selectOption(".filters select >> nth=2", "not_completed");
  ok(/9 completed experiments in this selection/.test(await text(page)), "outcome filter: " + (await text(page)).slice(0, 200));
  await page.selectOption(".filters select >> nth=2", "all");
  await page.selectOption(".filters select >> nth=0", "gym");
  ok(/12 completed experiments/.test(await text(page)), "behaviour filter");
  await page.selectOption(".filters select >> nth=0", "all");
  await page.click(".sidebar [data-route=insights]");
  const it = await text(page);
  ok(/Observed/.test(it) && /Hypothesis/.test(it), "insights labelled");
  ok(/claude\.ai version/.test(it), "no AI without runtime");
  await page.screenshot({ path: SHOTS + "/06-insights.png", fullPage: true });
  await page.click(".sidebar [data-route=journal]");
  await page.fill("input[type=search]", "Lesson number 7"); await page.waitForTimeout(400);
  ok(/1 entry of 36/.test(await text(page)), "search works: " + (await text(page)).slice(0, 300));
  await page.fill("input[type=search]", ""); await page.waitForTimeout(400);
  // delete behaviour "gym"
  await page.click(".sidebar [data-route=library]"); await page.click(".lib-card:has-text('Gym')");
  await page.click("button:has-text('Delete')"); await page.click(".modal .btn.danger");
  await page.click(".sidebar [data-route=journal]");
  ok(/Deleted behaviour/.test(await text(page)), "orphaned experiments still listed");
  await page.click(".sidebar [data-route=analytics]");
  ok(!/Something went wrong/.test(await text(page)), "analytics ok after delete");
  await page.click(".sidebar [data-route=home]");
  ok(!/Something went wrong/.test(await text(page)), "home ok after delete");
  noErrors(page);
});

await test("journal note + weekly reflection + goal; edit experiment", async () => {
  const st = { schemaVersion: 2, behaviours: seedBehaviours(), experiments: seedExperiments(8), journal: {}, goals: {}, smokingLog: {} };
  const page = await newPage({ ls: { rt2_state: JSON.stringify(st) } });
  await page.click(".sidebar [data-route=journal]");
  await page.click("text=New entry"); await page.click(".modal >> text=Save");
  ok(/Write a title or some text/.test(await page.locator(".modal").innerText()), "note validation");
  await page.fill(".modal input.input >> nth=0", "Evening insight"); await page.fill(".modal textarea", "Cravings peak at 8pm");
  await page.fill(".modal .tag-new", "evening"); await page.keyboard.press("Enter");
  await page.click(".modal >> text=Save");
  ok(/Evening insight/.test(await text(page)), "note saved");
  await page.click("#weekly summary"); await page.click("text=Write reflection");
  ok(/Your data:/.test(await page.locator(".modal").innerText()), "weekly hints");
  await page.fill(".modal textarea >> nth=0", "I overestimated the craving length");
  await page.click(".modal >> text=Save reflection");
  ok(/Weekly reflection/.test(await text(page)), "weekly saved");
  await page.click(".jrow:has-text('Experiment') >> nth=0");
  await page.fill(".modal textarea >> nth=2", "Edited lesson");
  await page.click(".modal .btn.primary");
  ok(/Edited lesson/.test(await text(page)), "experiment edited");
  await page.click(".sidebar [data-route=goals]"); await page.click("button:has-text('New goal')");
  await page.selectOption(".modal select >> nth=0", "urge_avg_7"); await page.fill(".modal input[type=number]", "50"); await page.click(".modal >> text=Save goal");
  ok(/between 0 and 10/.test(await page.locator(".modal").innerText()), "goal target validated");
  await page.fill(".modal input[type=number]", "5"); await page.click(".modal >> text=Save goal");
  ok(/Average starting urge/.test(await text(page)), "goal shown");
  await page.screenshot({ path: SHOTS + "/07-goals.png", fullPage: true });
  noErrors(page);
});

await test("import: rejects bad JSON, merges valid export, reset needs typed confirmation", async () => {
  const page = await newPage();
  await page.click(".sidebar [data-route=prefs]");
  await page.click("text=…or paste JSON"); await page.fill("textarea[aria-label='Paste JSON to import']", "{bad"); await page.click("text=Check pasted data");
  ok(/not valid JSON/.test(await text(page)), "bad json rejected");
  await page.fill("textarea[aria-label='Paste JSON to import']", '{"foo":1}'); await page.click("text=Check pasted data");
  ok(/doesn't look like Rewrite Tracker/.test(await text(page)), "wrong shape rejected");
  const exp = { app: "rewrite-tracker", format: 2, data: { schemaVersion: 2, experiments: Object.values(seedExperiments(5)), behaviours: [], journal: [], goals: [], smokingLog: [] } };
  await page.fill("textarea[aria-label='Paste JSON to import']", JSON.stringify(exp)); await page.click("text=Check pasted data");
  ok(/Ready to import: 5 experiments/.test(await text(page)), "valid preview");
  await page.click("text=Merge with my data");
  await page.click("text=Merge with my data").catch(() => { });
  ok(/5 experiments/.test(await text(page)), "imported once, no duplicates");
  ok(/Before import/.test(await text(page)), "backup made before import");
  await page.click("text=Reset all data"); await page.click(".modal .btn.danger");
  ok(/type RESET exactly/i.test(await page.locator(".modal").innerText()), "typed confirmation enforced");
  await page.fill(".modal input", "RESET"); await page.click(".modal .btn.danger");
  ok(/0 experiments/.test(await text(page)), "reset done");
  noErrors(page);
});

await test("cloud sync + AI coach + downloads with runtime present", async () => {
  const page = await newPage({ claude: {} });
  await page.waitForTimeout(300);
  ok(/Synced/.test(await page.locator("#sync-side").innerText()), "synced: " + await page.locator("#sync-side").innerText());
  await page.click(".sidebar [data-route=practice]");
  await page.click("button:has-text('New experiment')"); await page.click(".bcard:has-text('Gym')"); await page.click(".wizard-f button:has-text('Next')");
  await setRange(page, 0, 6); await setRange(page, 1, 8); await page.click(".wizard-f button:has-text('Next')");
  await page.click(".chip >> nth=0"); await page.click("text=Already done: record result");
  await page.click(".seg-b:has-text('Did it')"); await setRange(page, 0, 3); await page.click("text=Save result");
  await page.click(".modal >> text=Ask the coach about this");
  await page.waitForSelector(".bubble.assistant");
  const c = await page.locator(".chat").innerText();
  ok(/Hypothesis: keep going/.test(c) && /What surprised you/.test(c), "coach answer rendered");
  const prompt = await page.evaluate(() => JSON.stringify(window.claude.__sampleCalls[0]));
  ok(/Use ONLY the data/.test(prompt) && /focus_experiment/.test(prompt), "grounded prompt with focus");
  await page.screenshot({ path: SHOTS + "/08-coach.png", fullPage: true });
  await page.waitForTimeout(1200);
  const cloudKeys = await page.evaluate(() => [...window.claude.__docs.keys()].filter(k => k.includes("experiments~")).length);
  ok(cloudKeys === 1, "experiment pushed to cloud once: " + cloudKeys);
  await page.click(".sidebar [data-route=prefs]"); await page.click("text=Download JSON");
  ok(await page.evaluate(() => window.claude.__saved.length === 1 && window.claude.__saved[0].filename.endsWith(".json")), "download offered");
  // second device sees it
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cloud = await page.evaluate(() => sessionStorage.getItem("__cloud"));
  await ctx2.addInitScript(c => { sessionStorage.setItem("__cloud", c); }, cloud);
  const p2 = await newPage({ claude: {}, ctx: ctx2 });
  await p2.waitForTimeout(400);
  ok(/Completed experiments\s*1/.test(await text(p2)), "second device pulled data");
  noErrors(page); noErrors(p2);
});

await test("offline cloud: changes saved locally and marked pending", async () => {
  const page = await newPage({ claude: { offline: true } });
  await page.waitForTimeout(200);
  await page.click(".sidebar [data-route=journal]"); await page.click("text=New entry");
  await page.fill(".modal input.input >> nth=0", "Offline note"); await page.click(".modal >> text=Save");
  await page.reload(); await page.waitForSelector("#view h1");
  await page.click(".sidebar [data-route=journal]");
  ok(/Offline note/.test(await text(page)), "kept after reload while offline");
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem("rt2_outbox")).some(k => k.startsWith("journal~"))), "queued in outbox");
  noErrors(page);
});

await test("mobile layout: bottom nav, More menu, no horizontal overflow", async () => {
  const st = { schemaVersion: 2, behaviours: seedBehaviours(), experiments: seedExperiments(20), journal: {}, goals: {}, smokingLog: {} };
  const page = await newPage({ viewport: { width: 390, height: 844 }, ls: { rt2_state: JSON.stringify(st) } });
  ok(await page.locator(".tabbar").isVisible(), "tab bar visible");
  for (const r of ["home", "practice", "insights", "journal"]) {
    await page.click(`.tabbar [data-route=${r}]`); await page.waitForTimeout(100);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 1, r + " overflows by " + over);
  }
  await page.click("#more-btn"); await page.click("#more [data-route=analytics]");
  ok(/Analytics/.test(await page.locator("#view h1").innerText()), "more menu nav");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(over <= 1, "analytics overflow " + over);
  await page.screenshot({ path: SHOTS + "/09-mobile-analytics.png", fullPage: true });
  await page.click(".tabbar [data-route=home]"); await page.screenshot({ path: SHOTS + "/10-mobile-home.png", fullPage: true });
  await page.click(".tabbar [data-route=practice]"); await page.click("button:has-text('New experiment')"); await page.click(".bcard >> nth=0");
  await page.screenshot({ path: SHOTS + "/11-mobile-wizard.png", fullPage: true });
  noErrors(page);
});

await browser.close();
console.log(out.join("\n")); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
