#!/usr/bin/env node
// Backfill structured guide fields from existing prose or crop rescue size data.
// Only fills missing frontmatter; never overwrites hand-curated values.
//   node scripts/backfill_guide_fields.mjs        # dry run
//   node scripts/backfill_guide_fields.mjs --write
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ROOT, loadCrops, loadGuides } from "./content.js";

const write = process.argv.includes("--write");
const crops = loadCrops();
const cropBy = Object.fromEntries(crops.map((c) => [c.data.slug, c.data]));

const SPACING_FROM_CROP_NOTE =
  " In-row and row spacing above are copied from the general crop record (unverified rescue import), not region-specific.";

function parseDepth(body) {
  const patterns = [
    /(?:sow|Sow|plant|Plant|Put)\s[^.]{0,120}?(\d+(?:\.\d+)?)\s*(?:–|-|to)\s*(\d+(?:\.\d+)?)\s*cm\s*deep/i,
    /(?:sow|Sow|plant|Plant|Put)\s[^.]{0,80}?(\d+(?:\.\d+)?)\s*cm\s*deep/i,
    /(\d+(?:\.\d+)?)\s*cm\s*deep[^.]{0,40}(?:sow|Sow)/i,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (!m) continue;
    if (m[2]) return [Number(m[1]), Number(m[2])];
    const d = Number(m[1]);
    if (d > 0 && d < 50) return [d, d];
  }
  return null;
}

function parseSpacing(body) {
  let inRow = null;
  let between = null;
  const thin = body.match(/thin(?:\s+to)?\s+(\d+(?:\.\d+)?)\s*(?:–|-|to)\s*(\d+(?:\.\d+)?)\s*cm/i)
    || body.match(/thin(?:\s+to)?\s+(\d+(?:\.\d+)?)\s*cm/i);
  if (thin) inRow = thin[2] ? [Number(thin[1]), Number(thin[2])] : [Number(thin[1]), Number(thin[1])];
  const rows = body.match(/(\d+(?:\.\d+)?)\s*(?:–|-|to)\s*(\d+(?:\.\d+)?)\s*cm\s+between\s+rows/i)
    || body.match(/between\s+rows[^.]{0,30}?(\d+(?:\.\d+)?)\s*(?:–|-|to)\s*(\d+(?:\.\d+)?)\s*cm/i)
    || body.match(/rows?\s+(\d+(?:\.\d+)?)\s*cm\s+apart/i);
  if (rows) between = rows[2] ? [Number(rows[1]), Number(rows[2])] : [Number(rows[1]), Number(rows[1])];
  const grid = body.match(/(\d+(?:\.\d+)?)\s*(?:–|-|to)\s*(\d+(?:\.\d+)?)\s*cm\s+each\s+way/i);
  if (grid && !inRow) {
    const a = Number(grid[1]);
    const b = Number(grid[2] ?? grid[1]);
    inRow = [a, b];
    between = [a, b];
  }
  if (!inRow && !between) return null;
  return { in_row_cm: inRow, between_rows_cm: between };
}

function parseSoil(body) {
  const soil = {};
  const low = body.toLowerCase();
  if (/\bericaceous\b|acid soil|slightly acid|alkaline ground/i.test(body)) soil.ericaceous = true;
  if (/well[- ]drained|drains freely|free[- ]draining/i.test(low)) soil.drainage = "free-draining";
  else if (/moisture[- ]retentive|does not dry out|stay[s]? moist/i.test(low)) soil.drainage = "moisture-retentive";
  if (/rich soil|organic matter|compost/i.test(low) && !soil.notes) {
    const m = body.match(/[^.]{0,120}(?:rich|fertile|organic matter|compost)[^.]*\./i);
    if (m && m[0].length < 200) soil.notes = m[0].trim();
  }
  if (!Object.keys(soil).length) return null;
  return soil;
}

function parseWateringNote(body, water) {
  if (/keep (?:the )?soil moist|keep moist|water regularly|do not dry out/i.test(body)) {
    if (water === "high") return null;
    const m = body.match(/[^.]{0,100}(?:keep (?:the )?soil moist|keep moist|water regularly|do not dry out)[^.]*\./i);
    return m ? m[0].trim().slice(0, 320) : "Keep soil moist while plants establish.";
  }
  return null;
}

function spacingFromCrop(crop) {
  if (!crop?.size) return null;
  const { spread_cm, row_spacing_cm } = crop.size;
  const spacing = {};
  if (row_spacing_cm) spacing.between_rows_cm = [row_spacing_cm, row_spacing_cm];
  if (spread_cm) spacing.in_row_cm = [spread_cm, spread_cm];
  return Object.keys(spacing).length ? spacing : null;
}

const stats = { depth: 0, spacingBody: 0, spacingCrop: 0, soil: 0, waterNote: 0 };

for (const g of loadGuides()) {
  const full = path.join(ROOT, g.file);
  const parsed = matter(fs.readFileSync(full, "utf8"));
  const d = { ...parsed.data };
  let changed = false;
  const body = parsed.content;

  if (!d.sowing_depth_cm) {
    const depth = parseDepth(body);
    if (depth) {
      d.sowing_depth_cm = depth;
      stats.depth++;
      changed = true;
    }
  }

  if (!d.spacing?.in_row_cm && !d.spacing?.between_rows_cm) {
    const sp = parseSpacing(body) || spacingFromCrop(cropBy[d.crop]);
    if (sp) {
      d.spacing = { ...(d.spacing || {}), ...sp };
      if (parseSpacing(body)) stats.spacingBody++;
      else {
        stats.spacingCrop++;
        if (d.uncertainty && !d.uncertainty.includes(SPACING_FROM_CROP_NOTE.trim())) {
          d.uncertainty += SPACING_FROM_CROP_NOTE;
        } else if (!d.uncertainty) {
          d.uncertainty = SPACING_FROM_CROP_NOTE.trim();
        }
      }
      changed = true;
    }
  } else if (d.spacing) {
    const sp = parseSpacing(body);
    if (sp) {
      if (!d.spacing.in_row_cm && sp.in_row_cm) { d.spacing.in_row_cm = sp.in_row_cm; changed = true; stats.spacingBody++; }
      if (!d.spacing.between_rows_cm && sp.between_rows_cm) { d.spacing.between_rows_cm = sp.between_rows_cm; changed = true; stats.spacingBody++; }
    }
  }

  if (!d.soil) {
    const soil = parseSoil(body);
    if (soil) {
      d.soil = soil;
      stats.soil++;
      changed = true;
    }
  }

  if (!d.watering_note) {
    const note = parseWateringNote(body, d.water);
    if (note) {
      d.watering_note = note;
      stats.waterNote++;
      changed = true;
    }
  }

  if (changed && write) {
    if (d.last_reviewed) {
      const lr = d.last_reviewed;
      d.last_reviewed = lr instanceof Date ? lr.toISOString().slice(0, 10) : String(lr).replace(/T.*/, "");
    }
    const out = matter.stringify(body.trim() + "\n", d, { lineWidth: 110 });
    fs.writeFileSync(full, out.endsWith("\n") ? out : out + "\n");
  }
}

console.log(write ? "Wrote updates:" : "Would update (dry run):", stats);
if (!write) console.log("Re-run with --write to apply.");
