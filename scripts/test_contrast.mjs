// Body text greys must meet WCAG AA contrast (>= 4.5:1) on the page backgrounds we use.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

function lin(c) { c = c / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function lum(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const L1 = lum(a), L2 = lum(b);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const css = fs.readFileSync(path.join(ROOT, "site/assets/css/style.css"), "utf8");
const muted = css.match(/--muted:([^;]+);/)?.[1]?.trim();
const bg = css.match(/--bg:([^;]+);/)?.[1]?.trim();
const green2 = css.match(/--green-2:([^;]+);/)?.[1]?.trim();
ok(/^#/.test(muted || ""), `muted token is a hex color (${muted})`);
const bgs = { "--bg": bg, "--green-2": green2, white: "#ffffff", "how-it-works card": "#e8f2e6" };
for (const [name, color] of Object.entries(bgs)) {
  if (!color) continue;
  const c = contrast(muted, color);
  ok(c >= 4.5, `--muted ${muted} on ${name} ${color} is ${c.toFixed(2)}:1 (need >= 4.5)`);
}
const hw = fs.readFileSync(path.join(ROOT, "site/_includes/how-it-works.njk"), "utf8");
const fills = [...hw.matchAll(/fill: (#[0-9a-fA-F]{3,8})/g)].map((m) => m[1]);
const greyish = fills.filter((f) => f.toLowerCase() !== "#fff" && f.toLowerCase() !== "#ffffff" && f.toLowerCase() !== "#2f6b3a");
for (const f of greyish) {
  // text on white or green-tint cards, or white text on the core
  const onLight = contrast(f, "#ffffff");
  const onCard = contrast(f, "#e8f2e6");
  const onCore = contrast(f, "#2f6b3a");
  const best = Math.max(onLight, onCard, onCore);
  ok(best >= 4.5, `diagram fill ${f} reaches ${best.toFixed(2)}:1 on a used background`);
}
ok(/<text class="hw-tc"[^>]*>Crop<\/text>/.test(hw) || /Crop<\/text>/.test(hw), "diagram labels the crop at the centre");
ok(hw.includes("15 climate regions") || /Climate regions/.test(hw), "diagram includes climate regions");
ok(/Countries/.test(hw) && /Cities/.test(hw) && /Hardiness/.test(hw) && /JSON API/.test(hw), "diagram includes countries, places, zones and API");

if (failed) { console.error(`\n${failed} contrast/diagram test(s) failed.`); process.exit(1); }
console.log("✓ contrast and diagram tests passed");
