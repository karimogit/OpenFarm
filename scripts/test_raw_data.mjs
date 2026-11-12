// Footer JSON links are a "Raw data:" label plus a small styled JSON button, consistently.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (["node_modules", "pagefind", "_pagefind"].includes(name.name)) continue;
      walk(p, acc);
    } else acc.push(p);
  }
  return acc;
}

const inc = fs.readFileSync(path.join(ROOT, "site/_includes/raw-data.njk"), "utf8");
ok(/Raw data:/.test(inc) && /class="raw-data-btn"/.test(inc) && /jsonHref/.test(inc),
  "raw-data.njk renders a Raw data: label and a JSON button from jsonHref");
ok(/icon = "download"/.test(inc), "JSON button has a download/data icon");

const templates = walk(path.join(ROOT, "site")).filter((p) => p.endsWith(".njk"));
const plain = [];
for (const f of templates) {
  const text = fs.readFileSync(f, "utf8");
  if (f.endsWith("raw-data.njk")) continue;
  // A bare "JSON" text link, not API docs / help prose / schema mentions.
  if (/>JSON<\/a>/.test(text) && !/raw-data/.test(text)) plain.push(path.relative(ROOT, f));
}
ok(plain.length === 0, "no template still has a plain JSON text link" + (plain.length ? " (" + plain.join(", ") + ")" : ""));

const users = ["crop.njk", "guide.njk", "place.njk", "country.njk", "countries.njk", "places.njk", "zone.njk", "region.njk", "tool.njk"];
for (const name of users) {
  const text = fs.readFileSync(path.join(ROOT, "site", name), "utf8");
  ok(text.includes('include "raw-data.njk"'), `${name} uses the shared raw-data include`);
}

const css = fs.readFileSync(path.join(ROOT, "site/assets/css/style.css"), "utf8");
ok(/\.raw-data-btn[^}]*background:\s*var\(--green\)/.test(css) && /\.raw-data-btn[^}]*color:\s*#fff/.test(css),
  "JSON button uses the site green on white text");
ok(/\.raw-data-label[^}]*color:\s*var\(--muted\)/.test(css), "Raw data: label uses the muted text colour");

const site = path.join(ROOT, "_site");
const sample = path.join(site, "crops/basil/index.html");
if (fs.existsSync(sample)) {
  const html = fs.readFileSync(sample, "utf8");
  ok(/Raw data:/.test(html) && /class="raw-data-btn"/.test(html) && /crops\/basil\.json/.test(html),
    "built basil page shows the Raw data: JSON button");
  ok(!/<a href="[^"]+">JSON<\/a>/.test(html), "built basil page has no plain JSON text link");
} else {
  console.log("skip: _site basil page not built yet");
}

const guideSample = path.join(site, "crops/basil/temperate-oceanic/index.html");
if (fs.existsSync(guideSample)) {
  const html = fs.readFileSync(guideSample, "utf8");
  ok(/class="raw-data-btn"/.test(html) && /crops\/basil\/temperate-oceanic\.json/.test(html),
    "built basil guide page shows per-guide JSON button");
  const guideJson = path.join(site, "crops/basil/temperate-oceanic.json");
  ok(fs.existsSync(guideJson), "built per-guide JSON exists for basil temperate-oceanic");
} else {
  console.log("skip: _site basil guide page not built yet");
}

if (failed) { console.error(`\n${failed} raw-data test(s) failed.`); process.exit(1); }
console.log("✓ raw-data tests passed");
