// Eleventy config. Content lives in /content (CC BY-SA 4.0); site code in /site (MIT).
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "site/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "node_modules/leaflet/dist": "assets/vendor/leaflet" });
  eleventyConfig.addPassthroughCopy({ "schema": "schema" });
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("monthName", (m) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]);
  eleventyConfig.addFilter("range", (r, unit = "") => (r ? (r[0] === r[1] ? `${r[0]}${unit}` : `${r[0]}–${r[1]}${unit}`) : "—"));
  eleventyConfig.addFilter("kgName", (classes, code) => (classes.find((c) => c && c[0] === code) || [code, code])[1]);
  // Compact index shipped to the browser for the location lookup.
  eleventyConfig.addFilter("guideIndex", (guides) =>
    guides.map((g) => ({
      crop: g.crop, name: g.common_name, sci: g.scientific_name, variant: g.variant, title: g.title,
      koppen: g.koppen, hemisphere: g.hemisphere, calendar: g.calendar, confidence: g.confidence,
      uncertainty: g.uncertainty || null, ref: g.reference_location
    }))
  );
  eleventyConfig.addWatchTarget("content/");
  return {
    // GitHub Pages project site lives under /OpenFarm/. Override with PATH_PREFIX=/ for a custom domain (e.g. openfarm.cc).
    pathPrefix: process.env.PATH_PREFIX || "/OpenFarm/",
    dir: { input: "site", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
}
