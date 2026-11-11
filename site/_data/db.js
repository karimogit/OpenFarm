import { wmThumb, wmSrcset } from "../../scripts/wm.js";
// Builds one cross-linked view of all content for the templates.
import fs from "node:fs";
import path from "node:path";
import markdownIt from "markdown-it";
import {
  ROOT, loadCrops, loadVarieties, loadGuides, loadRegions, loadProblems, loadTools, loadSeedSources,
  loadCompanions, loadSources, resolveSources, koppenToRegion,
} from "../../scripts/content.js";

const md = markdownIt({ html: false, linkify: true, typographer: true });
const TYPE_LABELS = {
  vegetable: "Vegetables", legume: "Legumes", herb: "Herbs", spice: "Spices", fruit: "Fruit", "fruit-tree": "Fruit trees",
  berry: "Berries", nut: "Nuts", grain: "Grains & seeds", fungus: "Mushrooms", flower: "Flowers", "cover-crop": "Cover crops", other: "Other",
};

export default function () {
  const registry = loadSources();
  const images = JSON.parse(fs.readFileSync(path.join(ROOT, "data/images.json"), "utf8"));
  const seedFile = path.join(ROOT, "data/seed-images.json");
  const seedImages = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, "utf8")) : {};
  const regionsRaw = loadRegions();
  const kg2region = koppenToRegion(regionsRaw);
  const regions = regionsRaw.map((r) => ({ ...r.data, html: md.render(r.body), file: r.file, image: images[`region:${r.data.slug}`] || null, guides: [], varieties: [] }));
  const regionBy = Object.fromEntries(regions.map((r) => [r.slug, r]));

  const problems = loadProblems().map((p) => ({ ...p.data, html: md.render(p.body), file: p.file, sources: resolveSources(p.data.sources, registry) }));
  const problemBy = Object.fromEntries(problems.map((p) => [p.slug, p]));

  const crops = loadCrops().map((c) => {
    const d = c.data;
    return {
      ...d, file: c.file, html: md.render(c.body), seedImage: seedImages[`crop:${d.slug}`] || null, image: images[`crop:${d.slug}`] ? { ...images[`crop:${d.slug}`], note: d.image_note || null } : null,
      sources: resolveSources(d.sources, registry),
      hardiness: d.hardiness ? { ...d.hardiness, sources: resolveSources(d.hardiness.sources, registry) } : null,
      seed_saving: d.seed_saving ? { ...d.seed_saving, sources: resolveSources(d.seed_saving.sources, registry) } : null,
      perennial: d.perennial ? { ...d.perennial, sources: resolveSources(d.perennial.sources, registry) } : null,
      varieties: [], guides: [], companions: [], problemList: [],
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const cropBy = Object.fromEntries(crops.map((c) => [c.slug, c]));

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "Watermelon Radish" (crop Radish) → "Watermelon"; an explicit `cultivar` field wins.
  const cultivarOf = (d, crop) => d.cultivar || d.name.replace(new RegExp(`\\s+${esc(crop.name)}e?s?$`, "i"), "").trim() || d.name;
  const varieties = loadVarieties().map((v) => {
    const d = v.data; const crop = cropBy[d.crop];
    const own = images[`variety:${d.crop}/${d.slug}`];
    return {
      ...d, file: v.file, html: md.render(v.body), cropName: crop.name,
      // Cultivar epithet for the 'Cultivar' form, e.g. Solanum lycopersicum 'Sungold' (ICNCP style).
      cultivar: cultivarOf(d, crop),
      cultivarName: crop.scientific_name ? `${crop.scientific_name} '${cultivarOf(d, crop)}'` : null,
      image: own ? { ...own, note: d.image_note || null } : crop.image, imageInherited: !own && !!crop.image,
      sources: resolveSources(d.sources, registry),
      url: `/crops/${d.crop}/varieties/${d.slug}/`,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  for (const v of varieties) {
    cropBy[v.crop].varieties.push(v);
    for (const r of v.suitable_regions || []) regionBy[r]?.varieties.push(v);
  }

  const guides = loadGuides().map((g) => {
    const d = g.data; const crop = cropBy[d.crop]; const region = regionBy[d.region];
    return {
      ...d, file: g.file, html: md.render(g.body), cropName: crop.name, scientific_name: crop.scientific_name, family: crop.family,
      regionName: region.name, regionColor: region.color, url: `/guides/${d.crop}/${d.region}/`,
      sources: resolveSources(d.sources, registry),
      varietyList: (d.varieties || []).map((s) => varieties.find((v) => v.crop === d.crop && v.slug === s)),
      problemList: (d.problems || []).map((s) => problemBy[s]),
      // Other climate regions this guide's Köppen classes reach into.
      alsoRegions: [...new Set(d.koppen.map((k) => kg2region[k]).filter((r) => r !== d.region))].map((r) => regionBy[r]),
    };
  }).sort((a, b) => a.cropName.localeCompare(b.cropName) || regionBy[a.region].order - regionBy[b.region].order);
  for (const g of guides) {
    cropBy[g.crop].guides.push(g);
    for (const r of new Set([g.region, ...g.koppen.map((k) => kg2region[k])])) regionBy[r].guides.push({ g, primary: r === g.region });
  }

  for (const p of problems) for (const c of p.affects) cropBy[c]?.problemList.push(p);
  for (const c of crops) for (const s of c.problems || []) if (!c.problemList.includes(problemBy[s])) c.problemList.push(problemBy[s]);
  const companions = loadCompanions().map((c) => ({ ...c, sources: resolveSources(c.sources, registry) }));
  for (const c of companions) {
    const [a, b] = c.crops;
    cropBy[a]?.companions.push({ ...c, other: cropBy[b] });
    cropBy[b]?.companions.push({ ...c, other: cropBy[a] });
  }

  const tools = loadTools().map((x) => ({ ...x.data, file: x.file, html: md.render(x.body), url: `/tools/${x.data.slug}/`,
    sources: resolveSources(x.data.sources, registry), image: images[`tool:${x.data.slug}`] || null, crops: [], guides: [] }));
  const toolBy = Object.fromEntries(tools.map((x) => [x.slug, x]));
  for (const c of crops) { c.toolList = (c.tools || []).map((s) => toolBy[s]).filter(Boolean); for (const x of c.toolList) x.crops.push(c); }
  for (const g of guides) {
    g.toolList = [...new Set([...(g.tools || []), ...(cropBy[g.crop].tools || [])])].map((s) => toolBy[s]).filter(Boolean);
    for (const x of g.toolList) x.guides.push(g);
  }
  const seedSources = loadSeedSources().map((s) => ({ ...s.data, html: md.render(s.body) }));
  const types = Object.entries(TYPE_LABELS).map(([slug, label]) => ({ slug, label, crops: crops.filter((c) => c.type === slug) })).filter((t) => t.crops.length);

  // Small, browser-side index used by the location lookup and the "your region" boxes.
  const clientIndex = {
    regions: regions.map((r) => ({ slug: r.slug, name: r.name, koppen: r.koppen, color: r.color, similar: r.similar })),
    guides: guides.map((g) => ({
      crop: g.crop, name: g.cropName, region: g.region, title: g.title, koppen: g.koppen, hemisphere: g.hemisphere,
      calendar: g.calendar, confidence: g.confidence, type: cropBy[g.crop].type,
      sci: cropBy[g.crop].scientific_name || null,
      img: cropBy[g.crop].image ? { src: wmThumb(cropBy[g.crop].image, 250), srcset: wmSrcset(cropBy[g.crop].image, 250), w: cropBy[g.crop].image.orig_width || null, h: cropBy[g.crop].image.orig_height || null } : null,
    })),
    varieties: varieties.filter((v) => v.suitable_regions?.length).map((v) => ({ crop: v.crop, slug: v.slug, name: v.name, cropName: v.cropName, regions: v.suitable_regions })),
  };

  // Small catalogue for the profile page (names + card images), so favourites can be listed offline.
  const catalog = {
    crops: crops.map((c) => ({ slug: c.slug, name: c.name, sci: c.scientific_name || null,
      img: c.image ? { src: wmThumb(c.image, 250), srcset: wmSrcset(c.image, 250), w: c.image.orig_width || null, h: c.image.orig_height || null } : null })),
    varieties: varieties.map((v) => ({ crop: v.crop, slug: v.slug, name: v.name, cultivarName: v.cultivarName })),
  };

  const stats = {
    crops: crops.length, imported: crops.filter((c) => c.origin === "imported").length, curated: crops.filter((c) => c.origin === "curated").length,
    varieties: varieties.length, guides: guides.length, regions: regions.length,
    regionsWithGuides: regions.filter((r) => r.guides.some((x) => x.primary)).length,
    fruit: crops.filter((c) => ["fruit", "fruit-tree", "berry", "nut"].includes(c.type)).length,
    images: crops.filter((c) => c.image).length,
  };
  return { catalog, crops, cropBy, varieties, guides, regions, regionBy, problems, problemBy, companions, seedSources, tools, toolBy, types, clientIndex, stats, typeLabels: TYPE_LABELS };
}
