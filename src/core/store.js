/* ===== core/store.js — local persistence, multi-tab safety, outbox, backups ===== */
const LS = { state: "rt2_state", v1: "rewrite_tracker_state", outbox: "rt2_outbox", backups: "rt2_backups", drafts: "rt2_drafts", ui: "rt2_ui" };
const MAX_BACKUPS = 5;

let S = null;                 // current state
const outbox = new Set();     // "kind~id" keys not yet confirmed by the cloud
const storeListeners = new Set();
const loadNotices = [];       // shown once as banners
let storageOk = true;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsJSON(k, dflt) { const r = lsGet(k); if (r == null) return dflt; try { return JSON.parse(r); } catch (e) { return dflt; } }

function recKey(kind, id) { return kind + "~" + id; }
function parseKey(key) { const i = key.indexOf("~"); return i < 0 ? null : { kind: key.slice(0, i), id: key.slice(i + 1) }; }
function getByKey(key) { const p = parseKey(key); if (!p) return null; if (p.kind === "settings") return S.settings; return (S[p.kind] || {})[p.id] || null; }
function allKeys(st) { const ks = [recKey("settings", "main")]; for (const k of KINDS) for (const id in st[k]) ks.push(recKey(k, id)); return ks; }

function readLocalState() {
  const raw = lsGet(LS.state); if (raw == null) return null;
  try { return normalizeState(JSON.parse(raw)).state; } catch (e) { return null; }
}

function storeLoad() {
  const raw = lsGet(LS.state);
  if (raw != null) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = undefined; }
    if (parsed === undefined || !isPlainObj(parsed)) {
      lsSet("rt2_corrupt_" + Date.now(), raw);
      const b = lsJSON(LS.backups, []).filter(x => x && typeof x.json === "string").sort((a, c) => c.ts - a.ts)[0];
      let restored = null;
      if (b) { try { restored = normalizeState(JSON.parse(b.json)).state; } catch (e) { } }
      S = restored || seededState();
      loadNotices.push(restored ? `Saved data on this device was damaged. Restored the backup from ${fmtDateTime(b.ts)}. The damaged copy was kept.` : "Saved data on this device was damaged and could not be read. A copy was kept; starting fresh.");
      allKeys(S).forEach(k => outbox.add(k));
    } else {
      const r = normalizeState(parsed); S = r.state;
      if (r.issues.length && !looksV1(parsed)) loadNotices.push("Some stored records were invalid and skipped: " + r.issues.join(" "));
    }
  } else {
    const v1raw = lsGet(LS.v1); let migrated = null;
    if (v1raw) { try { const p = JSON.parse(v1raw); if (looksV1(p)) migrated = migrateV1(p); } catch (e) { } }
    if (migrated) { S = migrated; loadNotices.push(`Your data from the first version was upgraded (${live(S.experiments).length} rounds, ${live(S.behaviours).length} problems). The original copy is kept untouched.`); }
    else S = seededState(true);
    allKeys(S).forEach(k => outbox.add(k));
  }
  lsJSON(LS.outbox, []).forEach(k => typeof k === "string" && outbox.add(k));
  storePersist(true);
  maybeAutoBackup();
  try { window.addEventListener("storage", onStorageEvent); } catch (e) { }
  return S;
}

function onStorageEvent(e) {
  if (e.key === LS.state && e.newValue) {
    const other = readLocalState(); if (!other) return;
    S = mergeStates(S, other);
    lsJSON(LS.outbox, []).forEach(k => outbox.add(k));
    emitChange({ source: "tab" });
  }
}

function storePersist(skipMerge) {
  if (!skipMerge) { const cur = readLocalState(); if (cur) S = mergeStates(S, cur); }
  storageOk = lsSet(LS.state, JSON.stringify(S));
  lsSet(LS.outbox, JSON.stringify([...outbox]));
  return storageOk;
}
function onStoreChange(fn) { storeListeners.add(fn); return () => storeListeners.delete(fn); }
function emitChange(info) { storeListeners.forEach(fn => { try { fn(info || {}); } catch (e) { console.error(e); } }); }

function nextTs(prev) { return Math.max(Date.now(), ((prev && prev.updatedAt) || 0) + 1); }

/* ---------- mutations (all go through here) ---------- */
function putRecord(kind, rec) {
  const prev = S[kind][rec.id];
  const clean = cleanRecord(kind, Object.assign({}, rec, { updatedAt: nextTs(prev), createdAt: rec.createdAt || (prev && prev.createdAt) || Date.now() }));
  if (!clean || clean.deleted) throw new Error("Record failed validation");
  S[kind][clean.id] = clean;
  outbox.add(recKey(kind, clean.id));
  storePersist(); emitChange({ source: "local", kind, id: clean.id });
  return clean;
}
function removeRecord(kind, id) {
  const prev = S[kind][id]; if (!prev || prev.deleted) return;
  S[kind][id] = tombstone(id, nextTs(prev));
  outbox.add(recKey(kind, id));
  storePersist(); emitChange({ source: "local", kind, id });
}
function putSettings(patch) {
  S.settings = cleanSettings(Object.assign({}, S.settings, patch, { updatedAt: nextTs(S.settings) }));
  outbox.add(recKey("settings", "main"));
  storePersist(); emitChange({ source: "local", kind: "settings" });
}
/* remote record arrives; returns true if it changed local state */
function applyRemote(kind, rec) {
  const clean = cleanRecord(kind, rec); if (!clean) return false;
  const cur = kind === "settings" ? S.settings : S[kind][clean.id];
  if (pickNewer(cur, clean) === cur && cur) return false;
  if (kind === "settings") S.settings = clean; else S[kind][clean.id] = clean;
  return true;
}

/* bulk operations: import, restore, reset */
function bulkApply(incoming, mode) {
  backupNow(mode === "reset" ? "Before reset" : mode === "replace" ? "Before replace/restore" : "Before import");
  const now = Date.now();
  let added = 0, kept = 0, removed = 0;
  for (const k of KINDS) {
    const inc = incoming ? incoming[k] : {};
    if (mode !== "merge") {
      for (const id in S[k]) if (!S[k][id].deleted && !(inc && inc[id] && !inc[id].deleted)) { S[k][id] = tombstone(id, nextTs(S[k][id])); outbox.add(recKey(k, id)); removed++; }
    }
    for (const id in (inc || {})) {
      const r = inc[id]; if (r.deleted) continue;
      const cur = S[k][id];
      if (mode === "merge" && cur && !cur.deleted) { const w = pickNewer(cur, r); if (w !== cur) { S[k][id] = r; outbox.add(recKey(k, id)); added++; } else kept++; continue; }
      S[k][id] = Object.assign({}, r, { updatedAt: Math.max(now, ((cur && cur.updatedAt) || 0) + 1) });
      outbox.add(recKey(k, id)); added++;
    }
  }
  if (incoming && mode !== "merge") { S.settings = Object.assign({}, incoming.settings, { updatedAt: nextTs(S.settings) }); outbox.add(recKey("settings", "main")); }
  storePersist(true); emitChange({ source: "bulk" });
  return { added, kept, removed };
}
function resetAll() {
  const fresh = seededState();
  const r = bulkApply(fresh, "reset");
  return r;
}

/* ---------- backups (on this device) ---------- */
function listBackups() { return lsJSON(LS.backups, []).filter(b => b && typeof b.json === "string" && b.ts).sort((a, b) => b.ts - a.ts); }
function backupNow(reason) {
  const list = listBackups();
  const json = JSON.stringify(exportPayload(S).data);
  if (list[0] && list[0].json === json) return true;
  list.unshift({ ts: Date.now(), reason: reason || "Manual backup", json });
  let keep = list.slice(0, MAX_BACKUPS);
  while (keep.length && !lsSet(LS.backups, JSON.stringify(keep))) keep = keep.slice(0, keep.length - 1);
  return keep.length > 0;
}
function maybeAutoBackup() {
  const last = listBackups().find(b => b.reason === "Automatic daily backup");
  const hasData = live(S.experiments).length + live(S.journal).length > 0;
  if (hasData && (!last || Date.now() - last.ts > DAY)) backupNow("Automatic daily backup");
}
function restoreBackup(tsv) {
  const b = listBackups().find(x => x.ts === tsv); if (!b) return { ok: false, error: "Backup not found." };
  try { const st = normalizeState(JSON.parse(b.json)).state; return { ok: true, ...bulkApply(st, "replace") }; }
  catch (e) { return { ok: false, error: "This backup could not be read." }; }
}

/* ---------- drafts & ui prefs (reload-safe forms) ---------- */
function getDraft(k) { const d = lsJSON(LS.drafts, {}); return isPlainObj(d[k]) ? d[k] : null; }
function setDraft(k, v) { const d = lsJSON(LS.drafts, {}); if (v == null) delete d[k]; else d[k] = v; lsSet(LS.drafts, JSON.stringify(d)); }
function getUi(k, dflt) { const d = lsJSON(LS.ui, {}); return k in d ? d[k] : dflt; }
function setUi(k, v) { const d = lsJSON(LS.ui, {}); d[k] = v; lsSet(LS.ui, JSON.stringify(d)); }
