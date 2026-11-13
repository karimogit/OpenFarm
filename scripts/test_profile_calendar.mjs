// Profile growing calendar uses the same sow / plant / harvest / prune colours as crop calendars, plus a legend.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const js = fs.readFileSync(path.join(ROOT, "site/assets/js/profile.js"), "utf8");
ok(/class="mark sow_indoors"/.test(js) && /class="mark sow_direct"/.test(js),
  "profile calendar marks indoor and outdoor sowing with distinct classes");
ok(/class="mark plant"/.test(js) && /class="mark harvest"/.test(js) && /class="mark prune"/.test(js),
  "profile calendar marks plant, harvest and prune");
ok(/class="cal-legend"/.test(js) && /sow_indoors/.test(js) && /harvest/.test(js),
  "profile calendar renders a colour legend");

const css = fs.readFileSync(path.join(ROOT, "site/assets/css/style.css"), "utf8");
const need = {
  "sow_indoors": "--sow",
  "sow_direct": "--sowd",
  "plant": "--plant",
  "harvest": "--harvest",
  "prune": "--prune",
};
for (const [cls, token] of Object.entries(need)) {
  ok(css.includes(`.growing-cal .mark.${cls}`) && css.includes(`background: var(${token})`),
    `.growing-cal .mark.${cls} background uses ${token}`);
}
ok(css.includes(".growing-cal .cal-legend i.on.sow_indoors") && css.includes("background: var(--sow)"),
  "profile legend swatches use the same calendar colours");
ok(/\.on\.sow_indoors \{ background: var\(--sow\); \}/.test(css),
  "crop-page calendar still colours .on.sow_indoors with --sow");
ok(/\.cal-legend i/.test(css), "shared .cal-legend swatch styles exist");

if (failed) { console.error(`\n${failed} profile-calendar test(s) failed.`); process.exit(1); }
console.log("✓ profile-calendar tests passed");
