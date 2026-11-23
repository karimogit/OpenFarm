#!/usr/bin/env node
// Add sourced guides for climate regions that still had few primary crops.
//   node scripts/seed_sparse_region_guides.mjs --write
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

const write = process.argv.includes("--write");
const TODAY = new Date().toISOString().slice(0, 10);
const FOOTER = "\n## Notes\n\nPlanting months come from the cited extension or university source; harvest months are estimated from days to maturity where the source does not list them. General spacing and sowing facts are on the crop page.\n";

const GUIDES = [
  {
    crop: "kale",
    region: "subtropical-highland",
    title: "Kale in subtropical highland climates",
    koppen: ["Cwb", "Cwc"],
    reference_location: "Mexico City area / highland central Mexico",
    calendar: { sow_direct: [10, 11, 12, 1, 2, 3], harvest: [1, 2, 3, 4, 5, 6] },
    days_to_maturity: [55, 75],
    sun: "full-partial",
    water: "moderate",
    confidence: "low",
    uncertainty:
      "Cool-season leafy greens are typically planted in the drier winter half of the year in highland tropics; these months follow University of Minnesota's cool-crop window as a starting point, not a local study for Mexico City. Check frost at your elevation.",
    sources: [
      {
        title: "Planting the vegetable garden",
        publisher: "University of Minnesota Extension",
        url: "https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/planting-the-vegetable-garden",
      },
      {
        title: "Kale: grow your own",
        publisher: "Royal Horticultural Society (RHS)",
        url: "https://www.rhs.org.uk/vegetables/kale/grow-your-own",
      },
    ],
    summary:
      "Mild days, cool nights and a marked dry winter suit kale better than the wet summer. In highland cities, grow in the cool season and shelter from summer downpours.",
    timing: "Sow from late autumn through early spring when nights are cool and rain is lower.",
  },
  {
    crop: "potato",
    region: "subtropical-highland",
    title: "Potato in subtropical highland climates",
    koppen: ["Cwb", "Cwc"],
    reference_location: "Highland central Mexico / Andean foothills",
    calendar: { plant: [10, 11, 12, 1, 2], harvest: [1, 2, 3, 4, 5] },
    days_to_maturity: [85, 110],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty:
      "Potatoes need cool soil; UF/IFAS lists a cool-season window in subtropical South Florida. Highland tropics grow potatoes mainly in the dry cool season, but this calendar is not transcribed from a Mexico-specific source.",
    sources: ["uf-vh021"],
    summary: "Potatoes are a cool-season crop even near the tropics when grown at altitude.",
    timing: "Plant certified seed pieces once soil stays cool at the start of the dry season.",
  },
  {
    crop: "lettuce",
    region: "subtropical-highland",
    title: "Lettuce in subtropical highland climates",
    koppen: ["Cwb", "Cwc"],
    reference_location: "Mexico City area",
    calendar: { sow_direct: [10, 11, 12, 1, 2, 3], plant: [11, 12, 1, 2], harvest: [1, 2, 3, 4, 5] },
    days_to_maturity: [45, 70],
    sun: "partial",
    water: "moderate",
    confidence: "low",
    uncertainty: "Lettuce bolts quickly in heat; these cool-month plantings follow extension guidance for spring and autumn lettuce, adapted to highland dry winters.",
    sources: [
      {
        title: "Planting the vegetable garden",
        publisher: "University of Minnesota Extension",
        url: "https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/planting-the-vegetable-garden",
      },
      "ctahr-lettuce",
    ],
    summary: "Grow in the cool dry season; shade and steady moisture reduce bolting.",
    timing: "Sow or transplant during the coolest, drier months.",
  },
  {
    crop: "carrot",
    region: "subtropical-highland",
    title: "Carrot in subtropical highland climates",
    koppen: ["Cwb", "Cwc"],
    reference_location: "Mexico City area",
    calendar: { sow_direct: [10, 11, 12, 1, 2, 3], harvest: [1, 2, 3, 4, 5, 6] },
    days_to_maturity: [70, 120],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty: "Root quality is best in cool weather; months follow a cool-season sowing window similar to subtropical extension calendars.",
    sources: ["ctahr-carrot", "uf-vh021"],
    summary: "Sow in cool months for sweeter roots; avoid the warm wet season if possible.",
    timing: "Direct-sow in the dry cool half of the year.",
  },
  {
    crop: "bush-bean",
    region: "subtropical-highland",
    title: "Bush bean in subtropical highland climates",
    koppen: ["Cwb", "Cwc"],
    reference_location: "Mexico City area",
    calendar: { sow_direct: [3, 4, 5, 10, 11, 12], harvest: [5, 6, 7, 12, 1, 2] },
    days_to_maturity: [45, 60],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty: "Beans need warmth but not monsoon soaking; sow at the start and end of the rains or with irrigation in the dry season.",
    sources: ["uf-vh021"],
    summary: "Fast beans fit short warm breaks between cool and wet extremes.",
    timing: "Sow once soil is warm in late spring or before the heaviest rains.",
  },
  {
    crop: "lettuce",
    region: "tundra-polar",
    title: "Lettuce in tundra climates",
    koppen: ["ET"],
    reference_location: "Utqiaġvik / coastal Greenland (illustrative)",
    calendar: { sow_indoors: [3, 4], plant: [6, 7], harvest: [7, 8, 9] },
    sun: "partial",
    water: "moderate",
    confidence: "low",
    uncertainty:
      "Outdoor windows follow University of Alaska Fairbanks interior guidance for illustration; true tundra sites normally need a greenhouse, cold frame or polytunnel. Harvest months are approximate.",
    sources: ["uaf-gbg-note40", "uaf-ready-set-grow"],
    summary: "Treat as a protected crop; open ground is viable only in the brief midsummer thaw.",
    timing: "Start indoors weeks before the short outdoor window; plant out once soil warms.",
  },
  {
    crop: "kale",
    region: "tundra-polar",
    title: "Kale in tundra climates",
    koppen: ["ET"],
    reference_location: "Utqiaġvik / coastal Greenland (illustrative)",
    calendar: { sow_indoors: [3, 4], sow_direct: [6, 7], harvest: [8, 9] },
    sun: "full-partial",
    water: "moderate",
    confidence: "low",
    uncertainty: "Same caveat as lettuce: UAF dates illustrate timing; real tundra gardens rely on season extension.",
    sources: ["uaf-gbg-note40", "uaf-ready-set-grow"],
    summary: "Hardy kale still needs a protected plot where the frost-free period is measured in weeks.",
    timing: "Start early indoors; direct sow only in the warmest sheltered beds.",
  },
  {
    crop: "potato",
    region: "tundra-polar",
    title: "Potato in tundra climates",
    koppen: ["ET"],
    reference_location: "Utqiaġvik / coastal Greenland (illustrative)",
    calendar: { plant: [6], harvest: [8, 9] },
    days_to_maturity: [70, 90],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty: "Only very early varieties in a greenhouse or raised bed are realistic; calendar uses UAF June planting as a ceiling case.",
    sources: ["uaf-ready-set-grow"],
    summary: "Pre-sprouted seed tubers in a polytunnel are the practical option.",
    timing: "Plant pre-sprouted tubers as soon as the frost-free window opens.",
  },
  {
    crop: "carrot",
    region: "tundra-polar",
    title: "Carrot in tundra climates",
    koppen: ["ET"],
    reference_location: "Utqiaġvik / coastal Greenland (illustrative)",
    calendar: { sow_direct: [6, 7], harvest: [8, 9] },
    days_to_maturity: [70, 90],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty: "Slow germination needs warm soil; protected raised beds only.",
    sources: ["uaf-gbg-note40"],
    summary: "A midsummer sow in deep, sandy, warmed soil inside protection.",
    timing: "Sow when soil reaches carrot-germination temperature in a tunnel or frame.",
  },
  {
    crop: "radish",
    region: "tundra-polar",
    title: "Radish in tundra climates",
    koppen: ["ET"],
    reference_location: "Utqiaġvik / coastal Greenland (illustrative)",
    calendar: { sow_direct: [6, 7], harvest: [7, 8] },
    days_to_maturity: [25, 35],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty: "Quick crop for the brief summer; still needs a sheltered bed.",
    sources: ["uaf-gbg-note40"],
    summary: "One of the few roots that can mature inside a short protected season.",
    timing: "Sow successive small batches once the frame warms.",
  },
  {
    crop: "bush-bean",
    region: "tropical-rainforest",
    title: "Bush bean in tropical rainforest climates",
    koppen: ["Af"],
    reference_location: "Windward low-elevation Hawaiʻi (e.g. Hilo), USA",
    calendar: { sow_direct: [9, 10, 11, 12, 1, 2, 3, 4], harvest: [11, 12, 1, 2, 3, 4, 5, 6] },
    days_to_maturity: [45, 60],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty: "From UF/IFAS South Florida planting dates (Sept–Apr); constant rainfall in Af climates increases disease risk—prefer the slightly cooler months.",
    sources: ["uf-vh021"],
    summary: "Sow in the cooler, less saturated part of the year.",
    timing: "Direct-sow when nights are cooler and drainage is good.",
  },
  {
    crop: "zucchini",
    region: "tropical-rainforest",
    title: "Zucchini in tropical rainforest climates",
    koppen: ["Af"],
    reference_location: "Windward low-elevation Hawaiʻi (e.g. Hilo), USA",
    calendar: { sow_direct: [8, 9, 10, 11, 12, 1, 2, 3], harvest: [10, 11, 12, 1, 2, 3, 4, 5] },
    days_to_maturity: [40, 50],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty: "UF/IFAS lists summer squash from August through March in South Florida; powdery mildew and wet weather limit Af lowland crops.",
    sources: ["uf-vh021"],
    summary: "Fast summer squash during the least rainy months.",
    timing: "Sow when soil warms and air movement is adequate.",
  },
  {
    crop: "spinach",
    region: "tropical-rainforest",
    title: "Spinach in tropical rainforest climates",
    koppen: ["Af"],
    reference_location: "Windward low-elevation Hawaiʻi (e.g. Hilo), USA",
    calendar: { sow_direct: [10, 11, 12, 1, 2], harvest: [11, 12, 1, 2, 3, 4] },
    days_to_maturity: [45, 60],
    sun: "partial",
    water: "moderate",
    confidence: "low",
    uncertainty: "Spinach bolts in heat; UF/IFAS lists October–February for South Florida as the cool window.",
    sources: ["uf-vh021"],
    summary: "Cool-season spinach in the least hot months.",
    timing: "Sow in succession during the coolest quarter.",
  },
  {
    crop: "cucumber",
    region: "tropical-savanna",
    title: "Cucumber in tropical savanna climates",
    koppen: ["Aw"],
    reference_location: "South Florida, USA",
    calendar: { sow_direct: [9, 10, 11, 12, 1, 2], harvest: [11, 12, 1, 2, 3, 4] },
    days_to_maturity: [40, 65],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty: "From UF/IFAS September–February outdoor planting for South Florida; align sowing with available moisture at the end of the dry season.",
    sources: ["uf-vh021"],
    summary: "Sow when rains return or with irrigation as days shorten.",
    timing: "Direct-sow once nights cool and water is reliable.",
  },
  {
    crop: "beet",
    region: "cold-desert",
    title: "Beet in cold desert climates",
    koppen: ["BWk"],
    reference_location: "Reno, Nevada, USA",
    calendar: { sow_direct: [4, 5, 8], harvest: [6, 7, 9, 10] },
    days_to_maturity: [50, 70],
    sun: "full",
    water: "moderate",
    confidence: "low",
    uncertainty: "UNR lists cool-season direct seeding after mid-March through May plus an autumn cool crop; harvest months estimated from UF days-to-harvest range.",
    sources: ["unr-veg-garden", "uf-vh021"],
    summary: "Spring and autumn roots between desert heat and winter cold.",
    timing: "Sow in spring once soil can be worked; an autumn sowing before hard frost for greens and small roots.",
  },
];

function yamlList(key, vals) {
  return `${key}:\n${vals.map((v) => `  - ${v}`).join("\n")}`;
}

function render(g) {
  const calKeys = ["sow_indoors", "sow_direct", "plant", "harvest"];
  const calLines = calKeys.filter((k) => g.calendar[k]?.length).map((k) => `  ${k}: [${g.calendar[k].join(", ")}]`);
  const lines = [
    "---",
    `crop: ${g.crop}`,
    `region: ${g.region}`,
    `title: ${g.title}`,
    yamlList("koppen", g.koppen),
    "hemisphere: north",
    `reference_location: ${g.reference_location}`,
    "calendar:",
    ...calLines,
  ];
  if (g.days_to_maturity) lines.push(`days_to_maturity: [${g.days_to_maturity.join(", ")}]`);
  lines.push(`sun: ${g.sun}`, `water: ${g.water}`, `confidence: ${g.confidence}`, `uncertainty: >-`, `  ${g.uncertainty}`, "sources:");
  for (const s of g.sources) {
    if (typeof s === "string") lines.push(`  - ${s}`);
    else {
      lines.push("  - title: " + JSON.stringify(s.title));
      if (s.publisher) lines.push("    publisher: " + JSON.stringify(s.publisher));
      lines.push("    url: " + JSON.stringify(s.url));
    }
  }
  lines.push(
    "license: CC-BY-SA-4.0",
    "authors: [OpenFarm contributors]",
    `last_reviewed: ${TODAY}`,
    "---",
    "",
    "## Summary",
    "",
    g.summary,
    "",
    "## Timing",
    "",
    g.timing + FOOTER,
  );
  return lines.join("\n");
}

let written = 0;
for (const g of GUIDES) {
  const dir = path.join(ROOT, "content/guides", g.crop);
  const file = path.join(dir, `${g.region}.md`);
  if (fs.existsSync(file)) {
    console.log("skip (exists):", path.relative(ROOT, file));
    continue;
  }
  if (write) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, render(g));
    console.log("wrote:", path.relative(ROOT, file));
  } else console.log("would write:", path.relative(ROOT, file));
  written++;
}
console.log(write ? `✓ Wrote ${written} guide(s).` : `Dry run: ${written} guide(s). Use --write to create files.`);