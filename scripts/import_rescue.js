#!/usr/bin/env node
// Imports the CC0 "OpenFarm Crops, Rescued" dataset (https://github.com/thefullnacho/openfarm-crops-rescue)
// into content/crops/<slug>.md and content/varieties/<crop>/<slug>.md.
//
//   node scripts/import_rescue.js [path/to/crops.json]
//
// Without a path it downloads crops.json from the pinned commit below. Re-running is safe:
// files with `origin: imported` are regenerated, hand-curated files (`origin: curated`) are never
// touched. If a curated file exists for a rescued record, the importer only reports it.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ROOT } from "./content.js";

const RESCUE_COMMIT = "754cfd75da007c17a628eca812632f326dc7cf10";
const RESCUE_URL = `https://raw.githubusercontent.com/thefullnacho/openfarm-crops-rescue/${RESCUE_COMMIT}/crops.json`;

// Records that are not crops, are exact duplicates of another record, or that we leave out on purpose.
const SKIP = {
  "human-being": "not a plant (junk record)",
  "carrots": "duplicate of carrot",
  "cherry-tomatoes": "duplicate of cherry-tomato",
  "heirloom-tomatoes": "duplicate of heirloom-tomato",
  "heirloom-tomato": "a category (open-pollinated old cultivars), not a crop – see tomato varieties",
  "peas": "duplicate of pea",
  "eggplant-black-beauty": "duplicate of black-beauty-eggplant",
  "cannabis": "legal status varies by country; left out of a general food-growing library",
};
const RENAME = { "swiss-chard-3": "swiss-chard" };

// Rescued records that are really cultivars/cultivar groups of another crop -> [crop, variety-slug].
const VARIETY_OF = {
  "brandywine-tomato": ["tomato", "brandywine"], "green-zebra-tomato": ["tomato", "green-zebra"],
  "mortgage-lifter-tomato": ["tomato", "mortgage-lifter"], "pineapple-tomato": ["tomato", "pineapple"],
  "striped-cavern-tomato": ["tomato", "striped-cavern"], "sunray-tomato": ["tomato", "sunray"],
  "tiny-tim-tomato": ["tomato", "tiny-tim"], "uf-micro-tom-tomato": ["tomato", "micro-tom"],
  "bonnie-little-bing-compact-cherry-tomato": ["tomato", "little-bing"],
  "bonnie-little-sicily-slicing-tomato-sfg": ["tomato", "little-sicily"],
  "burpee-bush-tomato-big-boy": ["tomato", "big-boy-bush"], "cherry-tomato": ["tomato", "cherry-group"],
  "fuji-apple": ["apple", "fuji"], "golden-delicious-apple": ["apple", "golden-delicious"], "granny-smith-apple": ["apple", "granny-smith"],
  "green-bartlett-pear": ["pear", "bartlett"], "red-danjou-pear": ["pear", "red-danjou"], "rainier-cherry": ["cherry", "rainier"],
  "van-zerden-garlic": ["garlic", "van-zerden"], "lacinato-kale": ["kale", "lacinato"], "red-russian-kale": ["kale", "red-russian"],
  "blue-lake-bean": ["bush-bean", "blue-lake"], "ferry-morse-contender-bush-bean": ["bush-bean", "contender"],
  "black-beauty-eggplant": ["eggplant", "black-beauty"], "french-breakfast-radish": ["radish", "french-breakfast"],
  "icicle-radish": ["radish", "icicle"], "watermelon-radish": ["radish", "watermelon"], "purple-daikon": ["daikon", "purple"],
  "lettuce-drunken-woman": ["lettuce", "drunken-woman"], "snow-man-carrot": ["carrot", "snow-man"],
  "purple-carrot": ["carrot", "purple"], "white-carrot": ["carrot", "white"], "baby-bear-pumpkin": ["pumpkin", "baby-bear"],
  "purple-cauliflower": ["cauliflower", "purple"], "yellow-cauliflower": ["cauliflower", "yellow"],
  "red-onion": ["onion", "red"], "white-onion": ["onion", "white"], "yellow-onion": ["onion", "yellow"],
  "red-cabbage": ["cabbage", "red"], "red-pointed-cabbage": ["cabbage", "red-pointed"], "pineberry": ["strawberry", "pineberry"],
  "sweet-basil": ["basil", "sweet"], "thai-basil": ["basil", "thai"], "golden-beet": ["beet", "golden"],
  "rainbow-chard": ["swiss-chard", "rainbow"],
  ...Object.fromEntries(["agria", "arran-banner", "chatham-hollomby", "chatham-island", "huakaroro-taewa", "matariki-taewa",
    "moemoe-taewa", "nadine", "pawhero", "scots", "suttons-supreme", "urenika-taewa", "wai-iti-taewa", "waikato",
    "waiporoporo-taewa", "whataroa-taewa", "whero-whero", "yellow-fir"].map((v) => [`${v}-potato`, ["potato", v]])),
};

// Crop type – curated by hand for every rescued slug (the dataset itself has no type field).
const TYPES = {
  "fruit-tree": "apple apricot bitter-orange blood-orange cherry black-cherry dekopon feijoa grapefruit guava lemon loquat mandarin mulberry nectarine olive orange papaya pawpaw pear persimmon plum pomegranate quince star-fruit strawberry-guava yellow-strawberry-guava sudachi tangerine trifoliate-orange durian ice-cream-bean avocado mango fig lime",
  nut: "almond black-walnut chestnut english-walnut hazelnut pistachio walnut",
  berry: "amelanchier black-currant blackberry blueberry lowbush-blueberry elderberry goji-berry gooseberry goumi-berry midgen-berry red-currant white-currant straggly-gooseberry strawberry raspberry",
  fruit: "banana cantaloupe dragon-fruit honeydew-melon melon passion-fruit pineapple watermelon cape-gooseberry kiwifruit hardy-kiwifruit grapes plantain",
  herb: "anise anise-hyssop apple-mint basil bay-laurel borage chervil chives chocolate-mint coriander culantro dill fennel feverfew garlic-chives german-chamomile kawakawa lemon-balm lemongrass licorice lovage marjoram mexican-tarragon mint mitsuba parsley pineapple-sage rosemary sage salad-burnet sorrel st-johns-wort stevia summer-savory tarragon rose-geranium oregano thyme",
  spice: "allspice cumin fenugreek galangal ginger myoga-ginger saffron turmeric",
  legume: "amberique-bean beach-pea black-eyed-pea chickpea cowpea fava-bean green-bean groundnut pea peanut purple-pod-bean rice-bean runner-bean snap-pea snow-pea soybean urad-bean wax-bean yardlong-bean bush-bean",
  "cover-crop": "alfalfa clover hairy-vetch phacelia lupine",
  grain: "amaranth purple-amaranth buckwheat corn oat quinoa sesame safflower",
  fungus: "portobello shiitake-mushroom wine-cap-mushroom",
  flower: "african-marigold burpee-cosmos-bright-light ferry-morse-lavender-munstead hibiscus honeysuckle milkweed morning-glory rose sunflower",
  other: "hemp common-hop hops mapacho oak sugar-maple wattle tea coffee",
};
const TYPE_OF = Object.fromEntries(Object.entries(TYPES).flatMap(([t, s]) => s.split(/\s+/).map((x) => [x, t])));

// Wikipedia articles for imported varieties that have one (used by scripts/fetch_images.js).
const VARIETY_WIKI = {
  "fuji-apple": "Fuji (apple)", "granny-smith-apple": "Granny Smith", "golden-delicious-apple": "Golden Delicious",
  "green-bartlett-pear": "Williams pear", "rainier-cherry": "Rainier cherry", "lacinato-kale": "Lacinato kale",
  "green-zebra-tomato": "Green Zebra", "mortgage-lifter-tomato": "Mortgage Lifter", "pineberry": "Pineberry",
  "thai-basil": "Thai basil", "red-cabbage": "Red cabbage", "red-onion": "Red onion",
};

const SUN = { "full sun": "full", "partial sun": "partial", "full shade": "shade" };
const PLACEHOLDER_NAME = /^you can grow anything$/i;
const titleCase = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
const cropName = (slug, raw) => (PLACEHOLDER_NAME.test((raw || "").trim()) ? titleCase(slug.replace(/-/g, " ")) : titleCase(raw));
const clean = (s) => (s && !/^add this information$/i.test(s.trim()) ? s.trim() : null);
// Keep only plausible binomials; the wiki had some wrong ones (e.g. an Acacia filed as a bush bean).
const binomial = (s) => {
  if (!s) return null;
  const v = s.trim();
  if (!/^[A-Za-z]+( |$)/.test(v) || /hybride/i.test(v)) return null;
  return v[0].toUpperCase() + v.slice(1);
};

function facts(r) {
  const out = {};
  const sci = binomial(r.binomialName); if (sci) out.scientific_name = sci;
  const sun = SUN[(r.sun || "").toLowerCase()]; if (sun) out.sun = sun;
  const sow = clean(r.sowingMethod); if (sow) out.sowing_method = sow;
  const size = {};
  if (r.spreadCm) size.spread_cm = r.spreadCm;
  if (r.rowSpacingCm) size.row_spacing_cm = r.rowSpacingCm;
  if (r.heightCm) size.height_cm = r.heightCm;
  if (Object.keys(size).length) out.size = size;
  return out;
}

function rescueBlock(r) {
  const b = { slug: r.slug, wayback_url: r.source.waybackUrl, captured: r.source.captured };
  if (r.taxon) b.taxon = r.taxon;
  if (r.companions?.length) b.companions_unverified = r.companions;
  if (r.growingDegreeDays) b.growing_degree_days_as_recorded = r.growingDegreeDays;
  if (r.tags?.length) b.tags = r.tags;
  return b;
}

function write(file, data, body) {
  if (fs.existsSync(file)) {
    const cur = matter(fs.readFileSync(file, "utf8")).data;
    if (cur.origin !== "imported") return "curated";
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = matter.stringify((body || "").trim() + "\n", data, { lineWidth: 110 });
  fs.writeFileSync(file, text);
  return "written";
}

const HEADER = "Imported from the CC0 OpenFarm rescue dataset. These are community wiki facts, unverified – never use them for edibility, foraging or plant-safety decisions. Improve them with a sourced pull request.";

async function main() {
  const src = process.argv[2];
  const records = src ? JSON.parse(fs.readFileSync(src, "utf8")) : await (await fetch(RESCUE_URL)).json();
  const stats = { crops: 0, varieties: 0, skipped: 0, curated: [] };
  const today = new Date().toISOString().slice(0, 10);
  for (const r of records) {
    if (SKIP[r.slug]) { stats.skipped++; continue; }
    const desc = clean(r.description);
    if (VARIETY_OF[r.slug]) {
      const [crop, slug] = VARIETY_OF[r.slug];
      const data = {
        crop, slug, name: titleCase(r.name.replace(/^(bonnie|burpee|ferry-morse)\s+/i, "")), origin: "imported",
        ...(VARIETY_WIKI[r.slug] ? { wikipedia: VARIETY_WIKI[r.slug] } : {}), ...facts(r),
        rescue: rescueBlock(r), sources: ["openfarm-rescue"], license: "CC0-1.0", imported: today, note: HEADER,
      };
      const res = write(path.join(ROOT, "content/varieties", crop, `${slug}.md`), data, desc);
      res === "written" ? stats.varieties++ : stats.curated.push(`varieties/${crop}/${slug}`);
      continue;
    }
    const slug = RENAME[r.slug] || r.slug;
    const type = TYPE_OF[slug] || "vegetable";
    const data = {
      slug, name: cropName(slug, r.name), type, origin: "imported", ...facts(r), rescue: rescueBlock(r),
      sources: ["openfarm-rescue"], license: "CC0-1.0", imported: today, note: HEADER,
    };
    const res = write(path.join(ROOT, "content/crops", `${slug}.md`), data, desc);
    res === "written" ? stats.crops++ : stats.curated.push(`crops/${slug}`);
  }
  console.log(`Imported ${stats.crops} crops and ${stats.varieties} varieties from ${records.length} rescued records (${stats.skipped} skipped).`);
  if (stats.curated.length) console.log(`Left ${stats.curated.length} hand-curated file(s) untouched: ${stats.curated.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
