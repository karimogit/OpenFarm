// Half-zone coverage: a sourced range must include every half-zone it spans, and no others.
// A bare zone number covers both halves (8 means 8a–8b).
import { loadCrops } from "./content.js";
import { zoneBound, zoneCovers } from "./zones.js";

let failed = 0;
function ok(cond, msg) {
  if (!cond) { failed++; console.error("FAIL:", msg); }
  else console.log("ok:", msg);
}

ok(zoneBound("1a") === 0 && zoneBound("1b") === 1, "zone 1a is index 0 and 1b is index 1");
ok(zoneBound("8a") === 14 && zoneBound("8b") === 15 && zoneBound("13b") === 25, "8a, 8b and 13b sit on the USDA half-zone scale");
ok(zoneBound("8", "start") === 14 && zoneBound("8", "end") === 15, "a bare zone 8 covers 8a and 8b");
ok(zoneCovers("8", "8", 14) && zoneCovers("8", "8", 15) && !zoneCovers("8", "8", 13) && !zoneCovers("8", "8", 16), "bare 8 matches both halves and nothing past them");
ok(zoneCovers("5b", "9a", 9) && zoneCovers("5b", "9a", 16) && !zoneCovers("5b", "9a", 8) && !zoneCovers("5b", "9a", 17), "5b–9a is inclusive");
ok(!zoneCovers("nope", "9b", 0) && !zoneCovers("5a", "", 0), "unparsed zones match nothing");

let ranged = 0;
for (const c of loadCrops()) {
  const h = c.data.hardiness;
  if (!h || !h.min || !h.max) continue;
  const start = zoneBound(h.min, "start");
  const end = zoneBound(h.max, "end");
  ok(start != null && end != null && start <= end, `${c.data.slug} hardiness ${h.min}–${h.max} parses`);
  if (start == null || end == null) continue;
  ranged++;
  for (let i = 0; i < 26; i++) {
    const inside = i >= start && i <= end;
    if (zoneCovers(h.min, h.max, i) !== inside) {
      failed++;
      console.error(`FAIL: ${c.data.slug} zone index ${i} coverage`);
      break;
    }
  }
}
ok(ranged > 0, `${ranged} crops with a sourced range are covered on their half-zones only`);

if (failed) { console.error(`\n${failed} zone test(s) failed.`); process.exit(1); }
console.log("✓ zone tests passed");
