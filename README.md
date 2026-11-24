# Rewrite Tracker v2

A personal behavioural-change app built on one loop: **prediction → experience → evidence → learning → behavioural change**.

There are two builds from the same source:

| | Web app (GitHub Pages, `docs/`) | claude.ai version (`dist/`) |
|---|---|---|
| Works offline, can be installed on your home screen | ✓ | – |
| Data stored | on the device (localStorage) | on the device, plus synced to private cloud storage |
| AI coach | – (local insights engine only) | ✓ (Claude, no API key in the page) |
| Export | browser download | Claude download prompt |

The two versions keep their data separately. To move data between them, use **Settings & Data → Export**, then **Import** on the other version.

**Install on iPhone:** open the Pages link in Safari → Share → *Add to Home Screen*.
**Install on Android or desktop Chrome:** open the link → menu → *Install app*.

On iPhone, data in a home-screen app is kept long-term. If you only use it in a normal Safari tab and don't open it for weeks, Safari may clear it, so export now and then.

## 1. Audit of v1: what was wrong and what was kept

| Problem in v1 | Fix in v2 |
|---|---|
| Sync replaced the whole state with whichever copy had the newer timestamp. Two devices could wipe each other's sessions. | Records merge one by one (newest change wins per record). Deletions are tombstones, so they sync too. |
| The remote doc API was guessed (`snap.exists()` as a function). | Uses the documented `db` contract: `exists` boolean, `onSnapshot`, error codes. |
| Corrupt localStorage was ignored silently and could crash the render. | Every record is validated on load. Damaged data is kept aside, the last backup is restored, and a notice is shown. |
| Typed text was lost on reload (drafts lived only in memory). | Wizard and result forms save drafts and survive reloads. |
| Two open tabs overwrote each other. | Every save merges with what other tabs wrote; `storage` events keep tabs in sync. |
| A streak was shown as if it proved progress. | Streak removed. Progress is the change in the starting urge, and it needs at least 4 data points. |
| No export, import, backup, migration or schema version. | All added (see below). |
| The 5-hour window was presented as fact. | It is configurable, can be switched off, and is labelled as an experimental framework. |

**Kept:** all v1 data (ids preserved), the 8 problems, the before / prediction / after ratings, the window idea and the private per-user cloud storage.

## 2. Architecture

The app is plain JavaScript with no runtime dependencies. `build.mjs` bundles it into one self-contained `dist/index.html`, which is what the artifact serves.

```
src/core/   pure logic, unit-tested in Node
  util.js        helpers, dates, number guards
  modules.js     10 specialised behaviour templates + custom
  schema.js      schema v2, validation, v1→v2 migration, merge, import/export
  analytics.js   statistics over stored records
  insights.js    local rule-based insights, achievements, next-action, weekly hints
  coach.js       grounded AI prompt built only from real records
  store.js       localStorage persistence, multi-tab merge, outbox, backups, drafts
  sync.js        per-record sync with the artifact's private db
src/ui/     DOM toolkit, accessible forms, SVG charts, shell/router, 8 views, CSS
tests/      unit tests (Node), browser tests (Playwright + Chrome), runtime mock
```

**Data flow:** every change goes through `putRecord` / `removeRecord`. That function validates the record, stamps `updatedAt`, saves to localStorage (merging with other tabs) and adds the record key to the outbox. When the cloud is reachable, the outbox is flushed one write at a time. Offline changes wait in the outbox and are retried with backoff.

## 3. Data schema (v2)

```js
{
  schemaVersion: 2,
  settings:   { windowEnabled, windowHours, currency, packPrice, cigsPerPack, lastCigaretteAt, aiEnabled, updatedAt },
  behaviours: { [id]: { id, module, name, emoji, belief, alternatives[], triggers[], archived, createdAt, updatedAt } },
  experiments:{ [id]: { id, behaviourId, module, status: active|completed|abandoned, startedAt, completedAt,
                        situation, trigger, thought, emotion, urge 0-10, expectedDiscomfort 0-10, expectedDurationMin,
                        expectedConsequence, alternative, actualDiscomfort 0-10, actualDurationMin, actualConsequence,
                        outcome: completed|partial|not_completed|null, surprise, learned, notes, beliefConfidence 0-100,
                        moduleData {…per template}, tags[], highlight, windowHours, legacy, updatedAt } },
  journal:    { [id]: { id, type: note|weekly, title, body, answers{overestimated,easier,trigger,next}, weekKey,
                        experimentId, tags[], highlight, createdAt, updatedAt } },
  goals:      { [id]: { id, title, why, behaviourId, metric, target, archived, createdAt, updatedAt } },
  smokingLog: { [id]: { id, ts, count, note, experimentId, createdAt, updatedAt } },
  meta:       { createdAt, migratedFromV1 }
}
```

A deleted record becomes a tombstone: `{ id, deleted: true, updatedAt }`.

**Cloud layout:** one document per record at `data/users/<uid>/rt2/records/<kind>~<id>`, with body `{kind, id, updatedAt, deleted, data}`. This path is private to the signed-in viewer, including from the artifact owner.

## 4. Migration strategy

- **Local:** if `rt2_state` is missing and the v1 key `rewrite_tracker_state` exists, it is converted to v2. The v1 key is **left untouched** as a backup.
- **Cloud:** the v1 document `data/users/<uid>/state` is read once and converted the same way.
- **Field mapping:** problems become behaviours (mapped to templates). Sessions become experiments: before → urge, predicted → expected discomfort, after → actual discomfort, held yes/partly/no → completed/partial/not_completed, note → learned.
- **No duplicates:** v1 ids are kept, so local and cloud copies merge cleanly.
- **Future versions:** `normalizeState` takes any version, ignores unknown fields and validates every record.

## 5. Setup

Nothing to install. To rebuild or test with Node 18+:

```
node build.mjs --pwa         # → docs/ (web app: index.html, manifest, service worker, icons)
node build.mjs               # → dist/index.html (claude.ai version)
node build-icons.mjs         # regenerates web/icons (needs sharp)
node tests/unit.test.mjs     # core engine
node tests/e2e.test.mjs      # app in Chrome (needs Playwright)
python3 -m http.server 8765 --directory docs & node tests/pwa.test.mjs   # web app: offline + install + download
```

**GitHub Pages:** in the repo go to Settings → Pages → *Deploy from a branch*, choose `main` and `/docs`.
After a change, run `node build.mjs --pwa` and push. The service worker picks up the new version the next time the app is opened with a connection.

**claude.ai version:** publish `dist/index.html` as the artifact and declare the capabilities `db`, `user`, `sample` and `downloads`.

## 6. Test results (24 Nov 2026)

**Unit tests: 19/19 passed.** Covered:
- v1 migration and garbage records
- corrupt and wrong-typed data
- clamping
- last-writer-wins merge and tombstones
- import rejection and acceptance
- analytics maths
- insight thresholds (no insights from thin data)
- achievements and recommendation
- smoking stats (relapses don't reset totals)
- grounded coach prompt
- fresh seed
- v1 key migration
- corrupt-data recovery from backup
- two-tab writes
- bulk merge / replace / reset with automatic backups
- cloud push and pull without duplicates
- stale remote never overwriting a newer local edit
- offline queue and retry
- one-time cloud v1 migration
- local mode when no runtime is present

**Web app tests: 9/9 passed:** valid manifest and icons, the service worker takes control, the app opens offline with its data, browser JSON download works.

**Browser tests (real Chrome): 11/11 passed.** Covered:
- empty database across all 8 sections
- wizard validation
- multiple active experiments
- reload during an active experiment and mid-wizard
- partial result and a smoking slip
- v1 migration
- corrupt storage
- 36-record analytics and every filter
- chart tooltips
- deleted behaviour (orphaned experiments still listed)
- journal search, note, weekly reflection and editing
- goal validation
- bad JSON and wrong-shape import
- merge import done twice (no duplicates)
- typed reset confirmation
- cloud sync to a second device
- AI coach with focused experiment
- download
- offline cloud
- mobile layout (no horizontal overflow, bottom navigation, More menu)

**Limitation:** the cloud, AI and download tests use a test double of the artifact runtime built from its documented contract. On the live page, the first AI or download use shows Claude's own permission prompt.

## 7. Features

**Command Center**
- Recommended next action
- Completed and active experiments
- Prediction accuracy (within ±1 point)
- Predicted vs actual discomfort
- Follow-through
- Progress per behaviour (urge sparkline and trend)
- 8-week trend
- Top triggers
- Most improved and most difficult behaviour
- Smoking panel
- Achievements earned from evidence

**Daily Practice**
- 4-step wizard: behaviour → situation, trigger, emotion, thought, time → urge, prediction, duration, consequence and template fields → alternative
- Validation and saved drafts
- Several active experiments with countdowns
- Result form: outcome, actual discomfort / duration / consequence, surprise, lesson, belief confidence, tags, highlight
- "Already done" retroactive logging
- Cigarette log

**Behaviour Library**
- 10 specialised templates plus custom
- Editing: name, belief, template, alternatives list
- Archive and delete (history is kept)
- Which alternatives work best
- Template-specific totals
- Smoking: craving intensity, time since last cigarette, trigger, duration, craving passed?, cigarettes avoided, money saved, relapse log, longest smoke-free stretch, support resources (BIÖG quit line 0800 8 31 31 31)
- Spending: money not spent

**Insights & Coach**
- Claude-powered coach with 5 guided modes plus free chat
- Prompt built only from stored records, with rules against inventing history
- Streaming answers, a Stop button, error handling
- Local rule-based engine that labels each finding as *Observed* or *Hypothesis* and stays silent below its data thresholds

**Analytics** (filters: behaviour, period or custom dates, outcome, trigger)
- Before vs after over time
- Prediction vs reality scatter
- Weekly and monthly comparison
- Progress per behaviour
- Success / partial / not-completed rates
- Trigger frequency
- Emotions
- Time of day and weekday
- Rolling urge and belief confidence
- Alternative effectiveness

Every chart has hover details and a data table.

**Journal**
- Every completed experiment can be reviewed and edited
- Free notes linked to experiments
- Tags, highlights, search and date filters
- Weekly reflection with 4 questions, each shown next to your own data for that week

**Goals**
- Measured from data: experiments per week, follow-through, average urge, belief confidence, days since last cigarette

**Settings & Data**
- Experiment window (on/off, hours)
- Smoking costs, currency, AI toggle
- Sync status
- JSON export (download or copy)
- Validated import (merge or replace)
- Automatic daily backups plus manual backups, with restore
- Reset (type RESET to confirm)

**Design and accessibility**
- Dark design system, responsive (sidebar on desktop, bottom tabs on mobile)
- Keyboard focus styles, focus-trapped dialogs, ARIA labels and live regions
- Reduced-motion support
- Colour-blind-safe chart palette
- No colour-only meaning

## 8. External services

| Feature | Needs | Without it |
|---|---|---|
| Cloud sync across devices | Opening the page on claude.ai while signed in (`db` + `user` capabilities) | Everything works on this device only |
| AI coach | `sample` capability (Claude) and your permission on first use. No API keys in the page. | The local insights engine still works |
| JSON download | `downloads` capability | Copy JSON to the clipboard instead |
| Inter font | fonts.googleapis.com | Falls back to the system font |

No other network access, trackers or third-party libraries.
