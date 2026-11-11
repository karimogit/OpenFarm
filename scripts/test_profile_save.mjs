// Node tests for profile validation, localStorage autosave helpers and growing-item defaults.
// Mocks a minimal DOM so we can import the browser module.
const store = new Map();
const ls = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(String(k), String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
const saveEl = { hidden: true, textContent: "", classList: { add() {}, remove() {} } };
const listeners = {};
const doc = {
  getElementById: (id) => {
    if (id === "of-index") return { textContent: JSON.stringify({ regions: [{ slug: "temperate-oceanic", name: "Temperate oceanic", koppen: ["Cfb"], color: "#000" }], guides: [], crops: [] }) };
    if (id === "of-koppen") return { textContent: JSON.stringify({ classes: [] }) };
    if (id === "save-status") return saveEl;
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  dispatchEvent: (e) => { for (const fn of listeners[e.type] || []) fn(e); return true; },
  createElement: () => ({ click() {}, setAttribute() {} }),
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
globalThis.fetch = async () => ({ ok: false });

const { validateProfile, loadProfile, saveProfile, emptyProfile, growStatus, nextGrowTask, debounce, GROW_STATUSES } = await import("../site/assets/js/common.js");

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

// Old records (no status) infer planned / sown
const old = validateProfile({
  version: 1,
  favourites: { crops: ["tomato"], varieties: [], guides: [] },
  growing: [
    { id: "a1", crop: "tomato", notes: "bed 1" },
    { id: "a2", crop: "onion", sown: "2026-03-01" },
  ],
});
ok(old.ok, "old growing records validate");
ok(old.profile.growing[0].status === "planned" && old.profile.growing[0].bed === "" && old.profile.growing[0].planted === "", "missing status -> planned, new fields default empty");
ok(old.profile.growing[1].status === "sown", "sow date without status -> sown");
ok(growStatus(old.profile.growing[0]) === "planned", "growStatus planned");
ok(growStatus(old.profile.growing[1]) === "sown", "growStatus sown");

// New fields accepted
const neu = validateProfile({
  version: 1,
  growing: [{ id: "b1", crop: "tomato", variety: "sungold", sown: "2026-04-01", planted: "2026-05-01", bed: "Greenhouse", quantity: "12 plants", status: "growing", notes: "ok" }],
});
ok(neu.ok, "full growing record validates");
ok(neu.profile.growing[0].bed === "Greenhouse" && neu.profile.growing[0].quantity === "12 plants" && neu.profile.growing[0].status === "growing", "new fields kept");

const bad = validateProfile({ version: 1, growing: [{ id: "c1", crop: "tomato", status: "thriving" }] });
ok(!bad.ok && bad.errors.some((e) => e.includes("status")), "invalid status rejected");

ok(GROW_STATUSES.join() === "planned,sown,growing,harvested", "status enum");
ok(nextGrowTask({ crop: "tomato", status: "harvested" }) === "Harvested", "harvested next task is Harvested");
ok(nextGrowTask({ crop: "tomato", status: "planned" }) === "Planned", "planned with no guide stays Planned");

// save / load
store.clear();
const saved = saveProfile({
  ...emptyProfile(),
  growing: [{ id: "z1", crop: "kale", variety: null, sown: "", planted: "", bed: "Bed 2", quantity: "1 row", status: "planned", notes: "" }],
}, { silent: true });
ok(JSON.parse(ls.getItem("openfarm.profile")).growing[0].bed === "Bed 2", "saveProfile writes localStorage immediately");
const loaded = loadProfile();
ok(loaded.growing[0].bed === "Bed 2" && loaded.growing[0].status === "planned", "loadProfile reads the saved item");
ok(saved.updated && typeof saved.updated === "string", "updated timestamp set");

// debounce
let n = 0;
const d = debounce(() => { n += 1; }, 50);
d(); d(); d();
ok(n === 0, "debounce has not fired yet");
await new Promise((r) => setTimeout(r, 80));
ok(n === 1, "debounce fires once after quiet period");
d(); d.flush();
ok(n === 2, "flush runs a pending call immediately");
d.flush();
ok(n === 2, "flush is a no-op when nothing is pending");

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log("\nAll profile save / growing-field tests passed.");
