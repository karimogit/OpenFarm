import { wmThumb, wmSrcset } from "./scripts/wm.js";
// Eleventy config. Content lives in /content (CC BY-SA 4.0 / CC0 imports); site code in /site (MIT).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LABELS = {
  full: "Full sun", "full-partial": "Full sun to part shade", partial: "Part shade", shade: "Shade",
  low: "Low", moderate: "Moderate", high: "High",
};

// Plain objects for the JSON API (the template data is cross-linked and has cycles).
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
const sourceOut = (s) => pick(s, ["key", "title", "publisher", "url", "license"]);
const varietyOut = (v) => ({
  ...pick(v, ["crop", "slug", "name", "synonyms", "scientific_name", "category", "fruit", "growth_habit", "days_to_maturity", "days_from",
    "cold_tolerance", "heat_tolerance", "disease_resistance", "chill_hours", "pollination_partners", "suitable_regions", "seeds",
    "sun", "size", "origin", "license", "rescue"]),
  url: v.url, sources: v.sources.map(sourceOut),
});
const guideOut = (g) => ({
  ...pick(g, ["crop", "region", "title", "koppen", "hemisphere", "reference_location", "calendar", "days_to_maturity", "spacing",
    "sun", "water", "varieties", "problems", "confidence", "uncertainty", "license", "authors", "last_reviewed"]),
  url: g.url, sources: g.sources.map(sourceOut),
});
const cropOut = (c) => ({
  ...pick(c, ["slug", "name", "aliases", "scientific_name", "family", "type", "lifecycle", "sun", "water", "sowing_method", "size",
    "propagation", "temperature", "days_to_first_harvest", "growth_habits", "seed_saving", "perennial", "origin", "license", "rescue", "image"]),
  url: `/crops/${c.slug}/`,
  sources: c.sources.map(sourceOut),
  varieties: c.varieties.map(varietyOut),
  guides: c.guides.map(guideOut),
  problems: c.problemList.map((p) => p.slug),
  companions: c.companions.map((x) => ({ crop: x.other.slug, relation: x.relation, evidence: x.evidence, reason: x.reason })),
});

const regionOut = (r) => ({
  ...pick(r, ["slug", "name", "koppen", "color", "similar", "examples"]), url: `/regions/${r.slug}/`,
  guides: r.guides.filter((x) => x.primary).map((x) => x.g.url),
  partly_covered_by: r.guides.filter((x) => !x.primary).map((x) => x.g.url),
  varieties: r.varieties.map((v) => v.url),
});
const allOut = (db) => ({
  generated: new Date().toISOString(),
  license: { code: "MIT", content: "CC-BY-SA-4.0 (imported crop/variety records: CC0-1.0)", attribution: "OpenFarm contributors" },
  regions: db.regions.map(regionOut),
  crops: db.crops.map(cropOut),
  problems: db.problems.map((p) => ({ ...pick(p, ["slug", "name", "scientific_name", "kind", "caused_by", "affects", "conditions"]), sources: p.sources.map(sourceOut) })),
  seed_sources: db.seedSources.map((s) => pick(s, ["slug", "name", "url", "kind", "countries", "regions", "focus"])),
  companions: db.companions.map((c) => ({ ...pick(c, ["crops", "relation", "evidence", "reason"]), sources: (c.sources || []).map(sourceOut) })),
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
  eleventyConfig.addFilter("wmSrcset", wmSrcset);
  eleventyConfig.addFilter("regionOut", regionOut);
  eleventyConfig.addFilter("allOut", allOut);
  eleventyConfig.addPassthroughCopy({ "site/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "node_modules/leaflet/dist": "assets/vendor/leaflet" });
  eleventyConfig.addPassthroughCopy({ schema: "schema" });
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v).replace(/</g, "\\u003c"));
  eleventyConfig.addFilter("prettyJson", (v) => JSON.stringify(v, null, 1));
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
  eleventyConfig.addFilter("kgName", (classes, code) => (classes.find((c) => c && c[0] === code) || [code, code])[1]);
  eleventyConfig.addFilter("where", (arr, key, val) => (arr || []).filter((x) => x && x[key] === val));
  eleventyConfig.addFilter("whereIn", (arr, key, val) => (arr || []).filter((x) => x && (x[key] || []).includes(val)));
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
