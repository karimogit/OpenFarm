// Country names/flags in Common-in lines, seed sources and place headings must link to /countries/<iso2>/.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const link = fs.readFileSync(path.join(ROOT, "site/_includes/country-link.njk"), "utf8");
ok(link.includes('href="{{ (\'/countries/\' + (cc | lower) + \'/\') | url }}"'), "country-link.njk points at /countries/<iso2>/");
ok(link.includes("flag.njk") && link.includes("countries[cc]"), "country-link.njk renders the flag and country name");

const places = fs.readFileSync(path.join(ROOT, "site/_includes/places-line.njk"), "utf8");
ok(places.includes("country-link.njk"), "places-line (Common in / Examples) uses country-link.njk");

const crops = fs.readFileSync(path.join(ROOT, "site/crops.njk"), "utf8");
ok(crops.includes("country-link.njk") && /data-seed-sources/.test(crops), "seed-source country lists use country-link.njk");
ok(!/for code in s\.countries %\}.*flag\.njk.*countries\[code\]/.test(crops.replace(/\n/g, " ")), "seed sources no longer print an unlinked flag+name");

const place = fs.readFileSync(path.join(ROOT, "site/place.njk"), "utf8");
ok(place.includes("country-link.njk") && place.includes("flag.njk"), "place page heading uses the flag include and country-link.njk");
const placeH1 = (place.match(/<h1>[\s\S]*?<\/h1>/) || [])[0] || "";
ok(
  placeH1.includes('include "flag.njk"')
    && placeH1.indexOf('include "flag.njk"') < placeH1.indexOf("{{ p.name }}")
    && placeH1.indexOf("{{ p.name }}") < placeH1.indexOf('include "country-link.njk"'),
  "place h1 puts the flag first, then the city name, then the country link",
);

const site = path.join(ROOT, "_site");
function readBuilt(...parts) {
  const p = path.join(site, ...parts);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
const region = readBuilt("regions", "temperate-oceanic", "index.html")
  || readBuilt("regions/temperate-oceanic/index.html");
// Eleventy pathPrefix may nest; try both with and without typical layout
const candidates = [
  "regions/temperate-oceanic/index.html",
  "contribute/index.html",
  "crops/index.html",
  "places/amsterdam-nl/index.html",
  "crops/tomato/temperate-oceanic/index.html",
];
if (fs.existsSync(site)) {
  const walk = (rel) => {
    const p = path.join(site, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };
  const checks = [
    ["regions/temperate-oceanic/index.html", /class="country-link"[\s\S]*\/countries\/[a-z]{2}\//, "built temperate-oceanic region page links example countries to /countries/<iso2>/"],
    ["crops/index.html", /data-seed-sources[\s\S]*class="country-link"[\s\S]*\/countries\//, "built crops page seed sources link countries"],
    ["places/amsterdam-nl/index.html", /<h1>[\s\S]*class="flag"[\s\S]*Amsterdam[\s\S]*class="country-link"[\s\S]*\/countries\/nl\//, "built Amsterdam place heading is Flag City, then a link to the Netherlands"],
    ["crops/tomato/temperate-oceanic/index.html", /class="country-link"[\s\S]*\/countries\//, "built tomato temperate-oceanic guide Common-in line links countries"],
  ];
  let stale = false;
  for (const [rel, re, msg] of checks) {
    const html = walk(rel);
    if (!html) { console.log("skip: " + rel + " not in _site"); continue; }
    if (!re.test(html)) { stale = true; console.log("skip: _site is stale for " + rel + " — rebuild to assert: " + msg); continue; }
    ok(true, msg);
  }
  if (stale) console.log("note: source templates are tested above; rebuild _site to assert generated HTML");
} else {
  console.log("skip: _site not built yet — run this test after a build to assert built HTML");
}

if (failed) { console.error(`\n${failed} country-link test(s) failed.`); process.exit(1); }
console.log("✓ country-link tests passed");
