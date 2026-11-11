// Tool heroes must be photographs of that tool. Known-wrong files (drawings,
// clipart, a front-loader labelled "shovel", a sign labelled "soil thermometer")
// must not be used. commons_file must match data/images.json.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadTools } from "./content.js";
import { looksLikeIllustration } from "./image_kind.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const images = JSON.parse(fs.readFileSync(path.join(ROOT, "data/images.json"), "utf8"));
const BAD = [
  "Dibble (PSF).png",
  "Shovel.jpg",           // Volvo front-loader, not a hand shovel
  "Mattock.jpg",          // clipart
  "Soil Thermometer.jpg", // a sign, not the instrument
];

const used = [];
for (const [k, rec] of Object.entries(images)) {
  if (!k.startsWith("tool:") || !rec) continue;
  used.push(rec.file);
  ok(!BAD.includes(rec.file), `${k} must not use known-wrong file ${rec.file}`);
  ok(rec.image_type === "photo", `${k} is tagged image_type: photo`);
  ok(!looksLikeIllustration({ file: rec.file, author: rec.author, src: rec.src }),
    `${k} must not look like an illustration (${rec.file})`);
}

ok(!used.includes("Dibble (PSF).png"), "dibber line drawing is gone");
ok(used.includes("Schep.jpg") || used.some((f) => /schep|shovel/i.test(f) && f !== "Shovel.jpg"),
  "shovel uses a hand-shovel photograph, not the front-loader");

for (const t of loadTools()) {
  const key = `tool:${t.data.slug}`;
  const rec = images[key];
  const cf = t.data.commons_file || null;
  if (cf) {
    ok(rec && rec.file === cf, `${t.file}: commons_file "${cf}" matches images.json (${rec && rec.file})`);
  } else {
    ok(!rec, `${t.file}: no commons_file so images.json has no tool image`);
  }
}

if (failed) { console.error(`\n${failed} tool-image test(s) failed.`); process.exit(1); }
console.log("✓ tool-image tests passed");
