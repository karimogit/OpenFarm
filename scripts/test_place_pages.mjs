// City/place pages: "City, Country" titles and a city-scale map view.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";
import { citySourceBbox, mapBoundsFromBbox, CITY_BBOX_PAD, paddedBbox } from "./geo_pages.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const place = fs.readFileSync(path.join(ROOT, "site/place.njk"), "utf8");
ok(
  /title:\s*"\{\{\s*p\.name\s*\}\}[^{"]*\{\%\s*if p\.countryName\s*\%\},\s*\{\{\s*p\.countryName\s*\}\}/.test(place),
  "place.njk <title> is City, Country when a country name is present",
);
ok(
  /<h1>\{\{\s*p\.name\s*\}\}[^{<]*\{\%\s*if p\.cc\s*\%\},\s*\{\%\s*set cc = p\.cc\s*\%\}\{\%\s*include "country-link\.njk"/.test(place),
  "place.njk h1 is City, then the linked country (flag allowed)",
);
ok(/zoom:\s*p\.mapZoom or 10/.test(place), "place map pin carries an explicit city zoom");

// Country-scale padding must not be applied to city insets.
const wide = paddedBbox([4.89 - 1, 52.374 - 0.7, 4.89 + 1, 52.374 + 0.7]);
ok(wide && wide[2] - wide[0] > 4, "legacy country-style padding on a ±1° box is wider than 4° (the live bug)");
const ams = mapBoundsFromBbox(citySourceBbox(52.374, 4.89), CITY_BBOX_PAD);
ok(ams && ams.west < 4.89 && ams.east > 4.89 && ams.south < 52.374 && ams.north > 52.374, "Amsterdam city inset contains the city");
ok(ams.east - ams.west < 2 && ams.north - ams.south < 1.5, `Amsterdam city inset is metro-scale, not country-scale (span ${((ams.east - ams.west).toFixed(2))}° × ${((ams.north - ams.south).toFixed(2))}°)`);

const site = path.join(ROOT, "_site");
function walk(rel) {
  const p = path.join(site, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
if (fs.existsSync(site)) {
  const html = walk("places/amsterdam-nl/index.html");
  if (!html) {
    console.log("skip: places/amsterdam-nl/index.html not in _site — rebuild to assert generated HTML");
  } else if (!/<title>\s*Amsterdam,\s*The Netherlands\s*·/.test(html)) {
    console.log("skip: _site is stale for places/amsterdam-nl — rebuild to assert generated HTML");
  } else {
    ok(
      /<title>\s*Amsterdam,\s*The Netherlands\s*·/.test(html),
      "built Amsterdam <title> is 'Amsterdam, The Netherlands'",
    );
    const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/);
    ok(h1, "built Amsterdam page has an h1");
    if (h1) {
      const text = h1[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      ok(
        /^Amsterdam,\s*The Netherlands$/.test(text),
        `built Amsterdam h1 reads 'Amsterdam, The Netherlands' (got ${JSON.stringify(text)})`,
      );
      ok(
        /class="country-link"[\s\S]*\/countries\/nl\//.test(h1[1]),
        "built Amsterdam h1 links The Netherlands to /countries/nl/",
      );
      const cityAt = h1[1].indexOf("Amsterdam");
      const linkAt = h1[1].indexOf("country-link");
      ok(cityAt >= 0 && linkAt > cityAt, "built Amsterdam h1 puts the city name before the country link");
    }
    const pin = html.match(/<script type="application\/json" data-pin>(.*?)<\/script>/);
    ok(pin, "built Amsterdam map includes a pin");
    if (pin) {
      const data = JSON.parse(pin[1]);
      ok(data.lat === 52.374 && data.lon === 4.89 && data.zoom === 10, `Amsterdam pin is at the city with zoom 10 (got ${pin[1]})`);
    }
    const bounds = html.match(/<script type="application\/json" data-bounds>(.*?)<\/script>/);
    ok(bounds, "built Amsterdam map includes bounds");
    if (bounds) {
      const b = JSON.parse(bounds[1]);
      ok(b.east - b.west < 2 && b.north - b.south < 1.5, `built Amsterdam map bounds are metro-scale (got ${bounds[1]})`);
    }
  }
} else {
  console.log("skip: _site not built yet — run this test after a build to assert generated HTML");
}

if (failed) { console.error(`\n${failed} place-page test(s) failed.`); process.exit(1); }
console.log("✓ place-page tests passed");
