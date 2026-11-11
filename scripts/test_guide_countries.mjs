// Guide "Common in:" lines list each country once (flag + link), not cities.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const guide = fs.readFileSync(path.join(ROOT, "site/guide.njk"), "utf8");
ok(guide.includes("exampleCountries") && guide.includes("country-link.njk"),
  "guide template builds Common in from exampleCountries and country-link.njk");
ok(!/set places = g\.examplePlaces/.test(guide),
  "guide template no longer passes city examplePlaces into the Common in line");
const commonBlock = (guide.match(/exampleCountries[\s\S]*?<\/p>/) || [""])[0];
ok(commonBlock && !/p\.name|\{\{[^}]*\.name/.test(commonBlock),
  "guide Common in line does not print city names");

const db = fs.readFileSync(path.join(ROOT, "site/_data/db.js"), "utf8");
ok(/exampleCountriesOf/.test(db) && /seen\.has/.test(db),
  "db.js deduplicates example countries by ISO code");
ok(/exampleCountries: exampleCountriesOf\(region\.examplePlaces\)/.test(db),
  "guides expose exampleCountries from the region's example places");

const region = fs.readFileSync(path.join(ROOT, "site/region.njk"), "utf8");
ok(region.includes("places-line.njk") && region.includes("r.examplePlaces"),
  "region Examples: line still lists example cities");

const site = path.join(ROOT, "_site");
const rel = "crops/cabbage/temperate-oceanic/index.html";
const built = fs.existsSync(path.join(site, rel)) ? fs.readFileSync(path.join(site, rel), "utf8") : null;
if (built) {
  const m = built.match(/<p class="places-line[^"]*">([\s\S]*?)<\/p>/);
  ok(!!m, "built cabbage temperate-oceanic page has a Common in line");
  if (m) {
    const line = m[1];
    ok(/Common in:/.test(line), "line is labelled Common in:");
    ok(/href="[^"]*\/countries\/nl\//.test(line) && /href="[^"]*\/countries\/gb\//.test(line),
      "Common in links the Netherlands and the United Kingdom");
    const hrefs = [...line.matchAll(/\/countries\/([a-z]{2})\//g)].map((x) => x[1]);
    ok(hrefs.length === new Set(hrefs).size, "each country appears only once: " + hrefs.join(","));
    ok(!/Amsterdam|Utrecht|London|Paris|Hamburg|Melbourne|Wellington/.test(line),
      "Common in does not list city names");
    ok(/class="country-link"/.test(line) && /class="flag"/.test(line),
      "each country is a flag + linked name");
  }
} else {
  console.log("skip: _site cabbage guide not built yet");
}

if (failed) { console.error(`\n${failed} guide-countries test(s) failed.`); process.exit(1); }
console.log("✓ guide-countries tests passed");
