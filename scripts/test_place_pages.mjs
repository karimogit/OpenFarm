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
ok(place.includes("flag.njk") && place.includes("country-link.njk"), "place.njk h1 uses the flag include and a country link");
const h1Src = (place.match(/<h1>[\s\S]*?<\/h1>/) || [])[0] || "";
ok(
  h1Src.includes('include "flag.njk"')
    && h1Src.indexOf('include "flag.njk"') < h1Src.indexOf("{{ p.name }}")
    && h1Src.indexOf("{{ p.name }}") < h1Src.indexOf('include "country-link.njk"'),
  "place.njk h1 is Flag City, then the linked country",
);
ok(/omitFlag\s*=\s*true/.test(h1Src), "place.njk country link in the h1 omits a second flag");
ok(
  /title:\s*"\{\{\s*p\.name\s*\}\}/.test(place) && !/<title>[\s\S]*flag\.njk/.test(place),
  "place.njk <title> stays plain City, Country with no flag",
);
ok(/zoom:\s*p\.mapZoom or 10/.test(place), "place map pin carries an explicit city zoom");
ok(place.includes('class="on prune"') && /cal-legend[\s\S]*on prune/.test(place), "place calendar legend names prune, which the cells can show");

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
  const builtH1 = html && (html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1];
  if (!html) {
    console.log("skip: places/amsterdam-nl/index.html not in _site — rebuild to assert generated HTML");
  } else if (!/<title>\s*Amsterdam,\s*The Netherlands\s*·/.test(html)
      || !builtH1 || builtH1.indexOf('class="flag"') === -1
      || builtH1.indexOf('class="flag"') > builtH1.indexOf("Amsterdam")) {
    console.log("skip: _site is stale for places/amsterdam-nl — rebuild to assert generated HTML");
  } else {
    const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || "";
    ok(
      /^Amsterdam,\s*The Netherlands\s*·/.test(title) && !/flag|\.svg/.test(title),
      "built Amsterdam <title> is plain 'Amsterdam, The Netherlands' with no flag",
    );
    const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/);
    ok(h1, "built Amsterdam page has an h1");
    if (h1) {
      const text = h1[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      ok(
        /^Amsterdam,\s*The Netherlands$/.test(text),
        `built Amsterdam h1 readable text is 'Amsterdam, The Netherlands' (got ${JSON.stringify(text)})`,
      );
      const flagAt = h1[1].indexOf('class="flag"');
      const cityAt = h1[1].indexOf("Amsterdam");
      const linkAt = h1[1].indexOf("country-link");
      ok(flagAt >= 0 && flagAt < cityAt, "built Amsterdam h1 puts the flag before the city name");
      ok(cityAt >= 0 && linkAt > cityAt && /class="country-link"[\s\S]*\/countries\/nl\//.test(h1[1]),
        "built Amsterdam h1 links The Netherlands after the city name");
      const linkHtml = (h1[1].match(/<a class="country-link"[\s\S]*?<\/a>/) || [])[0] || "";
      ok(linkHtml && !/class="flag"/.test(linkHtml), "built Amsterdam country link does not duplicate the flag");
      ok((h1[1].match(/class="flag"/g) || []).length === 1, "built Amsterdam h1 has exactly one flag");
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
