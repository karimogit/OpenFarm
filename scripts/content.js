// Shared content loader for every OpenFarm content type (used by the validator, the importer and Eleventy).
//
//   content/crops/<crop>.md                    general, climate-independent facts about a crop
//   content/varieties/<crop>/<variety>.md      cultivars: traits + botanical seed facts
//   content/guides/<crop>/<region>.md          how to grow a crop in one climate region
//   content/regions/<region>.md                climate regions (groups of Köppen-Geiger classes)
//   content/problems/<problem>.md              shared pests, diseases and disorders
//   content/seed-sources/<source>.md           seed libraries, seed banks and seed companies
//   content/companions.yaml                    companion-planting pairs, each with its evidence
//   content/sources.yaml                       reusable citations, referenced by key (e.g. openfarm-rescue)
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const CONTENT = path.join(ROOT, "content");

const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

function readMd(full) {
  const parsed = matter(fs.readFileSync(full, "utf8"));
  const data = { ...parsed.data };
  for (const k of ["last_reviewed", "imported"]) if (k in data) data[k] = iso(data[k]);
  return { file: path.relative(ROOT, full), data, body: parsed.content };
}

/** Flat folder: content/<dir>/<slug>.md */
export function loadFlat(dir) {
  const base = path.join(CONTENT, dir);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).filter((f) => f.endsWith(".md")).sort()
    .map((f) => ({ ...readMd(path.join(base, f)), slug: f.replace(/\.md$/, "") }));
}

/** Nested folder: content/<dir>/<parent>/<slug>.md */
export function loadNested(dir) {
  const base = path.join(CONTENT, dir);
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const parent of fs.readdirSync(base).sort()) {
    const d = path.join(base, parent);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).sort()) {
      if (f.endsWith(".md")) out.push({ ...readMd(path.join(d, f)), folder: parent, slug: f.replace(/\.md$/, "") });
    }
  }
  return out;
}

export function loadYaml(file) {
  const full = path.join(CONTENT, file);
  return fs.existsSync(full) ? yaml.load(fs.readFileSync(full, "utf8")) : null;
}

export const loadCrops = () => loadFlat("crops");
export const loadVarieties = () => loadNested("varieties");
export const loadGuides = () => loadNested("guides");
export const loadRegions = () => loadFlat("regions").sort((a, b) => a.data.order - b.data.order);
export const loadProblems = () => loadFlat("problems");
export const loadSeedSources = () => loadFlat("seed-sources");
export const loadTools = () => loadFlat("tools");
export const loadCompanions = () => loadYaml("companions.yaml") || [];
export const loadSources = () => loadYaml("sources.yaml") || {};

/** Köppen symbol -> region slug */
export function koppenToRegion(regions = loadRegions()) {
  const m = {};
  for (const r of regions) for (const k of r.data.koppen) m[k] = r.data.slug;
  return m;
}

/** Resolve a `sources` list: string keys come from content/sources.yaml. */
export function resolveSources(list = [], registry = loadSources()) {
  return list.map((s) => (typeof s === "string" ? { key: s, ...(registry[s] || { title: s }) } : s));
}
