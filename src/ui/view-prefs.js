/* ===== ui/view-prefs.js — settings, sync, export/import, backups, reset ===== */
const prefsUI = { importText: "", importResult: null, exportText: null };

VIEWS.prefs = function () {
  const st = S.settings;
  const root = h("div", { class: "stack-lg" }, pageHeader("Settings & Data", "Preferences, sync, backups and your data."));
  const numSetting = (label, key, lo, hi, step, hint) => field(label, h("input", { type: "number", class: "input num-in", min: lo, max: hi, step, value: st[key] ?? "", onchange: e => {
    const v = e.target.value === "" ? null : Number(e.target.value);
    if (v !== null && (!Number.isFinite(v) || v < lo || v > hi)) { toast(`${label}: enter a value between ${lo} and ${hi}.`, "error"); e.target.value = st[key] ?? ""; return; }
    putSettings({ [key]: v }); toast("Saved.");
  } }), { hint });

  root.append(card("Experiment window (experimental)", [
    h("p", { class: "muted sm" }, "Memory-reconsolidation research (mostly in animals and in human fear memories) suggests a recalled memory may be easier to update for a limited time, often described as up to about 5–6 hours. Human results are mixed, and it has not been shown to work this way for habits. This window is a structure to encourage acting soon after the trigger, not a deadline: results recorded later still count fully."),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: st.windowEnabled, onchange: e => { putSettings({ windowEnabled: e.target.checked }); toast(e.target.checked ? "Window shown on experiments." : "Window hidden."); } }), "Show an experiment window countdown"),
    numSetting("Window length (hours)", "windowHours", 0.5, 48, 0.5, "Applies to new experiments.")]));

  root.append(card("Smoking", [
    h("div", { class: "grid-2 tight" }, numSetting(`Pack price (${st.currency})`, "packPrice", 0, 1000, 0.01, "Used to estimate money saved from cigarettes avoided."), numSetting("Cigarettes per pack", "cigsPerPack", 1, 100, 1)),
    field("Last cigarette (if you quit before logging here)", h("input", { type: "datetime-local", class: "input", value: st.lastCigaretteAt ? toLocalDT(st.lastCigaretteAt) : "", max: toLocalDT(Date.now()), onchange: e => { const t = e.target.value ? new Date(e.target.value).getTime() : null; if (t && t > Date.now()) { toast("That date is in the future.", "error"); return; } putSettings({ lastCigaretteAt: t }); toast("Saved."); } }), { hint: "Logged cigarettes in Practice take priority when they're more recent." })]));

  root.append(card("General", [
    field("Currency symbol", h("input", { type: "text", class: "input", maxlength: 5, value: st.currency, onchange: e => { putSettings({ currency: e.target.value.trim() || "€" }); toast("Saved."); } })),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: st.aiEnabled, onchange: e => { putSettings({ aiEnabled: e.target.checked }); } }), "Enable the AI coach (sends a summary of your records to Claude only when you ask it something)")]));

  // data
  const counts = KINDS.map(k => `${live(S[k]).length} ${({ behaviours: "behaviours", experiments: "experiments", journal: "journal entries", goals: "goals", smokingLog: "smoking log entries" })[k]}`).join(" · ");
  root.append(card("Sync", [h("p", { id: "sync-detail" }, syncState.message), h("p", { class: "muted sm" }, counts),
    h("p", { class: "muted sm" }, "Data is saved on this device first, so the app works offline and survives reloads. The claude.ai version also syncs every record to private storage that only you can read; the standalone web app keeps data on this device, so export regularly or move data between versions with Export and Import. If the same record is changed on two devices, the most recent change wins for that record only; nothing else is overwritten."),
    outbox.size ? h("p", { class: "muted sm" }, `${plural(outbox.size, "change")} waiting to sync.`) : null]));

  root.append(card("Export", [h("p", { class: "muted sm" }, "A complete JSON copy of your data (schema version " + SCHEMA_VERSION + "). Keep it somewhere safe; you can import it here or on another device."),
    h("div", { class: "row" }, UI.downloads || canBlobDownload() ? h("button", { class: "btn primary", onclick: doDownload }, "Download JSON") : null, linkBtn("Show / copy JSON", () => { prefsUI.exportText = JSON.stringify(exportPayload(S), null, 2); render(); })),
    prefsUI.exportText ? [h("textarea", { class: "input mono", rows: 8, readonly: true, "aria-label": "Exported data", value: prefsUI.exportText }), h("div", { class: "row" }, linkBtn("Copy to clipboard", async () => { try { await navigator.clipboard.writeText(prefsUI.exportText); toast("Copied."); } catch (e) { toast("Copy was blocked. Select the text and copy it manually.", "error"); } }), linkBtn("Hide", () => { prefsUI.exportText = null; render(); }))] : null]));

  const ir = prefsUI.importResult;
  root.append(card("Import", [h("p", { class: "muted sm" }, "Import a JSON export from this app (version 1 or 2). Everything is validated first and a backup is made automatically."),
    h("input", { type: "file", accept: "application/json,.json", class: "input", "aria-label": "Choose a JSON file", onchange: e => { const file = e.target.files[0]; if (!file) return; if (file.size > 20 * 1024 * 1024) { prefsUI.importResult = { ok: false, error: "File is too large (max 20 MB)." }; render(); return; } const rd = new FileReader(); rd.onload = () => { prefsUI.importText = String(rd.result); prefsUI.importResult = parseImport(prefsUI.importText); render(); }; rd.onerror = () => { prefsUI.importResult = { ok: false, error: "Couldn't read that file." }; render(); }; rd.readAsText(file); } }),
    h("details", { open: !!prefsUI.pasteOpen, ontoggle: e => prefsUI.pasteOpen = e.target.open }, h("summary", { class: "muted sm" }, "…or paste JSON"), h("textarea", { class: "input mono", rows: 5, "aria-label": "Paste JSON to import", value: prefsUI.pasteOpen ? prefsUI.importText : "", oninput: e => prefsUI.importText = e.target.value }), linkBtn("Check pasted data", () => { prefsUI.importResult = parseImport(prefsUI.importText || ""); render(); })),
    ir ? (ir.ok ? h("div", { class: "banner" }, h("div", {}, h("b", {}, "Ready to import: "), Object.entries(ir.counts).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", "), ir.issues.length ? h("div", { class: "muted xs" }, ir.issues.join(" ")) : null),
      h("div", { class: "row" }, linkBtn("Merge with my data", () => { const r = bulkApply(ir.state, "merge"); prefsUI.importResult = null; toast(`Imported: ${r.added} added or updated, ${r.kept} kept (yours were newer).`); }, "primary sm"),
        linkBtn("Replace my data", async () => { if (await confirmDialog({ title: "Replace all your data?", body: "Everything currently in the app (on all synced devices) will be replaced by the file's contents. A backup of your current data is made first.", confirm: "Replace", danger: true, requireText: "REPLACE" })) { bulkApply(ir.state, "replace"); prefsUI.importResult = null; toast("Data replaced. Your previous data is in Backups."); } }, "danger-ghost sm"),
        linkBtn("Cancel", () => { prefsUI.importResult = null; render(); }, "ghost sm")))
      : h("div", { class: "banner warn", role: "alert" }, ir.error, ir.issues && ir.issues.length ? " " + ir.issues.join(" ") : "")) : null]));

  const backups = listBackups();
  root.append(card("Backups on this device", [h("p", { class: "muted sm" }, "Made automatically once a day and before every import, restore or reset. The last " + MAX_BACKUPS + " are kept."),
    backups.length ? h("div", { class: "list" }, backups.map(b => { let n = "?"; try { n = (JSON.parse(b.json).experiments || []).length; } catch (e) { } return h("div", { class: "alt-row" }, h("span", {}, fmtDateTime(b.ts) + " · " + b.reason + " · " + plural(n, "experiment")),
      linkBtn("Restore", async () => { if (await confirmDialog({ title: "Restore this backup?", body: `Your current data will be replaced by the backup from ${fmtDateTime(b.ts)}. Your current data is backed up first.`, confirm: "Restore", danger: true })) { const r = restoreBackup(b.ts); toast(r.ok ? "Backup restored." : r.error, r.ok ? "" : "error"); } }, "ghost sm")); })) : h("p", { class: "muted sm" }, "No backups yet."),
    linkBtn("Back up now", () => { toast(backupNow("Manual backup") ? "Backup saved." : "Backup failed: browser storage is full or blocked.", "") ; render(); })]));

  root.append(card("Reset", [h("p", { class: "muted sm" }, "Deletes all experiments, journal entries, goals and logs on all synced devices, and restores the default behaviours. A backup is made first."),
    linkBtn("Reset all data", async () => { if (await confirmDialog({ title: "Reset all data?", body: "This removes everything you've logged. A backup is saved on this device first.", confirm: "Reset everything", danger: true, requireText: "RESET" })) { resetAll(); toast("All data reset. A backup was saved."); } }, "danger-ghost")]));

  root.append(card("About this method", [h("p", { class: "muted sm" }, "Rewrite Tracker uses a prediction → experience → evidence → learning loop, similar to behavioural experiments in cognitive behavioural therapy and exposure-based approaches. It's a self-help tool, not treatment. For addiction, trauma, or persistent low mood, please involve a doctor or therapist."),
    h("p", { class: "muted xs" }, `Schema v${SCHEMA_VERSION}` + (S.meta.migratedFromV1 ? " · upgraded from v1 on " + fmtDate(S.meta.migratedFromV1) : ""))]));
  return root;
};

/* outside claude.ai (e.g. the GitHub Pages web app) a normal browser download works */
function canBlobDownload() { try { return window.self === window.top && typeof Blob !== "undefined" && "download" in document.createElement("a"); } catch (e) { return false; } }
async function doDownload() {
  const data = JSON.stringify(exportPayload(S), null, 2);
  const filename = "rewrite-tracker-" + dayKey(Date.now()) + ".json";
  if (!UI.downloads) {
    try { const url = URL.createObjectURL(new Blob([data], { type: "application/json" })); const a = h("a", { href: url, download: filename }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast("Export downloaded."); }
    catch (e) { prefsUI.exportText = data; render(); toast("Download wasn't possible. Copy the JSON below instead.", "error"); }
    return;
  }
  try { await UI.downloads.save({ filename, data }); toast("Export ready."); }
  catch (e) {
    if (e && e.code === "declined") { toast("Download cancelled."); return; }
    if (e && (e.code === "unavailable" || e.code === "not_granted" || e.code === "capability_disabled")) UI.downloads = null;
    prefsUI.exportText = data; render(); toast("Download wasn't possible here. You can copy the JSON below instead.", "error");
  }
}
