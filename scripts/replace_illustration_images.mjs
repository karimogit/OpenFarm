// Audit crop/variety/group hero images. Replace botanical plates, drawings,
// diagrams and herbarium scans with a licence-safe Commons photograph of the
// same plant. If none exists, drop the image. Sets image_type: "photo" on keepers.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadCrops, loadVarieties } from "./content.js";
import { looksLikeIllustration } from "./image_kind.js";

const OUT = path.join(ROOT, "data", "images.json");
const UA = "OpenFarm/0.2 (https://github.com/karimogit/OpenFarm; illustration-to-photo audit)";
const FREE = /^(cc0|cc[ -]by(-sa)?[ -][0-9.]+|cc[ -]by(-sa)?|public domain|pd)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const images = JSON.parse(fs.readFileSync(OUT, "utf8"));
const crops = Object.fromEntries(loadCrops().map((c) => [c.data.slug, c.data]));
const varieties = loadVarieties();

async function api(host, params) {
  const url = `https://${host}/w/api.php?` + new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return r.json();
    await sleep(2000 * (i + 1));
  }
  throw new Error(`API failed: ${url}`);
}

function recordFromInfo(p, ii) {
  const m = ii.extmetadata || {};
  const license = strip(m.LicenseShortName?.value);
  if (m.NonFree?.value === "true" || !FREE.test(license)) return null;
  const file = (p.title || "").replace(/^File:/, "");
  const author = strip(m.Artist?.value) || "Unknown author";
  const cats = (p.categories || []).map((c) => c.title || c);
  if (looksLikeIllustration({ file, author, src: ii.url, categories: cats })) return null;
  return {
    src: (ii.thumburl || ii.url).replace(/\?.*$/, ""),
    width: ii.thumbwidth,
    height: ii.thumbheight,
    orig_url: String(ii.url).replace(/[?#].*$/, ""),
    orig_width: ii.width,
    orig_height: ii.height,
    author,
    license,
    license_url: (m.LicenseUrl?.value || "").replace(/^http:\/\//, "https://") || null,
    source: ii.descriptionurl,
    file,
    image_type: "photo",
  };
}

async function categoriesForFiles(files) {
  const out = {};
  const uniq = [...new Set(files.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 40) {
    const batch = uniq.slice(i, i + 40).map((f) => `File:${f}`);
    const j = await api("commons.wikimedia.org", {
      action: "query",
      prop: "categories",
      cllimit: "40",
      clshow: "!hidden",
      titles: batch.join("|"),
    });
    const norm = {};
    for (const n of j.query?.normalized || []) norm[n.to] = n.from;
    for (const p of j.query?.pages || []) {
      const title = (norm[p.title] || p.title).replace(/^File:/, "");
      const also = p.title.replace(/^File:/, "");
      const cats = (p.categories || []).map((c) => c.title.replace(/^Category:/, ""));
      out[title] = out[also] = cats;
    }
    await sleep(250);
  }
  return out;
}

async function searchPhoto(queries, genus) {
  for (const q of queries) {
    if (!q) continue;
    const j = await api("commons.wikimedia.org", {
      action: "query",
      generator: "search",
      gsrsearch: `${q} filetype:bitmap -intitle:illustration -intitle:Köhler -intitle:Koehler -intitle:herbarium`,
      gsrnamespace: "6",
      gsrlimit: "12",
      prop: "imageinfo|categories",
      iiprop: "url|size|extmetadata|mime",
      iiurlwidth: "960",
      cllimit: "30",
      clshow: "!hidden",
    });
    const hits = (j.query?.pages || []).sort((a, b) => a.index - b.index);
    for (const p of hits) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const mime = (ii.mime || "").toLowerCase();
      if (mime && !/^image\/(jpeg|png|webp)/.test(mime)) continue;
      if (genus && !p.title.toLowerCase().includes(genus.toLowerCase()) && !queries.some((x) => x && p.title.toLowerCase().includes(String(x).toLowerCase().split(" ")[0]))) {
        // still allow if the common-name query is in the title
      }
      const rec = recordFromInfo(p, ii);
      if (rec && rec.orig_width >= 300) {
        rec.found_by = `Commons photo search for "${q}"`;
        return rec;
      }
    }
    await sleep(250);
  }
  return null;
}

function queriesFor(key) {
  const [kind, rest] = key.split(":");
  const out = [];
  if (kind === "crop") {
    const c = crops[rest];
    if (!c) return [rest.replace(/-/g, " ")];
    if (c.scientific_name) out.push(`"${c.scientific_name.split(/[,(/]/)[0].trim()}"`);
    out.push(`"${c.name}"`);
    return out;
  }
  if (kind === "variety") {
    const [crop, slug] = rest.split("/");
    const c = crops[crop];
    const v = varieties.find((x) => x.data.crop === crop && x.data.slug === slug)?.data;
    if (v?.scientific_name) out.push(`"${v.scientific_name.split(/[,(/]/)[0].trim()}"`);
    if (v?.name) out.push(`"${v.name}"`);
    if (c?.scientific_name && v?.name) out.push(`"${c.scientific_name.split(/[,(/]/)[0].trim()}" "${v.name}"`);
    if (c?.name && v?.name) out.push(`"${c.name}" "${v.name}"`);
    return out.length ? out : [slug.replace(/-/g, " ")];
  }
  return [rest.replace(/-/g, " ")];
}

function genusFor(key) {
  const [kind, rest] = key.split(":");
  const slug = kind === "variety" ? rest.split("/")[0] : rest;
  const sci = crops[slug]?.scientific_name;
  return sci ? sci.split(/[\s,/]/)[0] : "";
}

const heroKeys = Object.keys(images).filter((k) => k.startsWith("crop:") || k.startsWith("variety:") || k.startsWith("group:"));
const files = heroKeys.map((k) => images[k]?.file).filter(Boolean);
console.log(`Fetching categories for ${files.length} hero files…`);
const cats = await categoriesForFiles(files);

const flagged = [];
const keepers = [];
for (const k of heroKeys) {
  const rec = images[k];
  if (!rec) continue;
  const categories = cats[rec.file] || [];
  rec._categories = categories; // ephemeral
  if (looksLikeIllustration({ file: rec.file, author: rec.author, src: rec.src, categories })) {
    flagged.push(k);
  } else {
    keepers.push(k);
  }
}

console.log(`Flagged ${flagged.length} illustration/diagram/herbarium heroes; ${keepers.length} look like photos.`);
for (const k of flagged) {
  const rec = images[k];
  console.log(`  ILLUST  ${k}  << ${rec.file}  (${(rec._categories || []).slice(0, 3).join("; ")})`);
}

const replaced = [];
const removed = [];
for (const k of flagged) {
  const rec = await searchPhoto(queriesFor(k), genusFor(k));
  if (rec) {
    // preserve article link if we had one
    if (images[k]?.article) rec.article = images[k].article;
    images[k] = rec;
    replaced.push([k, rec.file]);
    console.log(`  PHOTO   ${k}  >> ${rec.file}  (${rec.license})`);
  } else {
    images[k] = null;
    removed.push(k);
    console.log(`  REMOVE  ${k}  (no licence-safe photo found)`);
  }
}

for (const k of keepers) {
  if (images[k] && !images[k].image_type) images[k].image_type = "photo";
  if (images[k]) delete images[k]._categories;
}
for (const k of Object.keys(images)) {
  if (images[k]) delete images[k]._categories;
}

const sorted = Object.fromEntries(Object.keys(images).sort().map((k) => [k, images[k]]));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`\nDone. Replaced ${replaced.length}, removed ${removed.length}, flagged ${flagged.length}, photo-tagged ${keepers.length}.`);
