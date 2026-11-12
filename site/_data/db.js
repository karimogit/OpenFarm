import { wmThumb, wmSrcset } from "../../scripts/wm.js";
import { zoneCovers } from "../../scripts/zones.js";
import { scientificMarkup, scientificText } from "../../scripts/sci.js";
// Builds one cross-linked view of all content for the templates.
import fs from "node:fs";
import path from "node:path";
import markdownIt from "markdown-it";
import {
  ROOT, loadCrops, loadVarieties, loadGuides, loadRegions, loadProblems, loadTools, loadSeedSources,
  loadCompanions, loadRotation, loadSources, resolveSources, koppenToRegion,
} from "../../scripts/content.js";
import {
  mapViewFromBbox, mapBoundsFromBbox, loadOutlines, loadKoppenLookup, svgPathForOutline,
  shiftCalendar, selectPlacePageCities, PLACE_PAGE_NOTE, citySourceBbox, CITY_BBOX_PAD, CITY_ZOOM,
} from "../../scripts/geo_pages.js";

const md = markdownIt({ html: false, linkify: true, typographer: true });
const TYPE_LABELS = {
  vegetable: "Vegetables", legume: "Legumes", herb: "Herbs", spice: "Spices", fruit: "Fruit", "fruit-tree": "Fruit trees",
  berry: "Berries", nut: "Nuts", grain: "Grains & seeds", fungus: "Mushrooms", flower: "Flowers", "cover-crop": "Cover crops", other: "Other",
};
const TOOL_CATEGORIES = [
  { slug: "digging", label: "Digging & soil" },
  { slug: "weeding", label: "Weeding & cultivating" },
  { slug: "planting", label: "Planting & sowing" },
  { slug: "watering", label: "Watering & irrigation" },
  { slug: "pruning", label: "Pruning & cutting" },
  { slug: "harvesting", label: "Harvesting" },
  { slug: "protection", label: "Protection & season extension" },
  { slug: "supports", label: "Supports & structures" },
  { slug: "compost", label: "Compost & soil health" },
  { slug: "measuring", label: "Measuring & testing" },
  { slug: "carrying", label: "Carrying & storage" },
];

export default function () {
  const registry = loadSources();
  const images = JSON.parse(fs.readFileSync(path.join(ROOT, "data/images.json"), "utf8"));
  const seedFile = path.join(ROOT, "data/seed-images.json");
  const seedImages = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, "utf8")) : {};
  const regionsRaw = loadRegions();
  const kg2region = koppenToRegion(regionsRaw);
  const examplePlacesOf = (ex) => Array.isArray(ex) ? ex : [];
  const exampleCountriesOf = (places) => {
    const seen = new Set();
    const out = [];
    for (const p of places || []) {
      const cc = (p.country || "").toString().trim();
      if (!cc) continue;
      const key = cc.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cc);
    }
    return out;
  };
  const examplesTextOf = (ex) => Array.isArray(ex)
    ? ex.map((p) => p.note ? `${p.name} (${p.note})` : p.name).join(", ")
    : (ex || "");
  const regions = regionsRaw.map((r) => ({
    ...r.data,
    html: md.render(r.body), file: r.file, image: images[`region:${r.data.slug}`] || null,
    examplePlaces: examplePlacesOf(r.data.examples),
    examples: examplesTextOf(r.data.examples),
    guides: [], varieties: [],
  }));
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
      varieties: [], groups: [], guides: [], varietyGuides: [], companions: [], problemList: [], rotation: null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const cropBy = Object.fromEntries(crops.map((c) => [c.slug, c]));

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "Watermelon Radish" (crop Radish) → "Watermelon"; an explicit `cultivar` field wins.
  const cultivarOf = (d, crop) => d.cultivar || d.name.replace(new RegExp(`\\s+${esc(crop.name)}e?s?$`, "i"), "").trim() || d.name;
  const allVarietyRecords = loadVarieties().map((v) => {
    const d = v.data; const crop = cropBy[d.crop];
    const own = images[`variety:${d.crop}/${d.slug}`];
    const kind = d.kind === "group" ? "group" : "variety";
    return {
      ...d, kind, file: v.file, html: md.render(v.body), cropName: crop?.name,
      // Cultivar epithet for the 'Cultivar' form; cultivar *groups* use the ICNCP "Name Group" form, not quotes.
      cultivar: kind === "group" ? null : (crop ? cultivarOf(d, crop) : d.name),
      cultivarName: kind === "group"
        ? (crop?.scientific_name ? `${crop.scientific_name} ${d.name} Group` : null)
        : (crop?.scientific_name ? `${crop.scientific_name} '${cultivarOf(d, crop)}'` : null),
      sciHtml: kind === "group"
        ? (scientificMarkup(d.scientific_name, crop?.scientific_name, null) + (crop?.scientific_name || d.scientific_name ? ` ${String(d.name).replace(/&/g, "&amp;").replace(/</g, "&lt;")} Group` : ""))
        : scientificMarkup(d.scientific_name, crop?.scientific_name, crop ? cultivarOf(d, crop) : (d.cultivar || d.name)),
      sciText: kind === "group"
        ? scientificText(d.scientific_name, crop?.scientific_name, null) + (crop?.scientific_name || d.scientific_name ? ` ${d.name} Group` : "")
        : scientificText(d.scientific_name, crop?.scientific_name, crop ? cultivarOf(d, crop) : (d.cultivar || d.name)),
      image: own ? { ...own, note: d.image_note || null } : crop?.image, imageInherited: !own && !!crop?.image,
      sources: resolveSources(d.sources, registry),
      url: `/crops/${d.crop}/${d.slug}/`,
      legacyUrl: `/crops/${d.crop}/varieties/${d.slug}/`,
      members: [], guides: [],
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const groupByKey = Object.fromEntries(allVarietyRecords.filter((v) => v.kind === "group").map((g) => [`${g.crop}/${g.slug}`, g]));
  const varieties = allVarietyRecords.filter((v) => v.kind !== "group");
  const groups = allVarietyRecords.filter((v) => v.kind === "group");
  for (const v of varieties) {
    if (v.group) {
      const g = groupByKey[`${v.crop}/${v.group}`];
      if (g) { v.groupRecord = g; g.members.push(v); }
    }
    cropBy[v.crop]?.varieties.push(v);
    for (const r of v.suitable_regions || []) regionBy[r]?.varieties.push(v);
  }
  for (const g of groups) cropBy[g.crop]?.groups.push(g);

  const varietyRedirects = [];
  for (const v of allVarietyRecords) {
    varietyRedirects.push({ from: v.legacyUrl, to: v.url, name: v.name });
    for (const old of v.redirect_from || []) {
      varietyRedirects.push({ from: `/crops/${v.crop}/${old}/`, to: v.url, name: v.name });
      varietyRedirects.push({ from: `/crops/${v.crop}/varieties/${old}/`, to: v.url, name: v.name });
    }
  }

  const guides = loadGuides().map((g) => {
    const d = g.data; const crop = cropBy[d.crop]; const region = regionBy[d.region];
    const varietySlug = g.variety || d.variety || null;
    const url = varietySlug ? `/crops/${d.crop}/${varietySlug}/${d.region}/` : `/crops/${d.crop}/${d.region}/`;
    const legacyUrl = varietySlug ? `/guides/${d.crop}/${varietySlug}/${d.region}/` : `/guides/${d.crop}/${d.region}/`;
    return {
      ...d, variety: varietySlug, file: g.file, html: md.render(g.body), cropName: crop.name, scientific_name: crop.scientific_name, family: crop.family,
      regionName: region.name, regionColor: region.color, url, legacyUrl,
      favId: varietySlug ? `${d.crop}/${varietySlug}/${d.region}` : `${d.crop}/${d.region}`,
      examplePlaces: region.examplePlaces, exampleCountries: exampleCountriesOf(region.examplePlaces), examplesText: region.examples,
      sources: resolveSources(d.sources, registry),
      varietyList: (d.varieties || []).map((s) => varieties.find((v) => v.crop === d.crop && v.slug === s)),
      problemList: (d.problems || []).map((s) => problemBy[s]),
      // Other climate regions this guide's Köppen classes reach into.
      alsoRegions: [...new Set(d.koppen.map((k) => kg2region[k]).filter((r) => r !== d.region))].map((r) => regionBy[r]),
    };
  }).sort((a, b) => a.cropName.localeCompare(b.cropName) || regionBy[a.region].order - regionBy[b.region].order);
  const guideRedirects = guides.map((g) => ({ from: g.legacyUrl, to: g.url, name: g.title || `${g.cropName} in ${g.regionName}` }));

  const varietyByKey = Object.fromEntries(varieties.map((v) => [`${v.crop}/${v.slug}`, v]));
  for (const g of guides) {
    if (g.variety) {
      const v = varietyByKey[`${g.crop}/${g.variety}`];
      if (v) v.guides.push(g);
      cropBy[g.crop].varietyGuides.push(g);
    } else {
      cropBy[g.crop].guides.push(g);
    }
    for (const r of new Set([g.region, ...g.koppen.map((k) => kg2region[k])])) regionBy[r].guides.push({ g, primary: r === g.region && !g.variety });
  }

  for (const p of problems) for (const c of p.affects) cropBy[c]?.problemList.push(p);
  for (const c of crops) for (const s of c.problems || []) if (!c.problemList.includes(problemBy[s])) c.problemList.push(problemBy[s]);
  const companions = loadCompanions().map((c) => ({ ...c, sources: resolveSources(c.sources, registry) }));
  for (const c of companions) {
    const [a, b] = c.crops;
    cropBy[a]?.companions.push({ ...c, other: cropBy[b] });
    cropBy[b]?.companions.push({ ...c, other: cropBy[a] });
  }

  const rotationRaw = loadRotation();
  const rotationGroups = (rotationRaw.groups || []).map((g) => ({ ...g, sources: resolveSources(g.sources, registry), crops: [] }));
  const rotationGroupBy = Object.fromEntries(rotationGroups.map((g) => [g.slug, g]));
  const familyToGroup = {};
  for (const g of rotationGroups) for (const f of g.families || []) familyToGroup[f] = g;
  const cropToGroup = {};
  for (const g of rotationGroups) for (const s of g.crops || []) cropToGroup[s] = g;
  for (const c of crops) {
    const g = cropToGroup[c.slug] || (c.family && familyToGroup[c.family]) || null;
    if (!g) continue;
    if (!g.crops.includes(c)) g.crops.push(c);
    c.rotationGroup = g;
  }
  const rotationRules = (rotationRaw.rules || []).map((r) => ({ ...r, sources: resolveSources(r.sources, registry),
    fromGroup: r.from ? rotationGroupBy[r.from] : (r.group ? rotationGroupBy[r.group] : null),
    toGroup: r.to ? rotationGroupBy[r.to] : null }));
  for (const c of crops) {
    if (!c.rotationGroup) continue;
    const slug = c.rotationGroup.slug;
    c.rotationRules = rotationRules.filter((r) => r.from === slug || r.to === slug || r.group === slug);
  }

  const catLabel = Object.fromEntries(TOOL_CATEGORIES.map((c) => [c.slug, c.label]));
  const tools = loadTools().map((x) => ({ ...x.data, file: x.file, html: md.render(x.body), url: `/tools/${x.data.slug}/`,
    categoryLabel: catLabel[x.data.category] || x.data.category,
    sources: resolveSources(x.data.sources, registry), image: images[`tool:${x.data.slug}`] || null, crops: [], guides: [] }));
  const toolBy = Object.fromEntries(tools.map((x) => [x.slug, x]));
  for (const t of tools) t.allCategories = [...new Set([t.category, ...(t.categories || [])])];
  const toolCategories = TOOL_CATEGORIES.map((c) => ({ ...c, tools: tools.filter((t) => t.allCategories.includes(c.slug)) })).filter((c) => c.tools.length);
  for (const c of crops) { c.toolList = (c.tools || []).map((s) => toolBy[s]).filter(Boolean); for (const x of c.toolList) x.crops.push(c); }
  for (const t of tools) t.directGuides = [];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const SUN = { full: "Full sun", "full-partial": "Full sun to part shade", partial: "Part shade", shade: "Shade" };
  const WATER = { low: "low", moderate: "moderate", high: "high" };
  const rangeText = (r, unit) => (Array.isArray(r) && r.length >= 2 ? (r[0] === r[1] ? `${r[0]}${unit}` : `${r[0]}–${r[1]}${unit}`) : "");
  const TOOL_HINT = {
    sow_indoors: { slugs: ["seed-trays", "dibber", "soil-thermometer"] },
    sow_direct: { slugs: ["garden-line", "dibber", "hoe"] },
    plant: { slugs: ["transplanter", "trowel", "dibber"] },
    harvest: { slugs: ["harvest-knife", "trug", "potato-fork"] },
    prune: { slugs: ["pruning-shears", "loppers", "pruning-saw"] },
  };
  const toolNames = (list, spec) => {
    const names = [];
    for (const slug of spec.slugs) {
      const t = list.find((x) => x.slug === slug);
      if (t && names.length < 2) names.push(t.name);
    }
    return names;
  };
  const calendarNotes = (g) => {
    const list = g.toolList || [];
    const notes = {};
    for (const [key, spec] of Object.entries(TOOL_HINT)) {
      const extra = [];
      if (key === "sow_direct" && g.sun) extra.push(`${SUN[g.sun] || g.sun}${g.water ? `, ${WATER[g.water] || g.water} water` : ""}`);
      else if (key === "plant" && g.spacing) {
        const bits = [];
        if (g.spacing.in_row_cm) bits.push(`${rangeText(g.spacing.in_row_cm, " cm")} in the row`);
        if (g.spacing.between_rows_cm) bits.push(`rows ${rangeText(g.spacing.between_rows_cm, " cm")}`);
        if (bits.length) extra.push(`Space ${bits.join(", ")}`);
      } else if (key === "harvest" && Array.isArray(g.days_to_maturity)) extra.push(`${rangeText(g.days_to_maturity, " days")} to maturity`);
      const names = toolNames(list, spec).slice(0, extra.length ? 1 : 2);
      if (names.length) extra.push(`Tools: ${names.join(", ")}`);
      notes[key] = extra.length ? `. ${extra.join(". ")}` : "";
    }
    return notes;
  };
  for (const g of guides) {
    g.toolList = [...new Set([...(g.tools || []), ...(cropBy[g.crop].tools || [])])].map((s) => toolBy[s]).filter(Boolean);
    for (const x of g.toolList) x.guides.push(g);
    for (const s of g.tools || []) toolBy[s]?.directGuides.push(g);
    g.calNotes = calendarNotes(g);
  }
  const seedSources = loadSeedSources().map((s) => ({ ...s.data, html: md.render(s.body) }));
  const types = Object.entries(TYPE_LABELS).map(([slug, label]) => ({ slug, label, crops: crops.filter((c) => c.type === slug) })).filter((t) => t.crops.length);

  // Small, browser-side index used by the location lookup and the "your region" boxes.
  const clientIndex = {
    regions: regions.map((r) => ({ slug: r.slug, name: r.name, koppen: r.koppen, color: r.color, similar: r.similar })),
    guides: guides.map((g) => ({
      crop: g.crop, name: g.cropName, region: g.region, variety: g.variety || null, title: g.title, url: g.url, favId: g.favId, koppen: g.koppen, hemisphere: g.hemisphere,
      calendar: g.calendar, confidence: g.confidence, type: cropBy[g.crop].type,
      sci: cropBy[g.crop].scientific_name || null,
      img: cropBy[g.crop].image ? { src: wmThumb(cropBy[g.crop].image, 250), srcset: wmSrcset(cropBy[g.crop].image, 250), w: cropBy[g.crop].image.orig_width || null, h: cropBy[g.crop].image.orig_height || null } : null,
    })),
    varieties: varieties.filter((v) => v.suitable_regions?.length).map((v) => ({ crop: v.crop, slug: v.slug, name: v.name, cropName: v.cropName, regions: v.suitable_regions, url: v.url })),
  };

  // Small catalogue for the profile page (names + card images), so favourites can be listed offline.
  const catalog = {
    crops: crops.map((c) => ({ slug: c.slug, name: c.name, sci: c.scientific_name || null,
      img: c.image ? { src: wmThumb(c.image, 250), srcset: wmSrcset(c.image, 250), w: c.image.orig_width || null, h: c.image.orig_height || null } : null })),
    varieties: varieties.map((v) => ({ crop: v.crop, slug: v.slug, name: v.name, cultivarName: v.cultivarName, sci: v.sciText, sciHtml: v.sciHtml, group: v.group || null, url: v.url })),
    tools: tools.map((t) => ({
      slug: t.slug, name: t.name, url: t.url,
      img: t.image ? { src: wmThumb(t.image, 250), srcset: wmSrcset(t.image, 250), w: t.image.orig_width || null, h: t.image.orig_height || null } : null,
    })),
  };


  const zoneHalf = [];
  for (let i = 0; i < 26; i++) {
    const n = Math.floor(i / 2) + 1, half = i % 2 ? "b" : "a";
    const minF = -60 + i * 5, maxF = minF + 5;
    const toC = (f) => Math.round(((f - 32) * 50) / 9) / 10;
    zoneHalf.push({
      slug: `${n}${half}`, index: i, zone: n, half,
      min_f: minF, max_f: maxF, min_c: toC(minF), max_c: toC(maxF),
      label: `Zone ${n}${half}`,
      url: `/zones/${n}${half}/`,
    });
  }
  for (const z of zoneHalf) {
    z.plants = crops.filter((c) => c.hardiness?.min && c.hardiness?.max && zoneCovers(c.hardiness.min, c.hardiness.max, z.index))
      .map((c) => ({ slug: c.slug, name: c.name, url: `/crops/${c.slug}/`, min: c.hardiness.min, max: c.hardiness.max }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }


  // Country pages: GeoNames names/cities (CC BY 4.0) + Beck/Natural Earth climate shares.
  const countryNames = JSON.parse(fs.readFileSync(path.join(ROOT, "data/countries.json"), "utf8"));
  const climatePack = JSON.parse(fs.readFileSync(path.join(ROOT, "data/country-climates.json"), "utf8"));
  const placesPack = JSON.parse(fs.readFileSync(path.join(ROOT, "data/places.json"), "utf8"));
  const flagDir = path.join(ROOT, "site/assets/flags");
  const hasFlag = (iso) => fs.existsSync(path.join(flagDir, `${iso.toLowerCase()}.svg`));
  const normPlace = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const slugifyPlace = (s) => normPlace(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const adminSlugOf = (hit) => {
    const admin = hit.admin;
    if (!admin) return "";
    if (/^[A-Za-z]{1,3}$/.test(admin)) return admin.toLowerCase();
    const name = placesPack.admin1?.[`${hit.cc}.${admin}`];
    return slugifyPlace(name || admin);
  };
  const cityBaseSlug = (hit) => `${slugifyPlace(hit.ascii || hit.name)}-${String(hit.cc || "").toLowerCase()}`;
  const cityHits = (placesPack.cities || []).map((c) => {
    const [name, ascii, cc, admin, lat, lon, pop] = c;
    return { type: "city", name, ascii, cc, admin, lat, lon, pop: pop || 0 };
  });
  const cityCounts = new Map();
  for (const c of cityHits) cityCounts.set(cityBaseSlug(c), (cityCounts.get(cityBaseSlug(c)) || 0) + 1);
  const citySlugs = new Set();
  for (const c of cityHits) {
    const base = cityBaseSlug(c);
    let slug = cityCounts.get(base) > 1
      ? `${slugifyPlace(c.ascii || c.name)}-${adminSlugOf(c)}-${String(c.cc || "").toLowerCase()}`
      : base;
    if (citySlugs.has(slug)) slug = `${slug}-${String(c.lat).replace(".", "p")}`;
    c.slug = slug;
    citySlugs.add(slug);
  }
  const citiesByCc = {};
  for (const c of cityHits) (citiesByCc[c.cc] ||= []).push(c);
  for (const list of Object.values(citiesByCc)) list.sort((a, b) => b.pop - a.pop);

  const outlinesPack = loadOutlines();
  const koppenLookup = loadKoppenLookup();

  const growsWellFor = (regionShares) => {
    const groups = [];
    for (const r of regionShares) {
      const items = [];
      for (const crop of crops) {
        const g = (crop.guides || []).find((x) => x.region === r.slug && !x.variety && (x.sources || []).length);
        if (!g) continue;
        items.push({
          slug: crop.slug, name: crop.name, scientific_name: crop.scientific_name || null, type: crop.type,
          image: crop.image, guideUrl: g.url, calendar: g.calendar || null, hemisphere: g.hemisphere || null,
          hardiness: crop.hardiness ? { min: crop.hardiness.min, max: crop.hardiness.max } : null,
        });
      }
      items.sort((a, b) => a.name.localeCompare(b.name));
      if (items.length) groups.push({ slug: r.slug, name: r.name, color: r.color, share: r.share, url: r.url, crops: items });
    }
    return groups;
  };


  const countries = Object.entries(countryNames).map(([iso2, name]) => {
    const meta = placesPack.countries?.[iso2] || [];
    const [gnName, capital, clat, clon, pop] = [meta[0], meta[1], meta[2], meta[3], meta[4]];
    const climate = climatePack.countries[iso2] || null;
    const regionShares = climate
      ? Object.entries(climate.regions).map(([slug, share]) => ({ slug, name: regionBy[slug]?.name || slug, color: regionBy[slug]?.color, share, url: `/regions/${slug}/` }))
      : [];
    const cityList = (citiesByCc[iso2] || []).slice(0, 12).map((c) => ({
      name: c.name, slug: c.slug, lat: c.lat, lon: c.lon, pop: c.pop, admin: c.admin,
      adminName: placesPack.admin1?.[`${c.cc}.${c.admin}`] || null,
      placeUrl: `/?place=${encodeURIComponent(c.slug)}`,
    }));
    let capitalCity = null;
    if (capital) {
      const want = normPlace(capital);
      capitalCity = (citiesByCc[iso2] || []).find((c) => normPlace(c.name) === want || normPlace(c.ascii) === want) || null;
    }
    return {
      iso2,
      iso2Lower: iso2.toLowerCase(),
      name: gnName || name,
      capital: capital || null,
      capitalPlace: capitalCity ? { name: capitalCity.name, slug: capitalCity.slug, placeUrl: `/?place=${encodeURIComponent(capitalCity.slug)}` } : null,
      lat: clat ?? null,
      lon: clon ?? null,
      population: pop || 0,
      hasFlag: hasFlag(iso2),
      url: `/countries/${iso2.toLowerCase()}/`,
      climate,
      climateMethod: climate?.method || null,
      regionShares,
      koppen: climate ? Object.entries(climate.koppen).map(([code, share]) => ({ code, share })) : [],
      mapView: mapViewFromBbox(climate?.map_bbox || climate?.bbox || (clat != null && clon != null ? [clon - 1, clat - 0.7, clon + 1, clat + 0.7] : null)),
      mapBounds: mapBoundsFromBbox(climate?.map_bbox || climate?.bbox || (clat != null && clon != null ? [clon - 1, clat - 0.7, clon + 1, clat + 0.7] : null)),
      outline: outlinesPack.countries[iso2] || null,
      outlineAttribution: outlinesPack.attribution || null,
      cities: cityList,
      seedSources: seedSources.filter((s) => (s.countries || []).includes(iso2)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  for (const c of countries) {
    c.svgPath = svgPathForOutline(c.outline, c.mapView);
    c.growsWell = growsWellFor(c.regionShares);
  }
  const countryBy = Object.fromEntries(countries.map((c) => [c.iso2, c]));
  for (const r of regions) {
    r.countries = countries
      .filter((c) => c.regionShares.some((x) => x.slug === r.slug && x.share >= 1))
      .map((c) => {
        const share = c.regionShares.find((x) => x.slug === r.slug).share;
        return { iso2: c.iso2, iso2Lower: c.iso2Lower, name: c.name, url: c.url, hasFlag: c.hasFlag, share, method: c.climateMethod };
      })
      .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
  }

  // City pages: capitals + the most populous cities already listed on each country page (up to 12).
  const placePageCities = selectPlacePageCities(cityHits, placesPack);
  const placePageSlugs = new Set(placePageCities.map((c) => c.slug));
  const places = placePageCities.map((c) => {
    const country = countryBy[c.cc] || null;
    const kg = (c.lat != null && c.lon != null) ? koppenLookup(c.lat, c.lon) : null;
    const region = kg?.symbol ? regionBy[kg2region[kg.symbol]] : null;
    const regionShares = region ? [{ slug: region.slug, name: region.name, color: region.color, share: null, url: `/regions/${region.slug}/` }] : [];
    const growsWell = growsWellFor(regionShares);
    const south = c.lat < 0, tropical = !!(kg?.symbol && kg.symbol[0] === "A");
    const calendarRows = [];
    let calendarShifted = false;
    for (const group of growsWell) {
      for (const item of group.crops) {
        let cal = item.calendar, shifted = false;
        if (cal && south && item.hemisphere === "north" && !tropical) {
          cal = shiftCalendar(cal, 6);
          shifted = true;
          calendarShifted = true;
        }
        if (cal && (cal.sow_indoors || cal.sow_direct || cal.plant || cal.harvest || cal.prune)) {
          const jobs = [["sow_indoors", "sow indoors"], ["sow_direct", "sow outside"], ["plant", "plant out"], ["prune", "prune"], ["harvest", "harvest"]];
          const tips = MONTHS.map((month, i) => {
            const bits = jobs.filter(([k]) => (cal[k] || []).includes(i + 1)).map(([, label]) => label);
            return bits.length ? `${item.name} in ${month}: ${bits.join(", ")}` : "";
          });
          calendarRows.push({ slug: item.slug, name: item.name, type: item.type, guideUrl: item.guideUrl, calendar: cal, shifted, tips });
        }
      }
    }
    const bbox = citySourceBbox(c.lat, c.lon);
    const mapView = mapViewFromBbox(bbox, CITY_BBOX_PAD);
    return {
      slug: c.slug, name: c.name, ascii: c.ascii, cc: c.cc, admin: c.admin,
      adminName: placesPack.admin1[`${c.cc}.${c.admin}`] || null,
      lat: c.lat, lon: c.lon, population: c.pop || 0,
      url: `/places/${c.slug}/`,
      queryUrl: `/?place=${encodeURIComponent(c.slug)}`,
      countryName: country?.name || c.cc, countryUrl: country ? country.url : `/countries/${String(c.cc || "").toLowerCase()}/`,
      isCapital: !!(country && country.capitalPlace && country.capitalPlace.slug === c.slug),
      kg: kg && kg.symbol ? { symbol: kg.symbol, nearest: !!kg.nearest, code: kg.code } : null,
      region: region ? { slug: region.slug, name: region.name, color: region.color, url: `/regions/${region.slug}/` } : null,
      growsWell,
      calendarRows,
      calendarShifted,
      mapZoom: CITY_ZOOM,
      mapView,
      mapBounds: mapBoundsFromBbox(bbox, CITY_BBOX_PAD),
      outline: country?.outline || null,
      svgPath: svgPathForOutline(country?.outline || null, mapView),
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.cc.localeCompare(b.cc));
  const placeBySlug = Object.fromEntries(places.map((p) => [p.slug, p]));
  // Country city lists (and capital) point at the standing place page when one exists.
  for (const c of countries) {
    for (const city of c.cities) {
      city.placeUrl = placePageSlugs.has(city.slug) ? `/places/${city.slug}/` : `/?place=${encodeURIComponent(city.slug)}`;
      city.hasPlacePage = placePageSlugs.has(city.slug);
    }
    if (c.capitalPlace) {
      c.capitalPlace.placeUrl = placePageSlugs.has(c.capitalPlace.slug) ? `/places/${c.capitalPlace.slug}/` : `/?place=${encodeURIComponent(c.capitalPlace.slug)}`;
      c.capitalPlace.hasPlacePage = placePageSlugs.has(c.capitalPlace.slug);
    }
  }

  clientIndex.countries = Object.fromEntries(countries.map((c) => [c.iso2, { name: c.name, url: c.url }]));
  clientIndex.placePages = Object.fromEntries(places.map((p) => [p.slug, p.url]));


  const stats = {
    crops: crops.length, imported: crops.filter((c) => c.origin === "imported").length, curated: crops.filter((c) => c.origin === "curated").length,
    withHardiness: crops.filter((c) => c.hardiness?.min && c.hardiness?.max).length,
    varieties: varieties.length, groups: groups.length, guides: guides.length, regions: regions.length,
    regionsWithGuides: regions.filter((r) => r.guides.some((x) => x.primary)).length,
    fruit: crops.filter((c) => ["fruit", "fruit-tree", "berry", "nut"].includes(c.type)).length,
    flowers: crops.filter((c) => c.type === "flower").length,
    edible: crops.filter((c) => c.edible === true).length,
    places: places.length,
    companions: companions.length,
    rotationGroups: rotationGroups.length,
    rotationRules: rotationRules.length,
    images: crops.filter((c) => c.image).length,
    countries: countries.length,
  };
  return { catalog, crops, cropBy, varieties, groups, allVarietyRecords, varietyRedirects, guideRedirects, guides, regions, regionBy, problems, problemBy, companions, rotationGroups, rotationRules, seedSources, tools, toolBy, toolCategories, types, zones: zoneHalf, countries, countryBy, places, placeBySlug, placePageNote: PLACE_PAGE_NOTE, outlineAttribution: outlinesPack.attribution, climateAttribution: climatePack.attribution, kgToRegion: kg2region, clientIndex, stats, typeLabels: TYPE_LABELS };
}
