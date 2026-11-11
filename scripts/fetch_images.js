#!/usr/bin/env node
// Finds a freely licensed Wikimedia Commons photo for every crop and variety and stores the image URL,
// author, license and source page in data/images.json (committed, so the site build stays offline).
//
//   node scripts/fetch_images.js            # only fetch entries that are missing
//   node scripts/fetch_images.js --refresh  # re-fetch everything
//
// Lookup order: the `wikipedia` frontmatter field, then the scientific name, then the common name.
// Only Commons files under CC0, public domain, CC BY or CC BY-SA are accepted; everything else is skipped.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadCrops, loadVarieties, loadRegions, loadTools } from "./content.js";

const OUT = path.join(ROOT, "data", "images.json");
const UA = "OpenFarm/0.2 (https://github.com/karimogit/OpenFarm; image attribution lookup)";
const refresh = process.argv.includes("--refresh");
const cache = !refresh && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(host, params) {
  const url = `https://${host}/w/api.php?` + new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return r.json();
    await sleep(2000 * (i + 1));
  }
  throw new Error(`API failed: ${url}`);
}

/** title -> Commons file name of the article's lead image (free images only). */
async function leadImages(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const j = await api("en.wikipedia.org", { action: "query", prop: "pageimages", piprop: "name", pilicense: "free", redirects: "1", titles: batch.join("|") });
    // Several requested titles can end up on the same article (normalisation + redirects).
    const origin = Object.fromEntries(batch.map((t) => [t, t]));
    for (const n of j.query?.normalized || []) origin[n.to] = n.from;
    const redirects = Object.fromEntries((j.query?.redirects || []).map((r) => [r.from, r.to]));
    const resolve = (t) => { const n = (j.query?.normalized || []).find((x) => x.from === t)?.to || t; return redirects[n] || n; };
    const pages = Object.fromEntries((j.query?.pages || []).map((p) => [p.title, p]));
    for (const t of batch) { const p = pages[resolve(t)]; if (p?.pageimage) out[t] = { file: p.pageimage, article: p.title }; }
    await sleep(300);
  }
  return out;
}

const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const FREE = /^(cc0|cc[ -]by(-sa)?[ -][0-9.]+|cc[ -]by(-sa)?|public domain|pd)/i;

async function fileInfo(files) {
  const out = {};
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50).map((f) => `File:${f}`);
    const j = await api("commons.wikimedia.org", { action: "query", prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "640", titles: batch.join("|") });
    const map = {};
    for (const n of j.query?.normalized || []) map[n.to] = n.from;
    for (const p of j.query?.pages || []) {
      const ii = p.imageinfo?.[0]; if (!ii) continue;
      const m = ii.extmetadata || {};
      const license = strip(m.LicenseShortName?.value);
      if (m.NonFree?.value === "true" || !FREE.test(license)) continue;
      out[(map[p.title] || p.title).replace(/^File:/, "")] = out[p.title.replace(/^File:/, "")] = {
        src: (ii.thumburl || ii.url).replace(/\?.*$/, ""), width: ii.thumbwidth, height: ii.thumbheight,
        orig_url: String(ii.url).replace(/[?#].*$/, ""), orig_width: ii.width, orig_height: ii.height,
        author: strip(m.Artist?.value) || "Unknown author", license, license_url: (m.LicenseUrl?.value || "").replace(/^http:\/\//, "https://") || null,
        source: ii.descriptionurl,
      };
    }
    await sleep(300);
  }
  return out;
}

// Older cache entries lack the original size; fetch it so the site can pick thumbnails without upscaling.
async function backfillSizes() {
  const keys = Object.keys(cache).filter((k) => cache[k] && !cache[k].orig_width);
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    const j = await api("commons.wikimedia.org", { action: "query", prop: "imageinfo", iiprop: "url|size", titles: batch.map((k) => `File:${cache[k].file}`).join("|") });
    const norm = {}; for (const n of j.query?.normalized || []) norm[n.to] = n.from;
    const byFile = {};
    for (const p of j.query?.pages || []) if (p.imageinfo) byFile[(norm[p.title] || p.title).replace(/^File:/, "")] = byFile[p.title.replace(/^File:/, "")] = p.imageinfo[0];
    for (const k of batch) { const ii = byFile[cache[k].file]; if (ii) Object.assign(cache[k], { orig_url: String(ii.url).replace(/[?#].*$/, ""), orig_width: ii.width, orig_height: ii.height }); }
    await sleep(300);
  }
}

async function main() {
  await backfillSizes();
  const wanted = [];
  for (const c of loadCrops()) wanted.push({ key: `crop:${c.data.slug}`, sci: c.data.scientific_name, titles: [c.data.wikipedia, c.data.scientific_name, c.data.name].filter(Boolean) });
  for (const v of loadVarieties()) if (v.data.wikipedia) wanted.push({ key: `variety:${v.data.crop}/${v.data.slug}`, titles: [v.data.wikipedia] });
  // A human-picked Commons file (`commons_file` in frontmatter) always wins.
  for (const c of loadCrops()) if (c.data.commons_file) wanted.find((w) => w.key === `crop:${c.data.slug}`).file = c.data.commons_file;
  for (const v of loadVarieties()) if (v.data.commons_file) wanted.push({ key: `variety:${v.data.crop}/${v.data.slug}`, file: v.data.commons_file, titles: [] });
  // Climate regions: one hand-picked farmland/garden photo each.
  for (const x of loadTools()) if (x.data.commons_file) wanted.push({ key: `tool:${x.data.slug}`, file: x.data.commons_file, titles: [] });
  for (const r of loadRegions()) if (r.data.commons_file) wanted.push({ key: `region:${r.data.slug}`, file: r.data.commons_file, titles: [] });
  const fixed = wanted.filter((w) => w.file && (refresh || !cache[w.key] || cache[w.key].file !== w.file));
  if (fixed.length) {
    const info = await fileInfo(fixed.map((w) => w.file));
    for (const w of fixed) if (info[w.file]) cache[w.key] = { ...info[w.file], file: w.file, picked: true };
  }
  const todo = wanted.filter((w) => !(w.key in cache) && !w.file);
  console.log(`${wanted.length} entries, ${todo.length} to look up.`);
  // Try each candidate title in turn for the entries still without an image.
  let pending = todo;
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    const titles = [...new Set(pending.map((w) => w.titles[pass]).filter(Boolean))];
    const lead = await leadImages(titles);
    const info = await fileInfo([...new Set(Object.values(lead).map((l) => l.file))]);
    const next = [];
    for (const w of pending) {
      const t = w.titles[pass]; const l = t && lead[t]; const i = l && info[l.file];
      if (i) cache[w.key] = { ...i, file: l.file, article: `https://en.wikipedia.org/wiki/${encodeURIComponent(l.article.replace(/ /g, "_"))}` };
      else next.push(w);
    }
    pending = next;
  }
  // Last resort: search Commons directly for the scientific/common name (lead image may be GFDL-only).
  // Only for crops with a scientific name, and only files whose name contains the genus, to avoid
  // unrelated hits (a search for "Mint" happily returns a doll's tea set).
  for (const w of pending.splice(0)) {
    if (!w.sci) { pending.push(w); continue; }
    const q = w.sci.split(/[ ,(/]/).slice(0, 2).join(" ");
    const genus = q.split(" ")[0].toLowerCase();
    const j = await api("commons.wikimedia.org", {
      action: "query", generator: "search", gsrsearch: `"${q}" filetype:bitmap`, gsrnamespace: "6", gsrlimit: "8",
      prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "640",
    });
    const hits = (j.query?.pages || []).sort((a, b) => a.index - b.index);
    const pick = hits.find((p) => {
      if (!p.title.toLowerCase().includes(genus)) return false;
      const m = p.imageinfo?.[0]?.extmetadata || {};
      return m.NonFree?.value !== "true" && FREE.test(strip(m.LicenseShortName?.value));
    });
    if (pick) {
      const ii = pick.imageinfo[0]; const m = ii.extmetadata;
      cache[w.key] = {
        src: (ii.thumburl || ii.url).replace(/\?.*$/, ""), width: ii.thumbwidth, height: ii.thumbheight,
        orig_url: String(ii.url).replace(/[?#].*$/, ""), orig_width: ii.width, orig_height: ii.height,
        author: strip(m.Artist?.value) || "Unknown author", license: strip(m.LicenseShortName?.value),
        license_url: (m.LicenseUrl?.value || "").replace(/^http:\/\//, "https://") || null, source: ii.descriptionurl, file: pick.title.replace(/^File:/, ""),
        found_by: `Commons search for "${q}"`,
      };
    } else pending.push(w);
    await sleep(300);
  }
  for (const w of pending) cache[w.key] = null; // remember misses so we don't retry every run
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
  const found = Object.values(sorted).filter(Boolean).length;
  console.log(`Images: ${found} found, ${Object.keys(sorted).length - found} without a free image.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
