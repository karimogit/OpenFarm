import { wmThumb, wmSrcset, wmSrcsetWidths } from "./scripts/wm.js";
// Eleventy config. Content lives in /content (CC BY-SA 4.0 / CC0 imports); site code in /site (MIT).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LABELS = {
  full: "Full sun", "full-partial": "Full sun to part shade", partial: "Part shade", shade: "Shade",
  low: "Low", moderate: "Moderate", high: "High",
};

// Plain objects for the JSON API (the template data is cross-linked and has cycles).
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
const sourceOut = (s) => pick(s, ["key", "title", "publisher", "url", "license"]);
// Keep internal wayback_url / captured in repo files; do not publish them in the API.
const rescueOut = (r) => r && pick(r, ["slug", "companions_unverified", "growing_degree_days_as_recorded"]);
const varietyOut = (v) => ({
  ...pick(v, ["crop", "slug", "name", "synonyms", "scientific_name", "category", "fruit", "growth_habit", "days_to_maturity", "days_from",
    "cold_tolerance", "heat_tolerance", "disease_resistance", "chill_hours", "pollination_partners", "suitable_regions", "seeds",
    "sun", "size", "origin", "license", "cultivar", "cultivarName", "hardiness", "kind", "group"]),
  ...(rescueOut(v.rescue) ? { rescue: rescueOut(v.rescue) } : {}),
  url: v.url, sources: v.sources.map(sourceOut),
});
const guideOut = (g) => ({
  ...pick(g, ["crop", "region", "variety", "title", "koppen", "hemisphere", "reference_location", "calendar", "days_to_maturity", "spacing",
    "sowing_depth_cm", "soil", "watering_note", "sun", "water", "varieties", "problems", "confidence", "uncertainty", "license", "authors", "last_reviewed", "tools"]),
  url: g.url, sources: g.sources.map(sourceOut),
});
const cropOut = (c) => ({
  ...pick(c, ["slug", "name", "aliases", "scientific_name", "family", "type", "lifecycle", "sun", "water", "sowing_method", "size",
    "propagation", "temperature", "days_to_first_harvest", "growth_habits", "seed_saving", "perennial", "origin", "license", "image", "wikidata", "hardiness", "seedImage", "tools", "edible", "edible_parts", "toxic", "toxic_parts"]),
  ...(rescueOut(c.rescue) ? { rescue: rescueOut(c.rescue) } : {}),
  url: `/crops/${c.slug}/`,
  sources: c.sources.map(sourceOut),
  varieties: c.varieties.map(varietyOut),
  guides: c.guides.map(guideOut),
  problems: c.problemList.map((p) => p.slug),
  companions: c.companions.map((x) => ({ crop: x.other.slug, relation: x.relation, evidence: x.evidence, reason: x.reason })),
});

const regionOut = (r) => ({
  ...pick(r, ["slug", "name", "subtitle", "koppen", "color", "similar", "examples"]), url: `/regions/${r.slug}/`,
  guides: r.guides.filter((x) => x.primary).map((x) => x.g.url),
  partly_covered_by: r.guides.filter((x) => !x.primary).map((x) => x.g.url),
  varieties: r.varieties.map((v) => v.url),
  countries: (r.countries || []).map((c) => ({ iso2: c.iso2, name: c.name, url: c.url, share: c.share, method: c.method })),
});
const toolOut = (x) => ({ ...pick(x, ["slug", "name", "category", "image", "license"]), category_label: x.categoryLabel, url: x.url,
  sources: x.sources.map(sourceOut), crops: x.crops.map((c) => c.slug), guides: x.guides.map((g) => g.url) });
const countryOut = (c) => ({
  iso2: c.iso2, name: c.name, url: c.url, capital: c.capital || null,
  climate_method: c.climateMethod || null,
  regions: (c.regionShares || []).map((r) => ({ slug: r.slug, name: r.name, share: r.share })),
  koppen: c.koppen || [],
  cities: (c.cities || []).map((x) => ({ name: x.name, place: x.slug, url: x.placeUrl, population: x.pop })),
  seed_sources: (c.seedSources || []).map((s) => pick(s, ["slug", "name", "url", "kind"])),
});
const countriesOut = (list) => (list || []).map(countryOut);
const placeOut = (p) => ({
  slug: p.slug, name: p.name, url: p.url, query: p.queryUrl,
  country: { iso2: p.cc, name: p.countryName, url: p.countryUrl },
  admin: p.adminName || null, lat: p.lat, lon: p.lon, population: p.population || 0,
  climate: (p.kg && p.region) ? { koppen: p.kg.symbol, nearest: !!p.kg.nearest, region: p.region.slug, region_name: p.region.name } : null,
  grows_well: (p.growsWell || []).flatMap((g) => g.crops.map((c) => ({ crop: c.slug, name: c.name, region: g.slug, guide: c.guideUrl, hardiness: c.hardiness || null }))),
  calendar_shifted: !!p.calendarShifted,
});
const placesOut = (list) => ({
  license: "CC-BY-SA-4.0",
  attribution: "City names and coordinates: GeoNames (CC BY 4.0). Climate region: Beck et al. 2018 0.5° Köppen–Geiger grid (CC BY 4.0). Standing pages cover capitals plus up to 12 major cities per country.",
  count: (list || []).length,
  places: (list || []).map((p) => ({ slug: p.slug, name: p.name, url: p.url, cc: p.cc, country: p.countryName, lat: p.lat, lon: p.lon })),
});
const allOut = (db) => ({
  generated: new Date().toISOString(),
  license: { code: "MIT", content: "CC-BY-SA-4.0 (imported crop/variety records: CC0-1.0)", attribution: "OpenFarm contributors" },
  regions: db.regions.map(regionOut),
  crops: db.crops.map(cropOut),
  problems: db.problems.map((p) => ({ ...pick(p, ["slug", "name", "scientific_name", "kind", "caused_by", "affects", "conditions"]), sources: p.sources.map(sourceOut) })),
  tools: db.tools.map(toolOut),
  seed_sources: db.seedSources.map((s) => pick(s, ["slug", "name", "url", "kind", "countries", "regions", "focus"])),
  companions: db.companions.map((c) => ({ ...pick(c, ["crops", "relation", "evidence", "reason"]), sources: (c.sources || []).map(sourceOut) })),
  countries: (db.countries || []).map((c) => ({ iso2: c.iso2, name: c.name, url: c.url, capital: c.capital || null, climate_method: c.climateMethod || null, regions: (c.regionShares || []).map((r) => ({ slug: r.slug, share: r.share })) })),
  places: (db.places || []).map((p) => ({ slug: p.slug, name: p.name, url: p.url, cc: p.cc, country: p.countryName })),
  rotation: {
    groups: (db.rotationGroups || []).map((g) => ({ ...pick(g, ["slug", "name", "families", "notes"]), crops: (g.crops || []).map((c) => c.slug || c), sources: (g.sources || []).map(sourceOut) })),
    rules: (db.rotationRules || []).map((r) => ({ ...pick(r, ["kind", "from", "to", "group", "years", "reason"]), sources: (r.sources || []).map(sourceOut) })),
  },
});

export default function (eleventyConfig) {
  // External links (sources, seed companies, Commons, GitHub, …) open in a new tab and say so;
  // internal navigation stays in the same tab.
  eleventyConfig.addTransform("external-links", function (html) {
    if (!(this.page.outputPath || "").endsWith(".html")) return html;
    return html.replace(/<a\s([^>]*?href="https?:\/\/[^"]+"[^>]*)>([\s\S]*?)<\/a>/g, (m, attrs, inner) => {
      if (/\starget=/.test(attrs)) return m;
      return `<a ${attrs} target="_blank" rel="noopener noreferrer">${inner}<span class="ext" aria-hidden="true">↗</span><span class="visually-hidden"> (opens in new tab)</span></a>`;
    });
  });
  eleventyConfig.addFilter("wmThumb", wmThumb);
  eleventyConfig.addFilter("toolsOut", (tools) => ({ license: "CC-BY-SA-4.0", tools: tools.map(toolOut) }));
  eleventyConfig.addFilter("wmSrcset", wmSrcset);
  eleventyConfig.addFilter("wmSrcsetWidths", wmSrcsetWidths);
  eleventyConfig.addFilter("regionOut", regionOut);
  eleventyConfig.addFilter("allOut", allOut);
  eleventyConfig.addPassthroughCopy({ "site/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "data/places.json": "assets/places.json" });
  eleventyConfig.addPassthroughCopy({ "node_modules/leaflet/dist": "assets/vendor/leaflet" });
  eleventyConfig.addPassthroughCopy({ schema: "schema" });
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v).replace(/</g, "\\u003c"));
  eleventyConfig.addFilter("prettyJson", (v) => JSON.stringify(v, null, 1));
  eleventyConfig.addFilter("countryOut", countryOut);
  eleventyConfig.addFilter("placeOut", placeOut);
  eleventyConfig.addFilter("placesOut", placesOut);
  eleventyConfig.addFilter("countriesOut", countriesOut);
  eleventyConfig.addFilter("cropOut", cropOut);
  eleventyConfig.addFilter("guideOut", guideOut);
  eleventyConfig.addFilter("varietyOut", varietyOut);
  eleventyConfig.addFilter("monthName", (m) => MONTHS[m - 1]);
  eleventyConfig.addFilter("monthList", (ms) => (ms && ms.length ? ms.map((m) => MONTHS[m - 1]).join(", ") : "—"));
  eleventyConfig.addFilter("label", (v) => LABELS[v] || (v ? String(v).replace(/-/g, " ") : "—"));
  eleventyConfig.addFilter("range", (r, unit = "") => {
    if (r === undefined || r === null || r === "") return "—";
    if (!Array.isArray(r)) return `${r}${unit}`;
    return r[0] === r[1] ? `${r[0]}${unit}` : `${r[0]}–${r[1]}${unit}`;
  });
  // A Köppen code as a link to its climate region (or a help anchor), with the full class name as tooltip.
  eleventyConfig.addFilter("kgLink", function (code, classes, kgToRegion, toHelp = false) {
    const name = (classes.find((c) => c && c[0] === code) || [code, code])[1];
    const href = !toHelp && kgToRegion[code] ? `regions/${kgToRegion[code]}/` : `help/#koppen`;
    const prefix = process.env.PATH_PREFIX || "/OpenFarm/";
    return `<a class="kg" href="${prefix}${href}" title="Köppen ${code}: ${name}">${code}<span class="visually-hidden"> (Köppen: ${name})</span></a>`;
  });
  eleventyConfig.addFilter("kgName", (classes, code) => (classes.find((c) => c && c[0] === code) || [code, code])[1]);
  eleventyConfig.addFilter("where", (arr, key, val) => (arr || []).filter((x) => x && x[key] === val));
  eleventyConfig.addFilter("whereIn", (arr, key, val) => (arr || []).filter((x) => x && (x[key] || []).includes(val)));
  eleventyConfig.addFilter("cleanUrl", (u) => String(u || "").replace(/[?#].*$/, "").replace(/^http:\/\//, "https://"));
  eleventyConfig.addFilter("cssUrl", (s) => String(s).replace(/[()'"\s]/g, encodeURIComponent));
  eleventyConfig.addFilter("addGuideUrl", (site, crop, region) => {
    const value = `---\ncrop: ${crop}\nregion: ${region}\ntitle: \nkoppen: []\nhemisphere: north\nreference_location: \ncalendar:\n  harvest: []\nsun: full\nwater: moderate\nconfidence: medium\nuncertainty: \nsources:\n  - title: \n    url: https://\nlicense: CC-BY-SA-4.0\nauthors: []\nlast_reviewed: ${new Date().toISOString().slice(0, 10)}\n---\n\n## Summary\n\n`;
    return `${site.repo}/new/${site.branch}/content/guides/${crop}?filename=${region}.md&value=${encodeURIComponent(value)}`;
  });
  eleventyConfig.addWatchTarget("content/");
  eleventyConfig.addWatchTarget("data/");
  return {
    // GitHub Pages project site lives under /OpenFarm/. Override with PATH_PREFIX=/ for a custom domain (e.g. openfarm.cc).
    pathPrefix: process.env.PATH_PREFIX || "/OpenFarm/",
    dir: { input: "site", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
