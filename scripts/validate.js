#!/usr/bin/env node
// Validates all content against the JSON Schemas in schema/ plus cross-file rules
// (references between crops, varieties, guides, regions, problems, companions and sources).
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  ROOT, loadCrops, loadVarieties, loadGuides, loadRegions, loadProblems, loadSeedSources, loadTools,
  loadCompanions, loadSources, koppenToRegion,
} from "./content.js";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const compile = (name) => ajv.compile(JSON.parse(fs.readFileSync(path.join(ROOT, "schema", `${name}.schema.json`), "utf8")));
const V = Object.fromEntries(["crop", "variety", "guide", "region", "problem", "seed-source", "companions", "sources", "tool"].map((n) => [n, compile(n)]));

let errors = 0;
const fail = (file, msg) => { errors++; console.error(`✗ ${file}: ${msg}`); };
const check = (validate, data, file) => {
  if (validate(data)) return true;
  for (const e of validate.errors) fail(file, `${e.instancePath || "(root)"} ${e.message}${e.params?.allowedValues ? " " + JSON.stringify(e.params.allowedValues) : ""}`);
  return false;
};

const sources = loadSources();
check(V.sources, sources, "content/sources.yaml");
const checkSources = (file, list = []) => {
  for (const s of list) if (typeof s === "string" && !sources[s]) fail(file, `unknown source key "${s}" (add it to content/sources.yaml)`);
};

// Regions: every Köppen class must belong to exactly one region.
const regions = loadRegions();
const regionSlugs = new Set(regions.map((r) => r.data.slug));
const ALL_KG = V.guide.schema.properties.koppen.items.enum;
const owner = {};
for (const r of regions) {
  if (!check(V.region, r.data, r.file)) continue;
  if (r.data.slug !== r.slug) fail(r.file, `slug must equal file name "${r.slug}"`);
  for (const k of r.data.koppen) { if (owner[k]) fail(r.file, `Köppen ${k} already in region ${owner[k]}`); owner[k] = r.data.slug; }
  for (const s of r.data.similar) if (!regionSlugs.has(s) || s === r.data.slug) fail(r.file, `bad similar region "${s}"`);
}
for (const k of ALL_KG) if (!owner[k]) fail("content/regions", `Köppen class ${k} is not in any region`);
const kg2region = koppenToRegion(regions);

// Crops
const crops = loadCrops();
const cropSlugs = new Set(crops.map((c) => c.data.slug));
const problems = loadProblems();
const problemSlugs = new Set(problems.map((p) => p.data.slug));
for (const c of crops) {
  if (!check(V.crop, c.data, c.file)) continue;
  if (c.data.slug !== c.slug) fail(c.file, `slug must equal file name "${c.slug}"`);
  checkSources(c.file, c.data.sources);
  checkSources(c.file, c.data.seed_saving?.sources);
  checkSources(c.file, c.data.perennial?.sources);
  for (const p of c.data.problems || []) if (!problemSlugs.has(p)) fail(c.file, `unknown problem "${p}"`);
  if (c.data.origin === "curated" && c.body.trim().length < 80) fail(c.file, "curated crop needs a short general description in the body");
}

// Varieties
const varieties = loadVarieties();
const varietyKeys = new Set(varieties.map((v) => `${v.data.crop}/${v.data.slug}`));
for (const v of varieties) {
  if (!check(V.variety, v.data, v.file)) continue;
  if (v.data.crop !== v.folder) fail(v.file, `crop "${v.data.crop}" must match folder "${v.folder}"`);
  if (v.data.slug !== v.slug) fail(v.file, `slug must equal file name "${v.slug}"`);
  if (!cropSlugs.has(v.data.crop)) fail(v.file, `crop "${v.data.crop}" has no content/crops/${v.data.crop}.md`);
  for (const r of v.data.suitable_regions || []) if (!regionSlugs.has(r)) fail(v.file, `unknown region "${r}"`);
  for (const p of v.data.pollination_partners || []) if (!varietyKeys.has(`${v.data.crop}/${p}`)) fail(v.file, `unknown pollination partner "${p}"`);
  checkSources(v.file, v.data.sources);
}

// Guides
const guides = loadGuides();
const byCrop = {};
for (const g of guides) {
  if (!check(V.guide, g.data, g.file)) continue;
  const d = g.data;
  if (d.crop !== g.folder) fail(g.file, `crop "${d.crop}" must match folder "${g.folder}"`);
  if (d.region !== g.slug) fail(g.file, `region "${d.region}" must match file name "${g.slug}"`);
  if (!cropSlugs.has(d.crop)) fail(g.file, `crop "${d.crop}" has no content/crops/${d.crop}.md`);
  if (!regionSlugs.has(d.region)) fail(g.file, `unknown region "${d.region}" (see content/regions/)`);
  else if (!d.koppen.some((k) => kg2region[k] === d.region)) fail(g.file, `none of its Köppen classes belong to region ${d.region}`);
  for (const v of d.varieties || []) if (!varietyKeys.has(`${d.crop}/${v}`)) fail(g.file, `unknown variety "${v}" (content/varieties/${d.crop}/${v}.md)`);
  for (const p of d.problems || []) if (!problemSlugs.has(p)) fail(g.file, `unknown problem "${p}"`);
  checkSources(g.file, d.sources);
  if (g.body.trim().length < 200) fail(g.file, "body is too short (< 200 characters) – add real growing notes");
  if (!/^##\s+/m.test(g.body)) fail(g.file, "body should contain at least one '## ' section");
  (byCrop[d.crop] ||= []).push(g);
}
for (const list of Object.values(byCrop)) {
  const seen = {};
  for (const g of list) for (const k of g.data.koppen) {
    const key = `${k}/${g.data.hemisphere}`;
    if (seen[key]) fail(g.file, `Köppen ${k} (${g.data.hemisphere}) already covered by ${seen[key]}`);
    seen[key] = g.file;
  }
}

// Problems, seed sources, companions
for (const p of problems) {
  if (!check(V.problem, p.data, p.file)) continue;
  if (p.data.slug !== p.slug) fail(p.file, `slug must equal file name "${p.slug}"`);
  for (const c of p.data.affects) if (!cropSlugs.has(c)) fail(p.file, `unknown crop "${c}"`);
  checkSources(p.file, p.data.sources);
}
const seedSources = loadSeedSources();
for (const s of seedSources) {
  if (!check(V["seed-source"], s.data, s.file)) continue;
  if (s.data.slug !== s.slug) fail(s.file, `slug must equal file name "${s.slug}"`);
  for (const r of s.data.regions || []) if (!regionSlugs.has(r)) fail(s.file, `unknown region "${r}"`);
}
// Tools: no shop or affiliate links in tool pages; crops and guides may only reference known tools.
const tools = loadTools();
const toolSlugs = new Set(tools.map((t) => t.data.slug));
for (const t of tools) {
  if (!check(V.tool, t.data, t.file)) continue;
  if (t.data.slug !== t.slug) fail(t.file, `slug must equal file name "${t.slug}"`);
  checkSources(t.file, t.data.sources);
  if (/https?:\/\/(?!([a-z]+\.)?(wikipedia|wikimedia)\.org)/i.test(t.body || "")) fail(t.file, "no external (shop) links in tool text – put references in sources");
}
for (const x of [...crops, ...guides]) for (const s of x.data.tools || []) if (!toolSlugs.has(s)) fail(x.file, `unknown tool "${s}"`);
const companions = loadCompanions();
if (check(V.companions, companions, "content/companions.yaml")) {
  companions.forEach((c, i) => {
    for (const s of c.crops) if (!cropSlugs.has(s)) fail("content/companions.yaml", `[${i}] unknown crop "${s}"`);
    checkSources("content/companions.yaml", c.sources);
  });
}

if (errors) { console.error(`\n${errors} problem(s).`); process.exit(1); }
console.log(`✓ Valid: ${crops.length} crops, ${varieties.length} varieties, ${guides.length} guides, ${regions.length} regions ` +
  `(${ALL_KG.length} Köppen classes), ${problems.length} problems, ${seedSources.length} seed sources, ${tools.length} tools, ${companions.length} companion pairs.`);
