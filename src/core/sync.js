/* ===== core/sync.js — per-record sync with the artifact's private Claude db ===== */
const syncState = { mode: "local", message: "Saved on this device", lastSyncAt: null, pending: 0, error: null };
const syncListeners = new Set();
let syncCol = null, syncUnsub = null, syncInitial = false, flushing = false, retryTimer = null, retryDelay = 2000, firstTimer = null;

function onSyncChange(fn) { syncListeners.add(fn); return () => syncListeners.delete(fn); }
function setSync(patch) { Object.assign(syncState, patch, { pending: outbox.size }); syncListeners.forEach(fn => { try { fn(syncState); } catch (e) { } }); }
function errCode(e) { return e && typeof e.code === "string" ? e.code : "unavailable"; }
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: "timeout" }), ms))]); }

async function startSync() {
  if (typeof claude === "undefined" || !claude || typeof claude.use !== "function") { setSync({ mode: "local", message: "Saved on this device (cloud sync not available here)" }); return; }
  setSync({ mode: "connecting", message: "Connecting to your private cloud storage…" });
  let db, user;
  try { [db, user] = await Promise.all([claude.use("db"), claude.use("user")]); } catch (e) { db = null; }
  if (!db || !user) { setSync({ mode: "local", message: "Saved on this device only (sign in to sync)" }); return; }
  let id = null;
  try { id = await user.id(); } catch (e) { }
  if (!id) { setSync({ mode: "local", message: "Saved on this device only" }); return; }
  try { syncCol = db.doc("data/users/" + id + "/rt2").collection("records"); }
  catch (e) { setSync({ mode: "local", message: "Saved on this device only" }); return; }

  // one-time: bring in data the first version stored in the cloud (ids are stable, so no duplicates)
  if (!getUi("legacyRemoteDone_" + id, false)) {
    try {
      const snap = await withTimeout(db.collection("data/users/" + id).doc("state").get(), 10000);
      const d = snap && snap.exists ? snap.data() : null;
      if (d && typeof d.json === "string") {
        const v1 = JSON.parse(d.json);
        if (looksV1(v1)) {
          const m = migrateV1(v1); let changed = 0;
          for (const k of KINDS) for (const rid in m[k]) if (applyRemote(k, m[k][rid])) { outbox.add(recKey(k, rid)); changed++; }
          if (changed) { storePersist(); emitChange({ source: "remote" }); }
        }
      }
      setUi("legacyRemoteDone_" + id, true);
    } catch (e) { /* try again next load */ }
  }

  firstTimer = setTimeout(() => { if (!syncInitial) setSync({ mode: "offline", message: "Can't reach cloud storage yet. Everything is saved on this device and will sync later." }); }, 10000);
  syncUnsub = syncCol.onSnapshot(onRemoteSnapshot, err => {
    clearTimeout(firstTimer);
    const c = errCode(err);
    setSync({ mode: c === "revoked" || c === "not_granted" ? "local" : "error", message: c === "revoked" ? "Cloud access ended. Saving on this device." : "Cloud sync stopped (" + c + "). Saving on this device; reload to retry.", error: c });
    syncCol = c === "revoked" ? null : syncCol;
  });
  try { window.addEventListener("online", () => flushOutbox()); } catch (e) { }
}

function onRemoteSnapshot(snap) {
  let changed = false;
  const seen = new Set();
  for (const d of snap.docs) {
    const body = d.data(); if (!body || typeof body.kind !== "string") continue;
    const kind = body.kind; if (kind !== "settings" && !KINDS.includes(kind)) continue;
    const key = d.id; seen.add(key);
    const rec = body.deleted ? { id: body.id, deleted: true, updatedAt: body.updatedAt } : Object.assign({}, body.data, { updatedAt: body.updatedAt });
    const local = getByKey(key);
    if (applyRemote(kind, rec)) { changed = true; outbox.delete(key); }
    else if (local && local.updatedAt > (body.updatedAt || 0)) outbox.add(key);
    else if (local && local.updatedAt === body.updatedAt) outbox.delete(key);
  }
  if (!snap.metadata.fromCache && !syncInitial) {
    syncInitial = true; clearTimeout(firstTimer);
    for (const key of allKeys(S)) if (!seen.has(key)) outbox.add(key);
  }
  if (changed) { storePersist(); emitChange({ source: "remote" }); }
  else lsSet(LS.outbox, JSON.stringify([...outbox]));
  if (syncInitial) { if (!outbox.size) setSync({ mode: "synced", message: "Synced to your private cloud storage", lastSyncAt: Date.now(), error: null }); flushOutbox(); }
}

function scheduleFlush(ms) { clearTimeout(retryTimer); retryTimer = setTimeout(flushOutbox, ms); }

async function flushOutbox() {
  if (!syncCol || !syncInitial || flushing) { setSync({}); return; }
  flushing = true;
  try {
    while (outbox.size) {
      const key = outbox.values().next().value;
      const p = parseKey(key); const rec = p && getByKey(key);
      if (!rec) { outbox.delete(key); continue; }
      setSync({ mode: "pending", message: `Syncing ${outbox.size} change(s)…` });
      const at = rec.updatedAt;
      const body = rec.deleted ? { kind: p.kind, id: rec.id, updatedAt: at, deleted: true } : { kind: p.kind, id: rec.id, updatedAt: at, deleted: false, data: rec };
      try {
        await syncCol.doc(key).set(body);
        const now = getByKey(key);
        if (!now || now.updatedAt === at) outbox.delete(key);
        retryDelay = 2000;
        lsSet(LS.outbox, JSON.stringify([...outbox]));
      } catch (e) {
        const c = errCode(e);
        if (c === "invalid_argument" || c === "transform_error") { console.warn("Dropped unsyncable record", key, e); outbox.delete(key); continue; }
        if (c === "quota_exceeded") { setSync({ mode: "error", message: "Cloud storage is full. New changes are saved on this device only.", error: c }); return; }
        if (c === "revoked" || c === "not_granted" || c === "capability_disabled" || c === "capability_removed") { syncCol = null; setSync({ mode: "local", message: "Saved on this device only", error: c }); return; }
        setSync({ mode: "offline", message: "Offline. Changes are saved on this device and will sync automatically.", error: c });
        scheduleFlush(retryDelay); retryDelay = Math.min(retryDelay * 2, 60000);
        return;
      }
    }
    setSync({ mode: "synced", message: "Synced to your private cloud storage", lastSyncAt: Date.now(), error: null });
  } finally { flushing = false; }
}

/* called after every local change */
function requestSync() { setSync({}); if (syncCol && syncInitial) scheduleFlush(600); }
