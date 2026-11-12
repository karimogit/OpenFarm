// Regressions from the code review: city picks must keep a climate class,
// reminder rows must use icons, and a missing hardiness bound must not compare as zone 0.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";

const store = new Map();
const ls = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(String(k), String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
const listeners = {};
const doc = {
  getElementById: (id) => {
    if (id === "of-index") return { textContent: JSON.stringify({ regions: [{ slug: "temperate-oceanic", name: "Temperate oceanic", koppen: ["Cfb"], color: "#64ff50", similar: [] }], guides: [], varieties: [] }) };
    if (id === "of-koppen") return { textContent: JSON.stringify({ classes: [] }) };
    if (id === "save-status") return { hidden: true, textContent: "", classList: { add() {}, remove() {} } };
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  dispatchEvent: (e) => { for (const fn of listeners[e.type] || []) fn(e); return true; },
  createElement: () => ({ click() {}, setAttribute() {}, append() {} }),
  body: { append() {}, classList: { toggle() {} } },
};
globalThis.addEventListener = (t, fn) => { (listeners[t] ||= []).push(fn); };
globalThis.dispatchEvent = (e) => { for (const fn of listeners[e.type] || []) fn(e); return true; };
globalThis.window = globalThis;
globalThis.document = doc;
globalThis.localStorage = ls;
globalThis.sessionStorage = { clear() {}, getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.Event = class Event { constructor(type) { this.type = type; } };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

const { completeLocation, zoneIndex } = await import("../site/assets/js/common.js");

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const city = completeLocation(
  { lat: 52.37403, lon: 4.88969, label: "Amsterdam, The Netherlands", country: "NL" },
  { symbol: "Cfb", region: { slug: "temperate-oceanic" } },
);
ok(city.lat === 52.374 && city.lon === 4.8897, `coordinates are rounded to 4 decimals (got ${city.lat}, ${city.lon})`);
ok(city.symbol === "Cfb" && city.region === "temperate-oceanic" && city.country === "NL",
  "a place-page pick keeps the Köppen class and climate region");
ok(city.label.startsWith("Amsterdam"), "label is kept");

const kept = completeLocation(
  { lat: 1.2, lon: 3.4, label: "X", symbol: "Cfb", region: "temperate-oceanic", country: "NL" },
  null,
);
ok(kept.symbol === "Cfb" && kept.region === "temperate-oceanic", "a failed lookup does not wipe a known climate");

ok(zoneIndex("7b") != null && zoneIndex("8a") === zoneIndex("7b") + 1, "half-zones stay in order");
ok(zoneIndex("b") == null && zoneIndex("") == null && zoneIndex("undefinedb") == null,
  "a missing hardiness bound is not a zone index");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const common = read("site/assets/js/common.js");
const pick = common.slice(common.indexOf("async function pick"), common.indexOf("input.addEventListener(\"input\""));
ok(pick.includes("lookup(") && pick.includes("completeLocation("), "header place picks look up climate before saving");
ok(!/setLocation\(\{\s*lat:/.test(pick), "header place picks do not save a coordinate-only location");
ok(common.includes("icon(x.icon)") && !common.includes(">${x.icon}<"), "reminder rows render an icon, not the icon name");
ok(common.includes("z == null || lo == null || hi == null"), "hardiness warning skips the comparison when a bound is missing");

const base = read("site/_includes/base.njk");
ok(base.includes('u.indexOf("/places/") == 0'), "place pages count as the Region section in the header");
ok(read("site/_includes/guide-tile.njk").includes('data-fav="guide:{{ g.favId }}"'), "guide cards favourite the guide's own id");
ok(read("site/assets/js/home.js").includes("if (!kg?.region)"), "home map does not assume every land class has a region");
ok(read("site/assets/js/profile.js").includes("regionOf(loc.symbol)"), "profile uses the Köppen class when the stored region slug is missing");

if (failed) { console.error(`\n${failed} review-fix test(s) failed.`); process.exit(1); }
console.log("✓ review-fix tests passed");
