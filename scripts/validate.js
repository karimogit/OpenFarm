#!/usr/bin/env node
// Validates every guide's frontmatter against schema/guide.schema.json plus a few cross-file rules.
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadGuides, ROOT } from "./guides.js";

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schema/guide.schema.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const guides = loadGuides();
let errors = 0;
const fail = (file, msg) => { errors++; console.error(`✗ ${file}: ${msg}`); };
const byCrop = {};

for (const g of guides) {
  if (!validate(g.data)) {
    for (const e of validate.errors) fail(g.file, `${e.instancePath || "(root)"} ${e.message}${e.params?.allowedValues ? " " + JSON.stringify(e.params.allowedValues) : ""}`);
    continue;
  }
  const d = g.data;
  if (d.crop !== g.folder) fail(g.file, `crop "${d.crop}" must match folder "${g.folder}"`);
  if (d.variant !== g.slug) fail(g.file, `variant "${d.variant}" must match file name "${g.slug}"`);
  if (g.body.trim().length < 200) fail(g.file, "body is too short (< 200 characters) – add real growing notes");
  if (!/^##\s+/m.test(g.body)) fail(g.file, "body should contain at least one '## ' section");
  (byCrop[d.crop] ||= []).push(g);
}

for (const [crop, list] of Object.entries(byCrop)) {
  const first = list[0].data;
  for (const g of list.slice(1)) {
    for (const k of ["common_name", "scientific_name", "family"]) {
      if (g.data[k] !== first[k]) fail(g.file, `${k} "${g.data[k]}" differs from ${list[0].file} ("${first[k]}")`);
    }
  }
  // A Köppen class should not be claimed by two variants of the same crop for the same hemisphere.
  const seen = {};
  for (const g of list) for (const k of g.data.koppen) {
    const key = `${k}/${g.data.hemisphere}`;
    if (seen[key]) fail(g.file, `Köppen ${k} (${g.data.hemisphere}) already covered by ${seen[key]}`);
    seen[key] = g.file;
  }
}

if (errors) { console.error(`\n${errors} problem(s) in ${guides.length} guide(s).`); process.exit(1); }
console.log(`✓ ${guides.length} guides across ${Object.keys(byCrop).length} crops are valid.`);
