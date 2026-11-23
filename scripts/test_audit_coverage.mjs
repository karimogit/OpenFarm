// Audit helper: taxonomy stubs and Köppen-overlap region counts.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadCrops, loadGuides, loadRegions } from "./content.js";

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); };

const audit = fs.readFileSync(path.join(ROOT, "scripts/audit_pages.mjs"), "utf8");
ok(audit.includes("cropExpectsGuide"), "audit_pages skips taxonomy_stub crops in curated warnings");
ok(audit.includes("regionKoppen"), "audit_pages counts guides by Köppen overlap");

const stubs = loadCrops().filter((c) => c.data.taxonomy_stub);
ok(stubs.length >= 60, `taxonomy_stub set on curated species pages (${stubs.length})`);

const regions = loadRegions();
const guides = loadGuides();
const regionKoppen = Object.fromEntries(regions.map((r) => [r.data.slug, new Set(r.data.koppen)]));
const counts = Object.fromEntries(regions.map((r) => [r.data.slug, new Set()]));
for (const g of guides) {
  if (g.variety || !g.data.sources?.length) continue;
  const id = `${g.data.crop}/${g.data.region}`;
  for (const r of regions) {
    const slug = r.data.slug;
    const kg = regionKoppen[slug];
    if (g.data.region === slug || (g.data.koppen || []).some((k) => kg.has(k))) counts[slug].add(id);
  }
}
for (const slug of ["subtropical-highland", "tundra-polar", "tropical-rainforest", "tropical-savanna", "cold-desert"]) {
  ok(counts[slug].size >= 5, `${slug} has at least 5 applicable guides (${counts[slug].size})`);
}

if (failed) process.exit(1);
console.log("✓ audit coverage tests passed");