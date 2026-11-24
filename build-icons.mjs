// Generates the app icons (PNG) from an SVG with sharp. Run once: node build-icons.mjs
import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
const sharp = require("/opt/npm-tools/node_modules/sharp");
const svg = (pad, round) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9085e9"/><stop offset="1" stop-color="#3987e5"/></linearGradient></defs>
<rect width="512" height="512" rx="${round}" fill="${round ? "url(#g)" : "#0f0f0e"}"/>
${round ? "" : `<rect x="${pad}" y="${pad}" width="${512 - 2 * pad}" height="${512 - 2 * pad}" rx="80" fill="url(#g)"/>`}
<path d="M178 372V140h96c52 0 84 28 84 72 0 33-18 56-48 66l56 94h-58l-49-86h-31v86zm50-128h42c23 0 37-12 37-32s-14-31-37-31h-42z" fill="#0f0f0e"/>
<circle cx="372" cy="150" r="22" fill="#0f0f0e" opacity=".85"/></svg>`);
const out = "web/icons/";
await sharp(svg(0, 112)).resize(192).png().toFile(out + "icon-192.png");
await sharp(svg(0, 112)).resize(512).png().toFile(out + "icon-512.png");
await sharp(svg(0, 0)).resize(180).png().toFile(out + "apple-touch-icon.png");
await sharp(svg(72, 0)).resize(512).png().toFile(out + "maskable-512.png");
console.log("icons written");
