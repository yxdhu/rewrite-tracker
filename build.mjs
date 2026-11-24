// Build: concatenates sources into one self-contained dist/index.html (no runtime dependencies).
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const ORDER = ["core/util", "core/modules", "core/schema", "core/analytics", "core/insights", "core/coach", "core/store", "core/sync",
  "ui/dom", "ui/forms", "ui/charts", "ui/app", "ui/view-home", "ui/view-practice", "ui/view-library", "ui/view-insights", "ui/view-analytics", "ui/view-journal", "ui/view-goals", "ui/view-prefs"];
const js = ORDER.map(f => fs.readFileSync(path.join(root, "src", f + ".js"), "utf8")).join("\n");
const css = fs.readFileSync(path.join(root, "src/ui/styles.css"), "utf8");
if (/<\/script/i.test(js)) throw new Error("source contains </script");
const PWA = process.argv.includes("--pwa");
const PWA_HEAD = PWA ? `
<meta name="theme-color" content="#0f0f0e">
<meta name="description" content="Personal behavioural-change tracker: prediction, experience, evidence, learning.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Rewrite">` : "";
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">${PWA_HEAD}
<title>Rewrite Tracker</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
${css}
</style>
</head>
<body>
<div id="app"><p style="padding:24px;color:#97968e">Loading Rewrite Tracker…</p></div>
<noscript><p style="padding:24px">Rewrite Tracker needs JavaScript.</p></noscript>
<script>
"use strict";
(function () {
${js}
})();
</script>
</body>
</html>
`;
const outDir = path.join(root, PWA ? "docs" : "dist");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html);
if (PWA) {
  // web app: manifest + service worker (+ icons from build-icons.mjs); version = content hash so updates roll out
  const crypto = await import("node:crypto");
  const version = crypto.createHash("sha256").update(html).digest("hex").slice(0, 12);
  for (const f of ["manifest.webmanifest", "sw.js", ".nojekyll"]) {
    const src = fs.readFileSync(path.join(root, "web", f), "utf8").replace("__VERSION__", version);
    fs.writeFileSync(path.join(outDir, f), src);
  }
  fs.mkdirSync(path.join(outDir, "icons"), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, "web/icons"))) fs.copyFileSync(path.join(root, "web/icons", f), path.join(outDir, "icons", f));
}
console.log("built", path.relative(root, outDir) + "/index.html", (html.length / 1024).toFixed(1) + " KB");
