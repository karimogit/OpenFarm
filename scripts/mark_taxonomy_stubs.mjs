#!/usr/bin/env node
// Set taxonomy_stub: true on curated crop pages that only record taxonomy (Wikidata) until regional guides exist.
//   node scripts/mark_taxonomy_stubs.mjs        # dry run
//   node scripts/mark_taxonomy_stubs.mjs --write
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ROOT, loadCrops, loadGuides } from "./content.js";

const write = process.argv.includes("--write");

function isTaxonomyStub(c) {
  const d = c.data;
  if (d.origin !== "curated") return false;
  const src = d.sources || [];
  if (src.length !== 1 || src[0] !== "wikidata") return false;
  if (d.sun || d.water || d.days_to_first_harvest) return false;
  return /regional guide|species only|names the species/i.test(c.body);
}

const guidesByCrop = new Set();
for (const g of loadGuides()) if (!g.variety) guidesByCrop.add(g.data.crop);

let marked = 0;
for (const c of loadCrops()) {
  if (!isTaxonomyStub(c)) continue;
  if (guidesByCrop.has(c.data.slug)) continue;
  if (c.data.taxonomy_stub === true) continue;
  const full = path.join(ROOT, c.file);
  const parsed = matter(fs.readFileSync(full, "utf8"));
  parsed.data.taxonomy_stub = true;
  marked++;
  if (write) {
    fs.writeFileSync(full, matter.stringify(parsed.content, parsed.data));
    console.log("marked:", c.data.slug);
  } else console.log("would mark:", c.data.slug);
}

console.log(write ? `✓ Set taxonomy_stub on ${marked} crop(s).` : `Dry run: ${marked} crop(s) would be marked.`);