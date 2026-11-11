// Built pages must not say "Every page/guide is a plain text file on GitHub".
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const PHRASE = /plain text file on GitHub/i;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (["node_modules", "pagefind", "_pagefind"].includes(name.name)) continue;
      walk(p, acc);
    } else acc.push(p);
  }
  return acc;
}

const templates = walk(path.join(ROOT, "site")).filter((p) => p.endsWith(".njk") || p.endsWith(".html") || p.endsWith(".js"));
const hits = templates.filter((f) => PHRASE.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
ok(hits.length === 0, "no site template or script uses the plain-text-file-on-GitHub sentence" + (hits.length ? " (" + hits.join(", ") + ")" : ""));

const edit = fs.readFileSync(path.join(ROOT, "site/_includes/edit-button.njk"), "utf8");
ok(/edit\/\{\{ site\.branch \}\}/.test(edit) && !/how to contribute/.test(edit),
  "edit button remains, without the accompanying GitHub sentence");

const site = path.join(ROOT, "_site");
if (fs.existsSync(site)) {
  const pages = walk(site).filter((p) => p.endsWith(".html"));
  const pageHits = pages.filter((f) => PHRASE.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(site, f));
  ok(pageHits.length === 0,
    "no built HTML page contains the sentence" + (pageHits.length ? " (" + pageHits.slice(0, 8).join(", ") + ")" : ` (${pages.length} pages)`));
} else {
  console.log("skip: _site not built yet");
}

if (failed) { console.error(`\n${failed} plain-text-sentence test(s) failed.`); process.exit(1); }
console.log("✓ plain-text-sentence tests passed");
