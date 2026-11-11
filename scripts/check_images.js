#!/usr/bin/env node
// Build check: every image URL the site uses (original + standard thumbs) must resolve.
// Commons only serves standard widths (https://w.wiki/GHai); HEAD may be rejected, so
// fall back to a ranged GET. 429s are retried with backoff.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadCrops, loadVarieties, loadRegions, loadTools } from "./content.js";
import { imageUrls } from "./wm.js";

const UA = "OpenFarm/1.0 (https://github.com/karimogit/OpenFarm; image-check)";
const WIDTHS = [250, 330, 500, 960];
const images = JSON.parse(fs.readFileSync(path.join(ROOT, "data/images.json"), "utf8"));

const wanted = [];
for (const c of loadCrops()) if (c.data.commons_file) wanted.push(`crop:${c.data.slug}`);
for (const v of loadVarieties()) if (v.data.commons_file) wanted.push(`variety:${v.data.crop}/${v.data.slug}`);
for (const r of loadRegions()) if (r.data.commons_file) wanted.push(`region:${r.data.slug}`);
for (const t of loadTools()) if (t.data.commons_file) wanted.push(`tool:${t.data.slug}`);

const missingKeys = wanted.filter((k) => !images[k]);
const urls = new Set();
for (const img of Object.values(images)) {
  for (const u of imageUrls(img, WIDTHS)) urls.add(u);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(url, method, extra = {}) {
  const headers = { "User-Agent": UA, Accept: "*/*", ...extra };
  const r = await fetch(url, { method, headers, redirect: "follow" });
  return r;
}

async function statusOf(url) {
  const headersRange = { Range: "bytes=0-0" };
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      let r = await once(url, "HEAD");
      if (r.status === 200) return 200;
      if (r.status === 400 || r.status === 403 || r.status === 405 || r.status === 501) {
        r = await once(url, "GET", headersRange);
        if (r.ok || r.status === 206) return r.status;
        if (r.status === 400) {
          r = await once(url, "GET");
          if (r.ok || r.status === 206) { r.body?.cancel?.(); return r.status; }
        }
      }
      if (r.status === 429 || r.status === 503) {
        const ra = Number(r.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? Math.min(60000, ra * 1000) : Math.min(30000, 2000 * 2 ** attempt);
        await sleep(wait);
        continue;
      }
      return r.status;
    } catch (err) {
      if (attempt < 7) { await sleep(Math.min(30000, 1000 * 2 ** attempt)); continue; }
      return `ERR ${err.cause?.code || err.message}`;
    }
  }
  return 429;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const my = i++;
      out[my] = await fn(items[my], my);
    }
  }));
  return out;
}

const ALLOWED_WIDTHS = new Set([250, 330, 500, 960, 1280, 1920, 3840]);
let badWidth = 0;
for (const url of urls) {
  const m = url.match(/\/(\d+)px-/);
  if (m && !ALLOWED_WIDTHS.has(+m[1])) {
    console.error(`✗ non-standard Commons thumb width ${m[1]} (see https://w.wiki/GHai): ${url}`);
    badWidth++;
  }
}
if (badWidth) {
  console.error(`\n${badWidth} thumbnail URL(s) use widths Commons will reject.`);
  process.exit(1);
}

const list = [...urls].sort();
console.log(`Checking ${list.length} image URLs (${Object.keys(images).length} records)…`);
if (missingKeys.length) {
  console.error(`✗ ${missingKeys.length} commons_file key(s) missing from data/images.json:`);
  for (const k of missingKeys) console.error(`  ${k}`);
}

const bad = [];
let done = 0;
await pool(list, 2, async (url) => {
  const st = await statusOf(url);
  await sleep(150);
  done++;
  if (done % 100 === 0 || done === list.length) console.log(`  … ${done}/${list.length}`);
  if (st !== 200 && st !== 206) {
    bad.push({ url, st });
    console.error(`✗ ${st}  ${url}`);
  }
});

if (missingKeys.length || bad.length) {
  console.error(`\n${missingKeys.length + bad.length} image problem(s).`);
  process.exit(1);
}
console.log(`✓ All ${list.length} image URLs resolved.`);
