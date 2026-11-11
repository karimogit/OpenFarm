// Built pages and page templates must not mention the Wayback Machine or link to web.archive.org.
// Internal wayback_url fields may stay in content/ repo files. One generic credit on About
// points at the OpenFarm crops rescue repository, not at a Wayback capture.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

let failed = 0;
function ok(cond, msg) {
  if (!cond) { failed++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

const BANNED = /web\.archive\.org|wayback/i;

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      // schema/ is a passthrough of the repo's JSON Schemas (internal wayback_url
      // pattern for licence provenance). It is not a content page.
      if (name.name === "node_modules" || name.name === "pagefind" || name.name === "_pagefind" || name.name === "schema") continue;
      walkFiles(p, acc);
    } else acc.push(p);
  }
  return acc;
}

const templates = walkFiles(path.join(ROOT, "site")).filter((p) => p.endsWith(".njk") || p.endsWith(".html"));
const hits = [];
for (const file of templates) {
  const text = fs.readFileSync(file, "utf8");
  if (BANNED.test(text)) hits.push(path.relative(ROOT, file));
}
ok(hits.length === 0, "no site template mentions web.archive.org or Wayback" + (hits.length ? " (found in " + hits.join(", ") + ")" : ""));

const crop = fs.readFileSync(path.join(ROOT, "site/crop.njk"), "utf8");
const variety = fs.readFileSync(path.join(ROOT, "site/variety.njk"), "utf8");
ok(!/Original OpenFarm record/.test(crop) && !/Original OpenFarm record/.test(variety),
  "crop and variety templates no longer print an Original OpenFarm record line");

const sourcesInc = fs.readFileSync(path.join(ROOT, "site/_includes/sources.njk"), "utf8");
ok(sourcesInc.includes('s.key != "openfarm-rescue"'), "per-page sources lists still omit the openfarm-rescue entry");

const contribute = fs.readFileSync(path.join(ROOT, "site/contribute.njk"), "utf8");
ok(contribute.includes("https://github.com/thefullnacho/openfarm-crops-rescue"),
  "About credits the OpenFarm crops rescue repository");
ok(!/web\.archive\.org/i.test(contribute), "About credit does not link to the Wayback Machine");

const edited = fs.readFileSync(path.join(ROOT, "site/_includes/edited-by.njk"), "utf8");
ok(!/showRescueCredit|openfarm-crops-rescue/.test(edited),
  "crop/variety pages do not repeat the rescue credit");

const yaml = fs.readFileSync(path.join(ROOT, "content/sources.yaml"), "utf8");
const titleBlock = yaml.match(/^openfarm-rescue:\n((?:  .*\n)+)/m);
ok(!!titleBlock, "openfarm-rescue entry exists in sources.yaml");
if (titleBlock) {
  const fields = titleBlock[1];
  const title = (fields.match(/^\s*title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || "";
  const url = (fields.match(/^\s*url:\s*(\S+)/m) || [])[1] || "";
  ok(!BANNED.test(title) && !BANNED.test(url),
    "openfarm-rescue title and url (the fields the API emits) do not mention Wayback");
  ok(/openfarm-crops-rescue/.test(url), "openfarm-rescue url points at the rescue repository");
}

const eleventy = fs.readFileSync(path.join(ROOT, "eleventy.config.js"), "utf8");
ok(/rescueOut/.test(eleventy) && /wayback_url/.test(eleventy) && /do not publish/.test(eleventy),
  "API output strips wayback_url from the public rescue object");

const site = path.join(ROOT, "_site");
if (fs.existsSync(site)) {
  const built = walkFiles(site).filter((p) => /\.(html|json)$/.test(p));
  const builtHits = [];
  for (const file of built) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    if (BANNED.test(text)) builtHits.push(path.relative(site, file));
  }
  if (builtHits.length) {
    // A stale _site from before this change would fail; treat only as failure if templates already pass,
    // so a rebuild is required before this test is green.
    failed++;
    console.error("FAIL: built page contains web.archive.org or Wayback: " + builtHits.slice(0, 12).join(", ")
      + (builtHits.length > 12 ? ` (+${builtHits.length - 12} more)` : "")
      + " — rebuild _site if this is stale");
  } else {
    ok(true, `no built HTML or JSON page contains web.archive.org or Wayback (${built.length} files)`);
  }
} else {
  console.log("skip: _site not built yet — rebuild to assert generated HTML and JSON");
}

if (failed) { console.error(`\n${failed} wayback test(s) failed.`); process.exit(1); }
console.log("✓ wayback tests passed");
