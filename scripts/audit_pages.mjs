// Content and built-site checks for pages that should not be empty shells.
// Run after `npx eleventy` (npm test builds via other steps; this uses _site when present).
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadCrops, loadGuides, loadRegions } from "./content.js";

let failed = 0;
const warn = (msg) => console.warn(`⚠ ${msg}`);
const fail = (msg) => { failed++; console.error(`FAIL: ${msg}`); };

function sitePath(urlPath) {
  const rel = urlPath.replace(/^\//, "").replace(/\/$/, "");
  return path.join(ROOT, "_site", rel, "index.html");
}

function readBuilt(urlPath) {
  const p = sitePath(urlPath);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

const crops = loadCrops();
const guides = loadGuides();
const regions = loadRegions();
const cropSlugs = new Set(crops.map((c) => c.data.slug));

// --- Content: every guide must have a usable calendar and body ---
for (const g of guides) {
  const cal = g.data.calendar || {};
  if (!cal.harvest?.length) fail(`${g.file}: calendar.harvest is empty`);
  const hasSow = ["sow_indoors", "sow_direct", "plant", "harvest"].some((k) => cal[k]?.length);
  if (!hasSow) fail(`${g.file}: calendar has no sow/plant/harvest months`);
  if (!g.data.sources?.length) fail(`${g.file}: no sources`);
  if (!/^##\s+/m.test(g.body)) fail(`${g.file}: body has no ## section`);
}

const guidesByCrop = {};
for (const g of guides) {
  if (g.variety) continue;
  (guidesByCrop[g.data.crop] ??= new Set()).add(g.data.region);
}

const curatedNoGuide = crops.filter((c) => c.data.origin === "curated" && !guidesByCrop[c.data.slug]?.size);
if (curatedNoGuide.length) {
  warn(`${curatedNoGuide.length} curated crop(s) have no regional guide yet (pages show “No climate guides yet”): ${curatedNoGuide.map((c) => c.slug).join(", ")}`);
}

const importedNoGuide = crops.filter((c) => c.data.origin === "imported" && !guidesByCrop[c.data.slug]?.size);
console.log(`Coverage: ${guides.length} guides; ${crops.length - curatedNoGuide.length - importedNoGuide.length}/${crops.length} crops have ≥1 guide (${importedNoGuide.length} imported still without).`);

// Region pages: at least one sourced primary guide each is aspirational, not required yet.
const regionCounts = Object.fromEntries(regions.map((r) => [r.data.slug, 0]));
for (const g of guides) {
  if (g.variety || !(g.data.sources?.length)) continue;
  regionCounts[g.data.region] = (regionCounts[g.data.region] || 0) + 1;
}
const thinRegions = Object.entries(regionCounts).filter(([, n]) => n < 5).map(([slug, n]) => `${slug} (${n})`);
if (thinRegions.length) warn(`Regions with fewer than 5 crop-level guides: ${thinRegions.join(", ")}`);

const siteDir = path.join(ROOT, "_site");
if (!fs.existsSync(siteDir)) {
  warn("_site not found — run npx eleventy for HTML audits; skipping built-page checks.");
} else {
  for (const g of guides) {
    const url = g.variety
      ? `/crops/${g.data.crop}/${g.variety}/${g.data.region}/`
      : `/crops/${g.data.crop}/${g.data.region}/`;
    const html = readBuilt(url);
    if (!html) {
      fail(`built page missing for ${g.file} (${url})`);
      continue;
    }
    if (!/<h2[^>]*>\s*Calendar/i.test(html)) fail(`${url}: no Calendar heading in HTML`);
    if (!/<h2[^>]*>\s*Sources/i.test(html)) fail(`${url}: no Sources heading in HTML`);
    if (!html.includes('class="body"')) fail(`${url}: no article body in HTML`);
    if (!html.includes("raw-data-btn")) fail(`${url}: no Raw data JSON button (guide.njk)`);
    const jsonPath = path.join(ROOT, "_site", url.replace(/^\//, "").replace(/\/$/, "") + ".json");
    if (!fs.existsSync(jsonPath)) fail(`built JSON missing for ${url} (expected ${path.relative(ROOT, jsonPath)})`);
  }

  for (const c of crops) {
    const url = `/crops/${c.data.slug}/`;
    const html = readBuilt(url);
    if (!html) fail(`built crop page missing: ${c.slug}`);
    else if (!html.includes("raw-data-btn")) fail(`${url}: no Raw data JSON button`);
  }

  for (const r of regions) {
    const url = `/regions/${r.data.slug}/`;
    const html = readBuilt(url);
    if (!html) fail(`built region page missing: ${r.data.slug}`);
    else if (!html.includes("raw-data-btn")) fail(`${url}: no Raw data JSON button`);
  }
}

if (failed) {
  console.error(`\n${failed} page audit failure(s).`);
  process.exit(1);
}
console.log("✓ page audit passed");
