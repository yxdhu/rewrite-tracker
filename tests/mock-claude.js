/* Test double for the artifact runtime's `claude.use()` — db, user, sample, downloads.
   Mirrors the documented contract: refs, get/set, onSnapshot({docs, metadata}), error codes. */
globalThis.__makeMockClaude = function (opts) {
  opts = opts || {};
  const docs = opts.docs || new Map();   // path -> body (shared "cloud")
  const listeners = new Set();
  let offline = !!opts.offline;
  const log = [];
  function snapFor(prefix) {
    const list = [...docs.entries()].filter(([p]) => p.startsWith(prefix + "/") && p.slice(prefix.length + 1).indexOf("/") < 0)
      .map(([p, body]) => ({ id: p.slice(prefix.length + 1), exists: true, data: () => JSON.parse(JSON.stringify(body)), metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs: list, size: list.length, empty: !list.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function notify() { for (const l of listeners) setTimeout(() => l.next(snapFor(l.prefix)), 0); }
  function docRef(path) {
    if (path.split("/").length % 2) throw new TypeError("doc path needs even segments: " + path);
    return {
      id: path.split("/").pop(), path,
      async get() { if (offline) throw { code: "unavailable" }; const b = docs.get(path); return { id: path.split("/").pop(), exists: !!b, data: () => b ? JSON.parse(JSON.stringify(b)) : undefined, metadata: { fromCache: false } }; },
      async set(body) {
        log.push(["set", path]);
        if (offline) throw { code: "unavailable", message: "offline" };
        if (opts.failKeys && opts.failKeys.some(k => path.endsWith(k))) throw { code: "invalid_argument" };
        docs.set(path, JSON.parse(JSON.stringify(body))); notify();
      },
      async delete() { docs.delete(path); notify(); },
      collection(sub) { return colRef(path + "/" + sub); }
    };
  }
  function colRef(path) {
    if (path.split("/").length % 2 === 0) throw new TypeError("collection path needs odd segments: " + path);
    return {
      path,
      doc(id) { return docRef(path + "/" + (id || Math.random().toString(36).slice(2))); },
      onSnapshot(next, error) {
        const l = { prefix: path, next, error }; listeners.add(l);
        if (!offline) setTimeout(() => next(snapFor(path)), opts.snapDelay || 0);
        return () => listeners.delete(l);
      },
      async get() { return snapFor(path); }
    };
  }
  const db = { doc: docRef, collection: colRef };
  const user = { id: async () => opts.uid === undefined ? "user1" : opts.uid };
  const sampleCalls = [];
  const sample = async function (input, o) {
    sampleCalls.push(input);
    const text = opts.sampleText || "Your data shows 2 experiments. Hypothesis: keep going.\n- Try again tomorrow\nWhat surprised you?";
    if (o && o.onText) { o.onText({ text: text.slice(0, 10), delta: text.slice(0, 10) }); o.onText({ text, delta: text.slice(10) }); }
    return { text, truncated: false };
  };
  const saved = [];
  const downloads = { save: async (f) => { saved.push(f); return { ok: true }; } };
  const caps = { db, user, sample: opts.noSample ? null : sample, downloads };
  return {
    use: async (name) => (opts.noCaps ? null : (name in caps ? caps[name] : null)),
    __docs: docs, __log: log, __sampleCalls: sampleCalls, __saved: saved,
    __setOffline(v) { offline = v; if (!v) notify(); }
  };
};
