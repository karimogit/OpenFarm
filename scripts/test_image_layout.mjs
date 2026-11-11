// Images must not be stretched. Heroes use a fixed-height contain frame (no crop).
// Other catalogue images also use object-fit: contain. Flags may use cover.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const css = fs.readFileSync(path.join(ROOT, "site/assets/css/style.css"), "utf8");

function lastRule(selectorFrag) {
  // last occurrence of a rule block whose selector list contains selectorFrag
  const re = /([^{}]+)\{([^{}]+)\}/g;
  let last = null, m;
  while ((m = re.exec(css))) {
    if (m[1].includes(selectorFrag)) last = m[2];
  }
  return last;
}
function decl(block, prop) {
  if (!block) return null;
  const m = block.match(new RegExp(prop + "\\s*:\\s*([^;]+);"));
  return m ? m[1].trim() : null;
}

const heroFrame = lastRule(".photo .frame") && [...css.matchAll(/\.photo \.frame \{([^{}]+)\}/g)].pop()[1];
// The frame rule we want is the one that sets height, not figcaption. Pick the last block whose selector is exactly .photo .frame (possibly with others).
function lastBlockFor(selPart, requiredDecl) {
  const re = /([^{}]+)\{([^{}]+)\}/g;
  let last = null, m;
  while ((m = re.exec(css))) {
    if (m[1].includes(selPart) && (!requiredDecl || m[2].includes(requiredDecl))) last = m[2];
  }
  return last;
}

const frameH = lastBlockFor(".photo .frame", "height:");
const frameBg = lastBlockFor(".photo .frame", "background:");
const frameOv = lastBlockFor(".photo .frame", "overflow:");
ok(frameH, "hero frame rule exists");
ok(decl(frameH, "height") && /rem|px|em/.test(decl(frameH, "height")), `hero frame has a fixed height (${decl(frameH, "height")})`);
ok(decl(frameBg, "background") && !/^none$/i.test(decl(frameBg, "background")), `hero frame has a letterbox background (${decl(frameBg, "background")})`);
ok(decl(frameOv, "overflow") === "hidden", "hero frame clips overflow (letterboxing stays inside the box)");

const heroImg = lastBlockFor(".photo .frame img", "object-fit");
ok(decl(heroImg, "object-fit") === "contain", `hero img object-fit is contain (not cover/fill); got ${decl(heroImg, "object-fit")}`);
ok((decl(heroImg, "object-position") || "center").includes("center"), "hero img is centred in the frame");

for (const [sel, label] of [
  [".thumb img", "thumbnail"],
  [".crop-grid .thumb img", "crop-card thumbnail"],
  [".region-cards .thumb img", "region-card thumbnail"],
  [".growing-card .thumb img", "growing-card thumbnail"],
  [".seed-photo .thumb img", "seed thumbnail"],
]) {
  const b = lastBlockFor(sel, "object-fit");
  ok(decl(b, "object-fit") === "contain", `${label} object-fit is contain (got ${decl(b, "object-fit")})`);
}

const flag = lastBlockFor(".flag", "object-fit");
ok(decl(flag, "object-fit") === "cover", "flag icons may use cover (they are 4:3 marks, not photos)");

// No other img rule should set width and height without object-fit contain or cover.
const re = /([^{}]*\bimg\b[^{}]*)\{([^{}]+)\}/g;
let m;
while ((m = re.exec(css))) {
  const sel = m[1].replace(/\s+/g, " ").trim();
  const body = m[2];
  const hasW = /(?:^|;)\s*width\s*:/.test(body);
  const hasH = /(?:^|;)\s*height\s*:/.test(body);
  if (!hasW || !hasH) continue;
  const fit = decl(body, "object-fit");
  ok(fit === "contain" || fit === "cover" || fit === "scale-down",
    `${sel} sets width and height so it must set object-fit contain/cover (got ${fit})`);
}

if (failed) { console.error(`\n${failed} image-layout test(s) failed.`); process.exit(1); }
console.log("✓ image-layout tests passed");
