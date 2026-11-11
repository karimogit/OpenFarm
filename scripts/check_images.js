#!/usr/bin/env node
// Image URL check: every image URL the site uses (original + standard thumbs) must resolve.
// Commons only serves standard widths (https://w.wiki/GHai); HEAD may be rejected, so
// fall back to a ranged GET. 429s are retried with backoff.
//
//   npm run check:images                 full check (local, or workflow_dispatch)
//   npm run check:images -- --changed    only URLs new or changed vs a base ref
//     --base <ref>  or  CHECK_IMAGES_BASE  or  origin/${GITHUB_BASE_REF}  or  origin/main
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadCrops, loadVarieties, loadRegions, loadTools } from "./content.js";
import { imageUrls } from "./wm.js";

const UA = "OpenFarm/1.0 (https://github.com/karimogit/OpenFarm; image-check)";
const WIDTHS = [250, 330, 500, 960];
const ALLOWED_WIDTHS = new Set([250, 330, 500, 960, 1280, 1920, 3840]);
const ZERO_SHA = "0".repeat(40);

function parseArgs(argv) {
  const out = { changed: false, base: process.env.CHECK_IMAGES_BASE || null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--changed") out.changed = true;
    else if (a === "--base") out.base = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      out.help = true;
      process.exitCode = 2;
    }
  }
  if (out.base === ZERO_SHA || out.base === "") out.base = null;
  return out;
}

function git(args) {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function gitShow(ref, file) {
  try {
    return git(["show", `${ref}:${file}`]);
  } catch {
    return null;
  }
}

function gitLs(ref, dir) {
  try {
    return git(["ls-tree", "-r", "--name-only", ref, dir]).split("\n").filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
}

function resolveBase(explicit) {
  if (explicit) return explicit;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  return "origin/main";
}

function field(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!m) return null;
  return m[1].trim().replace(/^['"]|['"]$/g, "") || null;
}

function wantedKeyFromFile(file, text) {
  if (!text || !text.startsWith("---")) return null;
  const fm = text.split("---", 3)[1] || "";
  if (!field(fm, "commons_file")) return null;
  if (file.startsWith("content/crops/")) return `crop:${field(fm, "slug") || path.basename(file, ".md")}`;
  if (file.startsWith("content/varieties/")) {
    const slug = field(fm, "slug") || path.basename(file, ".md");
    const crop = field(fm, "crop") || file.split("/")[2];
    return `variety:${crop}/${slug}`;
  }
  if (file.startsWith("content/regions/")) return `region:${field(fm, "slug") || path.basename(file, ".md")}`;
  if (file.startsWith("content/tools/")) return `tool:${field(fm, "slug") || path.basename(file, ".md")}`;
  return null;
}

function wantedFromRef(ref) {
  const files = [
    ...gitLs(ref, "content/crops"),
    ...gitLs(ref, "content/varieties"),
    ...gitLs(ref, "content/regions"),
    ...gitLs(ref, "content/tools"),
  ];
  const keys = [];
  for (const f of files) {
    const k = wantedKeyFromFile(f, gitShow(ref, f));
    if (k) keys.push(k);
  }
  return keys;
}

function currentWanted() {
  const keys = [];
  for (const c of loadCrops()) if (c.data.commons_file) keys.push(`crop:${c.data.slug}`);
  for (const v of loadVarieties()) if (v.data.commons_file) keys.push(`variety:${v.data.crop}/${v.data.slug}`);
  for (const r of loadRegions()) if (r.data.commons_file) keys.push(`region:${r.data.slug}`);
  for (const t of loadTools()) if (t.data.commons_file) keys.push(`tool:${t.data.slug}`);
  return keys;
}

function urlSet(img) {
  return new Set(imageUrls(img, WIDTHS));
}

function urlKey(set) {
  return [...set].sort().join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage: node scripts/check_images.js [--changed] [--base <ref>]

  (default)     Check every image URL in data/images.json.
  --changed     Check only URLs that are new or changed vs the base ref,
                and only report commons_file keys that are newly missing.
  --base <ref>  Base commit or branch (default: CHECK_IMAGES_BASE,
                or origin/\${GITHUB_BASE_REF} on a pull_request, or origin/main).`);
  process.exit(process.exitCode || 0);
}

const images = JSON.parse(fs.readFileSync(path.join(ROOT, "data/images.json"), "utf8"));
const wanted = currentWanted();
let missingKeys = wanted.filter((k) => !images[k]);
let urls = new Set();
for (const img of Object.values(images)) {
  for (const u of imageUrls(img, WIDTHS)) urls.add(u);
}

if (args.changed) {
  const base = resolveBase(args.base);
  let baseOk = true;
  try {
    git(["rev-parse", "--verify", base]);
  } catch {
    baseOk = false;
  }
  if (!baseOk) {
    console.error(`✗ --changed needs a reachable base ref (tried ${base}). Fetch the base branch or pass --base.`);
    process.exit(1);
  }
  const raw = gitShow(base, "data/images.json");
  const baseImages = raw ? JSON.parse(raw) : {};
  const baseWanted = new Set(wantedFromRef(base));
  const changedUrls = new Set();
  let changedRecords = 0;
  for (const [k, img] of Object.entries(images)) {
    const prev = baseImages[k];
    const now = urlSet(img);
    const old = prev ? urlSet(prev) : new Set();
    if (urlKey(now) !== urlKey(old)) {
      changedRecords++;
      for (const u of now) if (!old.has(u)) changedUrls.add(u);
    }
  }
  // Newly wanted commons_file keys that have no images.json record.
  const newMissing = missingKeys.filter((k) => !baseWanted.has(k) || baseImages[k]);
  const preExistingMissing = missingKeys.filter((k) => !newMissing.includes(k));
  missingKeys = newMissing;
  urls = changedUrls;
  console.log(`Changed-image check vs ${base}: ${changedRecords} updated record(s), ${urls.size} new or changed URL(s).`);
  if (preExistingMissing.length) {
    console.log(`Note: ${preExistingMissing.length} pre-existing commons_file key(s) still missing from data/images.json (not failing this changed-only check).`);
  }
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

let badWidth = 0;
for (const img of Object.values(images)) {
  for (const url of imageUrls(img, WIDTHS)) {
    const m = url.match(/\/(\d+)px-/);
    if (m && !ALLOWED_WIDTHS.has(+m[1])) {
      console.error(`✗ non-standard Commons thumb width ${m[1]} (see https://w.wiki/GHai): ${url}`);
      badWidth++;
    }
  }
}
if (badWidth) {
  console.error(`\n${badWidth} thumbnail URL(s) use widths Commons will reject.`);
  process.exit(1);
}
if (args.changed && !urls.size && !missingKeys.length) {
  console.log("No new or changed image URLs to check.");
  process.exit(0);
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
