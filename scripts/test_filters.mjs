// Checks that listing-page filters have the data attributes they need, and
// (when _site exists) that built region pages expose them so cardFilters works.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const tile = fs.readFileSync(path.join(ROOT, "site/_includes/guide-tile.njk"), "utf8");
ok(/data-guides="/.test(tile), "guide-tile.njk sets data-guides (region-page filters key off this)");
ok(/data-reviewed="/.test(tile), "guide-tile.njk sets data-reviewed");
ok(/data-life="/.test(tile), "guide-tile.njk sets data-life");
ok(/data-name="/.test(tile), "guide-tile.njk sets data-name");

const card = fs.readFileSync(path.join(ROOT, "site/_includes/crop-card.njk"), "utf8");
ok(/data-guides="/.test(card), "crop-card.njk sets data-guides");

const filtersJs = fs.readFileSync(path.join(ROOT, "site/assets/js/common.js"), "utf8");
ok(filtersJs.includes('.crop-grid > li[data-guides]'), "cardFilters still selects .crop-grid > li[data-guides]");

const tools = fs.readFileSync(path.join(ROOT, "site/tools.njk"), "utf8");
ok(/id="tool-filter"/.test(tools) && /data-tool-cat/.test(tools), "tools index has search + category chips");
ok(/history\.replaceState/.test(tools) && /params\.get\("q"\)/.test(tools) && /params\.get\("cat"\)/.test(tools), "tools filters persist in the URL query");
ok(!/powered|hand vs/i.test(tools), "tools filters do not invent a hand/powered toggle");

const site = path.join(ROOT, "_site");
if (fs.existsSync(path.join(site, "regions/humid-continental/index.html"))) {
  const html = fs.readFileSync(path.join(site, "regions/humid-continental/index.html"), "utf8");
  const lis = html.match(/<li\b[^>]*data-guides=/g) || [];
  ok(lis.length > 0, `built humid-continental page has data-guides on guide cards (${lis.length})`);
  ok(html.includes('data-filters') || html.includes("Filters"), "humid-continental page includes the filters panel");
} else {
  console.log("skip: _site not built yet — run this test after npm run build to assert built HTML");
}

if (failed) { console.error(`\n${failed} filter test(s) failed.`); process.exit(1); }
console.log("✓ filter tests passed");
