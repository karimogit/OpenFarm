// Shared browser code for every page: location memory, Köppen → climate region lookup,
// guide matching, the Open-Meteo weather widget, the "your region" box and seed-source sorting.
// No backend: the climate grid is a ~25 kB static file and everything else is static JSON.
import { icon, flagImg } from "./icons.js";
export const BASE = window.OPENFARM_BASE || "/";
export const REPO = window.OPENFARM_REPO || "https://github.com/karimogit/OpenFarm";
function readIndex() {
  if (window.OPENFARM_INDEX) return window.OPENFARM_INDEX;
  const el = document.getElementById("of-index");
  if (el) return JSON.parse(el.textContent);
  throw new Error("OpenFarm index not loaded");
}
export const INDEX = readIndex();
export const KG = JSON.parse(document.getElementById("of-koppen").textContent);
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const REGION_BY = Object.fromEntries(INDEX.regions.map((r) => [r.slug, r]));
const KG_TO_REGION = Object.fromEntries(INDEX.regions.flatMap((r) => r.koppen.map((k) => [k, r])));
export const regionOf = (symbol) => KG_TO_REGION[symbol] || null;

// ---- Köppen grid (Beck et al. 2018, 0.5°, 360 rows × 720 cols, RLE encoded) ----
let grid = null;
async function loadGrid() {
  if (grid) return grid;
  const buf = new Uint8Array(await (await fetch(BASE + "assets/koppen-0p5.bin")).arrayBuffer());
  if (String.fromCharCode(...buf.slice(0, 4)) !== "KG05") throw new Error("bad climate grid");
  grid = new Uint8Array(360 * 720);
  let o = 0;
  for (let i = 4; i < buf.length; i += 2) { grid.fill(buf[i], o, o + buf[i + 1]); o += buf[i + 1]; }
  return grid;
}
const cell = (r, c) => grid[r * 720 + ((c % 720) + 720) % 720];

/** Returns { code, symbol, name, desc, nearest, region } – searches nearby cells if the point falls on ocean. */
export async function lookup(lat, lon) {
  await loadGrid();
  const r0 = Math.min(359, Math.max(0, Math.floor((90 - lat) / 0.5)));
  const c0 = Math.floor((((lon + 180) % 360) + 360) % 360 / 0.5);
  for (let d = 0; d <= 4; d++) {
    for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
      const r = r0 + dr; if (r < 0 || r > 359) continue;
      const v = cell(r, c0 + dc);
      if (v) { const [symbol, name, desc] = KG.classes[v]; return { code: v, symbol, name, desc, nearest: d > 0, region: regionOf(symbol) }; }
    }
  }
  return null;
}

// ---- local profile (localStorage only: no account, no server, nothing is sent anywhere) ----
// Versioned so later releases can migrate old data. v1 shape:
// { version: 1, location: {lat, lon, label, symbol, region, country} | null,
//   favourites: { crops: ["tomato"], varieties: ["tomato/sungold"], guides: ["tomato/temperate-oceanic"], tools: ["trowel"] },
//   growing: [{ id, crop, variety?, sown?, planted?, bed?, quantity?, status?, notes? }], updated: ISO date }
// status is planned | sown | growing | harvested. Older records without status are treated as sown if they
// have a sow date, otherwise planned. Changes are written to localStorage immediately (text fields debounced).
export const PROFILE_VERSION = 1;
const PKEY = "openfarm.profile", OLD_LOCATION_KEY = "openfarm.location";
const SLUG = /^[a-z0-9][a-z0-9-]*$/, PAIR = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/, GUIDE_ID = /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*){1,2}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
export const emptyProfile = () => ({ version: PROFILE_VERSION, location: null, favourites: { crops: [], varieties: [], guides: [], tools: [] }, growing: [], updated: null });
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const GROW_STATUSES = ["planned", "sown", "growing", "harvested"];
export const GROW_STATUS_LABEL = { planned: "Planned", sown: "Sown", growing: "Growing", harvested: "Harvested" };
/** Infer a status for records saved before the field existed. Never invents other values. */
export const growStatus = (g) => (g && GROW_STATUSES.includes(g.status) ? g.status : (g?.sown ? "sown" : "planned"));

/** Validates and normalises a profile object (e.g. from an imported file). Returns { ok, profile, errors }. */
export function validateProfile(p) {
  const errors = [], out = emptyProfile();
  if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, profile: null, errors: ["Not a JSON object."] };
  if (!Number.isInteger(p.version) || p.version < 1 || p.version > PROFILE_VERSION) errors.push(`Unsupported version ${JSON.stringify(p.version)} (expected 1–${PROFILE_VERSION}).`);
  if (p.location != null) {
    const l = p.location, num = (x, a) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= a;
    if (typeof l !== "object" || !num(l.lat, 90) || !num(l.lon, 180)) errors.push("location needs numeric lat (−90…90) and lon (−180…180).");
    else out.location = { lat: l.lat, lon: l.lon, label: typeof l.label === "string" ? l.label.slice(0, 300) : "",
      symbol: typeof l.symbol === "string" && /^[A-Z][A-Za-z]{1,2}$/.test(l.symbol) ? l.symbol : null,
      region: typeof l.region === "string" && SLUG.test(l.region) ? l.region : null,
      country: typeof l.country === "string" && /^[A-Z]{2}$/.test(l.country) ? l.country : null };
  }
  const f = p.favourites ?? {};
  if (typeof f !== "object" || Array.isArray(f)) errors.push("favourites must be an object.");
  else for (const [k, re] of [["crops", SLUG], ["varieties", PAIR], ["guides", GUIDE_ID], ["tools", SLUG]]) {
    const list = f[k] ?? [];
    const example = k === "varieties" || k === "guides" ? '"tomato/…"' : k === "tools" ? '"trowel"' : '"tomato"';
    if (!Array.isArray(list) || list.length > 5000 || !list.every((x) => typeof x === "string" && re.test(x))) errors.push(`favourites.${k} must be a list of ids like ${example}.`);
    else out.favourites[k] = [...new Set(list)];
  }
  const g = p.growing ?? [];
  if (!Array.isArray(g) || g.length > 5000) errors.push("growing must be a list.");
  else g.forEach((x, i) => {
    if (!x || typeof x !== "object" || typeof x.crop !== "string" || !SLUG.test(x.crop)) return errors.push(`growing[${i}] needs a crop id.`);
    if (x.variety != null && (typeof x.variety !== "string" || !SLUG.test(x.variety))) return errors.push(`growing[${i}].variety is not a valid id.`);
    if (x.sown != null && x.sown !== "" && (typeof x.sown !== "string" || !DATE.test(x.sown))) return errors.push(`growing[${i}].sown must be YYYY-MM-DD.`);
    if (x.planted != null && x.planted !== "" && (typeof x.planted !== "string" || !DATE.test(x.planted))) return errors.push(`growing[${i}].planted must be YYYY-MM-DD.`);
    if (x.notes != null && (typeof x.notes !== "string" || x.notes.length > 5000)) return errors.push(`growing[${i}].notes must be text (max 5000 characters).`);
    if (x.bed != null && (typeof x.bed !== "string" || x.bed.length > 200)) return errors.push(`growing[${i}].bed must be text (max 200 characters).`);
    let qty = "";
    if (x.quantity != null && x.quantity !== "") {
      if (typeof x.quantity === "number" && Number.isFinite(x.quantity)) qty = String(x.quantity);
      else if (typeof x.quantity === "string" && x.quantity.length <= 80) qty = x.quantity;
      else return errors.push(`growing[${i}].quantity must be short text or a number.`);
    }
    if (x.status != null && x.status !== "" && !GROW_STATUSES.includes(x.status)) return errors.push(`growing[${i}].status must be planned, sown, growing or harvested.`);
    out.growing.push({
      id: typeof x.id === "string" && x.id.length < 40 ? x.id : newId(), crop: x.crop, variety: x.variety || null,
      sown: x.sown || "", planted: x.planted || "", bed: typeof x.bed === "string" ? x.bed : "", quantity: qty,
      status: GROW_STATUSES.includes(x.status) ? x.status : (x.sown ? "sown" : "planned"), notes: x.notes || "",
    });
  });
  out.updated = typeof p.updated === "string" ? p.updated : null;
  return { ok: errors.length === 0, profile: out, errors };
}

export function loadProfile() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(PKEY)); } catch {}
  if (!raw) {
    raw = emptyProfile();
    try { const old = JSON.parse(localStorage.getItem(OLD_LOCATION_KEY)); if (old) raw.location = old; } catch {}
  }
  return validateProfile(raw).profile || emptyProfile();
}
let savedHide = 0;
/** Subtle confirmation for local saves (aria-live polite). Not shown when another tab applies a change. */
export function flashSaved(msg = "Saved") {
  const el = document.getElementById("save-status");
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
  el.classList.add("is-on");
  clearTimeout(savedHide);
  savedHide = setTimeout(() => { el.classList.remove("is-on"); el.textContent = ""; el.hidden = true; }, 1800);
}
export function debounce(fn, ms = 400) {
  let t = 0, pending = false;
  const d = (...args) => { pending = true; clearTimeout(t); t = setTimeout(() => { pending = false; fn(...args); }, ms); };
  d.flush = (...args) => { clearTimeout(t); if (pending) { pending = false; fn(...args); } };
  d.cancel = () => { clearTimeout(t); pending = false; };
  return d;
}
export function saveProfile(p, { silent = false, announce = true } = {}) {
  p.version = PROFILE_VERSION; p.updated = new Date().toISOString();
  try { localStorage.setItem(PKEY, JSON.stringify(p)); localStorage.removeItem(OLD_LOCATION_KEY); } catch {}
  if (!silent) document.dispatchEvent(new CustomEvent("openfarm:profile", { detail: p }));
  if (announce) flashSaved("Saved");
  return p;
}
export function clearProfile() {
  try { localStorage.removeItem(PKEY); localStorage.removeItem(OLD_LOCATION_KEY); localStorage.removeItem("openfarm.reminders"); sessionStorage.clear(); } catch {}
  document.dispatchEvent(new CustomEvent("openfarm:profile", { detail: emptyProfile() }));
  document.dispatchEvent(new CustomEvent("openfarm:location", { detail: null }));
  flashSaved("Cleared");
}
export function downloadText(text, type, name) {
  const blob = new Blob([text], { type });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const today = () => new Date().toISOString().slice(0, 10);
// JSON: full backup, re-importable.
export function exportProfile() {
  downloadText(JSON.stringify(loadProfile(), null, 2), "application/json", `openfarm-profile-${today()}.json`);
}
// CSV: one row per favourite or growing-list entry, for spreadsheets.
export function profileCSV(p = loadProfile()) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["list", "kind", "crop", "variety", "region", "status", "sown", "planted", "bed", "quantity", "notes", "url"]];
  for (const g of p.growing) rows.push(["growing", g.variety ? "variety" : "crop", g.crop, g.variety || "", "", growStatus(g), g.sown || "", g.planted || "", g.bed || "", g.quantity || "", g.notes || "",
    location.origin + BASE + (g.variety ? `crops/${g.crop}/${g.variety}/` : `crops/${g.crop}/`)]);
  for (const c of p.favourites.crops) rows.push(["favourite", "crop", c, "", "", "", "", "", "", "", "", location.origin + BASE + `crops/${c}/`]);
  for (const v of p.favourites.varieties) { const [c, s] = v.split("/"); rows.push(["favourite", "variety", c, s, "", "", "", "", "", "", "", location.origin + BASE + `crops/${c}/${s}/`]); }
  for (const g of p.favourites.guides) { const parts = g.split("/"); const c = parts[0], r = parts.at(-1), vari = parts.length === 3 ? parts[1] : ""; rows.push(["favourite", "guide", c, vari, r, "", "", "", "", "", "", location.origin + favGuideHref(parts.join("/"))]); }
  for (const t of p.favourites.tools) rows.push(["favourite", "tool", t, "", "", "", "", "", "", "", "", location.origin + BASE + `tools/${t}/`]);
  return rows.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}
export const exportCSV = () => downloadText("\ufeff" + profileCSV(), "text/csv;charset=utf-8", `openfarm-garden-${today()}.csv`);
// Markdown: a readable garden notebook.
export function profileMarkdown(p = loadProfile()) {
  let cat = null; try { cat = JSON.parse(document.getElementById("of-catalog")?.textContent || "null"); } catch {}
  const name = (slug) => cat?.crops?.find((c) => c.slug === slug)?.name || INDEX.guides.find((g) => g.crop === slug)?.name || slug.replace(/-/g, " ");
  const L = [`# My garden notebook`, ``, `_Exported from OpenFarm on ${today()}._`, ``];
  if (p.location) { const r = REGION_BY[p.location.region]; L.push(`**Location:** ${p.location.label?.split(",")[0] || `${p.location.lat}, ${p.location.lon}`}${r ? ` · ${r.name} (Köppen ${p.location.symbol})` : ""}`, ``); }
  L.push(`## What I'm growing`, ``);
  if (!p.growing.length) L.push(`_Nothing yet._`);
  for (const g of p.growing) {
    const bits = [GROW_STATUS_LABEL[growStatus(g)]];
    if (g.sown) bits.push(`sown ${g.sown}`);
    if (g.planted) bits.push(`planted ${g.planted}`);
    if (g.bed) bits.push(g.bed);
    if (g.quantity) bits.push(g.quantity);
    L.push(`- **${name(g.crop)}**${g.variety ? ` – ${g.variety.replace(/-/g, " ")}` : ""} · ${bits.join(" · ")}${g.notes ? `\n  ${g.notes.replace(/\n/g, "\n  ")}` : ""}`);
  }
  const mine = myCropGuides(p);
  if (mine.length) {
    L.push(``, `## Calendar for my region`, ``);
    for (const x of mine) { const c = x.m.g.calendar || {};
      const part = (k, label) => c[k]?.length ? `${label} ${c[k].map((m) => MONTHS[m - 1]).join(", ")}` : null;
      L.push(`- **${name(x.crop)}** (${x.m.g.title}): ${[part("sow_indoors", "sow indoors"), part("sow_direct", "sow outside"), part("plant", "plant"), part("harvest", "harvest")].filter(Boolean).join("; ")}`); }
  }
  L.push(``, `## Favourites`, ``);
  for (const c of p.favourites.crops) L.push(`- Crop: ${name(c)}`);
  for (const v of p.favourites.varieties) L.push(`- Variety: ${v.split("/")[1].replace(/-/g, " ")} (${name(v.split("/")[0])})`);
  for (const g of p.favourites.guides) { const parts = g.split("/"); L.push(`- Guide: ${name(parts[0])} – ${REGION_BY[parts.at(-1)]?.name || parts.at(-1)}${parts.length === 3 ? " (" + parts[1] + ")" : ""}`); }
  const toolName = (slug) => cat?.tools?.find((t) => t.slug === slug)?.name || slug.replace(/-/g, " ");
  for (const t of p.favourites.tools) L.push(`- Tool: ${toolName(t)}`);
  if (!p.favourites.crops.length && !p.favourites.varieties.length && !p.favourites.guides.length && !p.favourites.tools.length) L.push(`_None yet._`);
  return L.join("\n") + "\n";
}
export const exportMarkdown = () => downloadText(profileMarkdown(), "text/markdown;charset=utf-8", `openfarm-notebook-${today()}.md`);
const FAV_KINDS = { crop: "crops", variety: "varieties", guide: "guides", tool: "tools" };
export const isFav = (kind, id, p = loadProfile()) => p.favourites[FAV_KINDS[kind]].includes(id);
export function toggleFav(kind, id) {
  const p = loadProfile(), list = p.favourites[FAV_KINDS[kind]], i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  saveProfile(p); return i < 0;
}
export function addGrowing(crop, variety = null) {
  const p = loadProfile();
  const item = { id: newId(), crop, variety, sown: "", planted: "", bed: "", quantity: "", status: "planned", notes: "" };
  p.growing.push(item);
  saveProfile(p);
  return item;
}
export const isGrowing = (crop, variety = null, p = loadProfile()) => p.growing.some((g) => g.crop === crop && (!variety || g.variety === variety));

export const getLocation = () => loadProfile().location;
/** Location saved from a map pick. Keeps a known Köppen class when the lookup misses. */
export function completeLocation(loc, kg) {
  if (!loc) return null;
  return {
    lat: +(+loc.lat).toFixed(4),
    lon: +(+loc.lon).toFixed(4),
    label: loc.label || "",
    symbol: kg?.symbol || loc.symbol || null,
    region: kg?.region?.slug || loc.region || null,
    country: loc.country || null,
  };
}
export function setLocation(loc, { announce = true } = {}) {
  const p = loadProfile(); p.location = loc; saveProfile(p, { silent: true, announce });
  document.dispatchEvent(new CustomEvent("openfarm:location", { detail: loc }));
}
// A city page link used to store coordinates only, which dropped the climate region.
// Fill it back in once, without a "Saved" toast, when a profile still has that shape.
let climateFillKey = "";
function ensureClimate(loc) {
  if (!loc || loc.symbol || !Number.isFinite(+loc.lat) || !Number.isFinite(+loc.lon)) return;
  const key = `${loc.lat},${loc.lon}`;
  if (climateFillKey === key) return;
  climateFillKey = key;
  lookup(+loc.lat, +loc.lon).then((kg) => {
    const current = getLocation();
    if (!current || current.symbol || !kg?.symbol) return;
    if (Math.abs(+current.lat - +loc.lat) > 1e-3 || Math.abs(+current.lon - +loc.lon) > 1e-3) return;
    setLocation(completeLocation(current, kg), { announce: false });
  }).catch(() => { if (climateFillKey === key) climateFillKey = ""; });
}

// Other open tabs pick up profile (and reminder) changes via the storage event. This tab does not
// receive that event for its own writes, so local saves still dispatch openfarm:* directly.
window.addEventListener("storage", (e) => {
  if (e.key === PKEY || e.key === OLD_LOCATION_KEY || (e.key == null && e.newValue == null)) {
    const p = loadProfile();
    document.dispatchEvent(new CustomEvent("openfarm:profile", { detail: p, bubbles: false }));
    document.dispatchEvent(new CustomEvent("openfarm:location", { detail: p.location }));
  }
  if (e.key === "openfarm.reminders") document.dispatchEvent(new CustomEvent("openfarm:profile"));
});

// ---- matching: guide for this exact class → same region → most similar region ----
const shift = (months, n) => months.map((m) => ((m - 1 + n) % 12) + 1);
export function matchGuides(symbol, lat, onlyCrop = null) {
  const region = regionOf(symbol);
  const south = lat < 0, tropical = symbol[0] === "A";
  const byCrop = {};
  for (const g of INDEX.guides) if (!onlyCrop || g.crop === onlyCrop) (byCrop[g.crop] ||= []).push(g);
  const out = [];
  for (const list of Object.values(byCrop)) {
    let g = list.find((x) => x.koppen.includes(symbol)), kind = "exact", via = region;
    if (g && region && g.region !== region.slug) via = REGION_BY[g.region];
    if (!g && region) { g = list.find((x) => x.region === region.slug); kind = "region"; }
    if (!g && region) {
      for (const s of region.similar) {
        const r = REGION_BY[s];
        g = list.find((x) => x.region === s) || list.find((x) => x.koppen.some((k) => r.koppen.includes(k)));
        if (g) { kind = "similar"; via = REGION_BY[g.region]; break; }
      }
    }
    if (!g) continue;
    let calendar = g.calendar, shifted = false;
    if (south && g.hemisphere === "north" && !tropical) {
      calendar = Object.fromEntries(Object.entries(g.calendar).map(([k, v]) => [k, shift(v, 6)]));
      shifted = true;
    }
    out.push({ g, kind, via, calendar, shifted });
  }
  const rank = { exact: 0, region: 1, similar: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.g.name.localeCompare(b.g.name));
}

/** Next calendar task for a growing-list card, from the matched regional guide only. */
export function nextGrowTask(g, loc = getLocation(), now = new Date()) {
  const status = growStatus(g);
  if (status === "harvested") return "Harvested";
  const month = now.getMonth() + 1;
  const m = loc?.symbol ? matchGuides(loc.symbol, loc.lat, g.crop)[0] : null;
  const cal = m?.calendar || m?.g?.calendar || {};
  const upcoming = (key) => {
    const months = cal[key] || [];
    if (!months.length) return null;
    for (let i = 0; i < 12; i++) {
      const mo = ((month - 1 + i) % 12) + 1;
      if (months.includes(mo)) return { key, mo, thisMonth: i === 0 };
    }
    return null;
  };
  const labelOf = (key) => key === "sow_indoors" ? "Sow indoors" : key === "sow_direct" ? "Sow outside" : key === "plant" ? "Plant out" : key === "harvest" ? "Harvest" : "Prune";
  const fmt = (s) => s.thisMonth ? `${labelOf(s.key)} this month` : `${labelOf(s.key)} in ${MONTHS[s.mo - 1]}`;
  if (status === "planned") {
    const s = upcoming("sow_indoors") || upcoming("sow_direct") || upcoming("plant");
    return s ? fmt(s) : GROW_STATUS_LABEL.planned;
  }
  if (status === "sown") {
    const s = upcoming("plant");
    return s ? fmt(s) : GROW_STATUS_LABEL.sown;
  }
  const h = upcoming("harvest");
  if (h) return fmt(h);
  const pr = upcoming("prune");
  if (pr?.thisMonth) return fmt(pr);
  return GROW_STATUS_LABEL.growing;
}

export function addGuideUrl(crop, region) {
  const value = `---\ncrop: ${crop}\nregion: ${region}\ntitle: \nkoppen: []\nhemisphere: north\nreference_location: \ncalendar:\n  harvest: []\nsun: full\nwater: moderate\nconfidence: medium\nuncertainty: \nsources:\n  - title: \n    url: https://\nlicense: CC-BY-SA-4.0\nauthors: []\nlast_reviewed: ${new Date().toISOString().slice(0, 10)}\n---\n\n## Summary\n\n`;
  return `${REPO}/new/main/content/guides/${crop}?filename=${region}.md&value=${encodeURIComponent(value)}`;
}

export function calendarHTML(cal) {
  const ROWS = [["sow_indoors", "Sow indoors"], ["sow_direct", "Sow outside"], ["plant", "Plant out"], ["prune", "Prune"], ["harvest", "Harvest"]];
  let h = `<div class="cal"><div class="cal-row cal-head"><span class="cal-label"></span>${MONTHS.map((m) => `<span data-m="${m[0]}">${m}</span>`).join("")}</div>`;
  for (const [k, label] of ROWS) if (cal[k]) h += `<div class="cal-row"><span class="cal-label">${label}</span>${MONTHS.map((m, i) => `<span class="${cal[k].includes(i + 1) ? "on " + k : ""}" title="${label} – ${m}"></span>`).join("")}</div>`;
  return h + `</div>`;
}

export const thumbHTML = (img, cls = "thumb") => img
  ? `<span class="${cls}"><img src="${img.src}"${img.srcset ? ` srcset="${img.srcset}"` : ""} alt="" loading="lazy" style="max-width:${img.w || 250}px;max-height:${img.h || 250}px"></span>`
  : `<span class="${cls} none">${icon("sprout")}</span>`;

export const swatch = (r) => `<span class="swatch sm" style="background:${r.color}"></span>`;
const place = (loc) => esc((loc.label || "").split(",")[0] || `${loc.lat}, ${loc.lon}`);

// ---- header chip ----
function renderHere(loc) {
  const a = $("[data-here]"); if (!a) return;
  if (!loc) { a.hidden = true; return; }
  const r = REGION_BY[loc.region];
  a.hidden = false;
  a.innerHTML = `${place(loc)}${r ? ` · ${swatch(r)}${esc(r.name)}` : ""}`;
  a.title = "Your saved location – click for your climate region";
  if (r) a.href = `${BASE}regions/${r.slug}/`;
}

// ---- weather (Open-Meteo, free, no key) ----
async function forecast(lat, lon) {
  const key = `openfarm.wx.${lat.toFixed(2)},${lon.toFixed(2)}`;
  try { const c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.t < 3600e3) return c.d; } catch {}
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&hourly=soil_temperature_6cm&forecast_days=7&timezone=auto";
  const d = await (await fetch(url)).json();
  if (d.error) throw new Error(d.reason);
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch {}
  return d;
}
const ICON = (c) => (c === 0 ? "☀️" : c <= 3 ? "⛅" : c <= 48 ? "🌫️" : c <= 67 ? "🌧️" : c <= 77 ? "🌨️" : c <= 82 ? "🌦️" : c <= 86 ? "🌨️" : "⛈️");
async function renderWeather(loc) {
  const boxes = document.querySelectorAll("[data-weather]");
  if (!boxes.length || !loc) return;
  let html;
  try {
    const d = await forecast(loc.lat, loc.lon);
    const days = d.daily.time.map((t, i) => {
      const soil = d.hourly.soil_temperature_6cm.slice(i * 24, i * 24 + 24).filter((x) => x !== null);
      return { t, max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i], rain: d.daily.precipitation_sum[i] || 0,
        code: d.daily.weather_code[i], soil: soil.length ? soil.reduce((a, b) => a + b, 0) / soil.length : null };
    });
    const frost = days.filter((x) => x.min <= 0), risk = days.filter((x) => x.min > 0 && x.min <= 3);
    const rain = days.reduce((a, x) => a + x.rain, 0);
    const wd = (t) => new Date(t + "T12:00").toLocaleDateString("en", { weekday: "short" });
    const soilToday = days[0].soil;
    html = `<p class="small">${place(loc)} · next 7 days</p>
      <ul class="wx-summary">
        <li class="${frost.length ? "bad" : risk.length ? "warn-t" : "ok"}">${frost.length ? `❄️ Frost likely: ${frost.map((x) => wd(x.t)).join(", ")}` : risk.length ? `🥶 Frost risk (≤ 3 °C): ${risk.map((x) => wd(x.t)).join(", ")}` : "✅ No frost forecast"}</li>
        <li>🌡️ Soil at 6 cm today: <strong>${soilToday === null ? "–" : soilToday.toFixed(1) + " °C"}</strong></li>
        <li>💧 Rain this week: <strong>${rain.toFixed(1)} mm</strong></li>
      </ul>
      <table class="wx"><thead><tr><th></th><th></th><th>min / max</th><th>rain</th><th>soil</th></tr></thead><tbody>
      ${days.map((x) => `<tr class="${x.min <= 0 ? "frost" : ""}"><th scope="row">${wd(x.t)}</th><td>${ICON(x.code)}</td><td>${Math.round(x.min)}° / ${Math.round(x.max)}°</td><td>${x.rain ? x.rain.toFixed(1) : "0"} mm</td><td>${x.soil === null ? "–" : Math.round(x.soil) + "°"}</td></tr>`).join("")}
      </tbody></table>
      <p class="small muted">Use soil temperature and frost risk alongside the sowing months – e.g. wait for warm soil before planting out frost-tender crops.</p>`;
  } catch {
    html = `<p class="small muted">Weather is unavailable right now.</p>`;
  }
  boxes.forEach((b) => { const body = b.querySelector("[data-weather-body]"); if (body) body.innerHTML = html; });
}

// ---- "your region" box on crop pages ----
function renderYourRegion(loc) {
  const box = $("[data-your-region]"); if (!box) return;
  const crop = box.dataset.crop, name = box.dataset.cropName || crop;
  box.hidden = false;
  if (!loc || !loc.symbol) {
    box.innerHTML = `<p class="small"><a href="${BASE}#where">Set your location</a> to see which guide fits your climate region and your hardiness zone.</p>`;
    return;
  }
  const region = regionOf(loc.symbol);
  const [m] = matchGuides(loc.symbol, loc.lat, crop);
  if (!region) {
    box.innerHTML = `<p class="small">Köppen <strong>${esc(loc.symbol)}</strong> is not mapped to a climate region yet. The general facts are under <a href="#facts">Quick facts</a>.</p>`;
    renderCropGuides(loc, crop);
    return;
  }
  const vars = INDEX.varieties.filter((v) => v.crop === crop && v.regions.includes(region.slug));
  let h = `<h2>${swatch(region)} For ${place(loc)}: ${esc(region.name)}</h2>`;
  if (m && m.kind !== "similar") {
    h += `<p>✅ <a href="${guideHref(m.g)}"><strong>${esc(m.g.title)}</strong></a> fits your climate region${m.kind === "region" ? ` (written for a related class, not ${esc(loc.symbol)} exactly)` : ""}.</p>`;
  } else {
    h += `<p>No guide for <strong>${esc(region.name.toLowerCase())}</strong> yet – meanwhile:</p><ul class="small">`;
    if (m) h += `<li>Nearest region with a guide: <a href="${guideHref(m.g)}"><strong>${esc(m.g.title)}</strong></a>
      <span class="note-flag">${esc(m.via.name.toLowerCase())} – not written for yours, check the timing</span></li>`;
    h += `<li>The general facts – sowing, spacing, temperatures and days to harvest – are under <a href="#facts">Quick facts</a> and apply everywhere.</li>`;
    h += `<li><a href="${addGuideUrl(crop, region.slug)}" target="_blank" rel="noopener noreferrer">No guide for ${esc(region.name)} yet – write one<span class="visually-hidden"> (opens in new tab)</span></a></li></ul>`;
  }
  if (m?.shifted) h += `<p class="note-flag">Southern hemisphere: the guide's months are for the north – shift by about six months (unverified).</p>`;
  if (vars.length) h += `<p class="small">Varieties recommended for your region: ${vars.map((v) => `<a href="${BASE}crops/${v.crop}/${v.slug}/">${esc(v.name)}</a>`).join(", ")}</p>`;
  box.innerHTML = h;
  renderCropGuides(loc, crop);
}

// Crop pages: when a region is set, feature that guide and collapse the rest.
function renderCropGuides(loc, crop) {
  const wrap = document.querySelector("[data-guides]");
  if (!wrap) return;
  const heading = wrap.querySelector("#guides");
  const cards = [...wrap.querySelectorAll("[data-guide-region]")];
  const old = wrap.querySelector("[data-other-guides]");
  if (old) {
    for (const c of [...old.querySelectorAll("[data-guide-region]")]) wrap.append(c);
    old.remove();
  }
  cards.forEach((c) => { c.hidden = false; c.classList.remove("guide-featured"); });
  const slug = crop || wrap.dataset.crop;
  const [m] = loc?.symbol && slug ? matchGuides(loc.symbol, loc.lat, slug) : [];
  const mineSlug = m && m.kind !== "similar" ? m.g.region : null;
  if (!loc?.symbol) {
    if (heading) { heading.hidden = false; heading.textContent = "Growing guides by climate region"; }
    return;
  }
  if (heading) heading.hidden = true;
  const mine = cards.filter((c) => c.dataset.guideRegion === mineSlug);
  const others = cards.filter((c) => c.dataset.guideRegion !== mineSlug);
  mine.forEach((c) => { c.classList.add("guide-featured"); wrap.append(c); });
  if (others.length) {
    const d = document.createElement("details");
    d.className = "other-guides";
    d.dataset.otherGuides = "1";
    const s = document.createElement("summary");
    s.textContent = `Other climate regions (${others.length})`;
    d.append(s);
    others.forEach((c) => d.append(c));
    wrap.append(d);
  }
}

// Variety pages without a region recommendation: point to the guide for the visitor's region, if any.
(function varietyRegionHint() {
  const el = $("[data-your-region-variety]"); const loc = getLocation(); if (!el || !loc?.symbol) return;
  const region = regionOf(loc.symbol); const [m] = matchGuides(loc.symbol, loc.lat, el.dataset.crop);
  if (!region) return;
  el.innerHTML = m && m.kind !== "similar"
    ? `For your region (${swatch(region)}${esc(region.name)}): <a href="${guideHref(m.g)}">${esc(m.g.title)}</a>.`
    : `No guide for ${swatch(region)}${esc(region.name)} yet – <a href="${addGuideUrl(el.dataset.crop, region.slug)}" target="_blank" rel="noopener noreferrer">write one<span class="visually-hidden"> (opens in new tab)</span></a>.`;
})();

// ---- seed sources: put the ones serving your country first ----
function renderSeedSources(loc) {
  const cc = loc?.country?.toUpperCase() || "";
  const region = loc?.region || "";
  const filtering = !!(cc || region);
  document.querySelectorAll("[data-seed-sources]").forEach((box) => {
    const ul = box.querySelector("ul") || (box.matches("ul") ? box : box.querySelector(".seed-cards"));
    if (!ul) return;
    const showAll = box.dataset.seedShowAll === "1";
    const items = [...ul.children];
    let matched = 0;
    for (const li of items) {
      const countries = (li.dataset.countries || "").split(",").filter(Boolean);
      const regions = (li.dataset.regions || "").split(",").filter(Boolean);
      const near = (cc && countries.includes(cc)) || (region && regions.includes(region));
      li.classList.toggle("near", !!near);
      if (near) matched++;
      li.hidden = filtering && !showAll && !near;
    }
    items.sort((a, b) => b.classList.contains("near") - a.classList.contains("near")).forEach((li) => ul.append(li));
    // If nothing matches this country/region, show everyone rather than an empty list.
    if (filtering && !showAll && !matched) items.forEach((li) => { li.hidden = false; });
    const status = box.querySelector("[data-seed-filter-status]");
    const btn = box.querySelector("[data-seed-show-all]");
    if (status) {
      if (filtering && matched && !showAll) {
        status.hidden = false;
        status.textContent = `Showing seed sources for your country or climate region (${matched} of ${items.length}).`;
      } else if (filtering && !matched) {
        status.hidden = false;
        status.textContent = "No listed sources match your country or climate region yet — showing all.";
      } else {
        status.hidden = true;
      }
    }
    if (btn) {
      if (filtering && matched && matched < items.length) {
        btn.hidden = false;
        btn.textContent = showAll ? "Show matching only" : "Show all";
      } else btn.hidden = true;
    }
  });
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-seed-show-all]");
  if (!btn) return;
  const box = btn.closest("[data-seed-sources]");
  if (!box) return;
  box.dataset.seedShowAll = box.dataset.seedShowAll === "1" ? "0" : "1";
  renderSeedSources(getLocation());
});

// ---- favourite (♥) and "I'm growing this" buttons, profile counts ----
function renderProfileBits() {
  const p = loadProfile();
  document.querySelectorAll("[data-fav]").forEach((b) => {
    const [kind, id] = b.dataset.fav.split(":"); const on = isFav(kind, id, p);
    b.setAttribute("aria-pressed", on); b.classList.toggle("on", on);
    b.title = on ? "Remove from favourites" : "Add to favourites";
    b.setAttribute("aria-label", b.title);
    b.innerHTML = `${icon("heart", { filled: on, className: "icon" })}${b.dataset.label !== undefined ? ` <span>Favourite</span>` : ""}`;
  });
  document.querySelectorAll("[data-grow]").forEach((b) => {
    const [crop, variety] = b.dataset.grow.split("/"); const on = isGrowing(crop, variety || null, p);
    b.classList.toggle("on", on);
    b.innerHTML = on ? `${icon("sprout")} <span>In my garden</span>` : `${icon("plus")} <span>I'm growing this</span>`;
  });
  const n = p.favourites.crops.length + p.favourites.varieties.length + p.favourites.guides.length + p.favourites.tools.length;
  document.querySelectorAll("[data-profile-counts]").forEach((el) => {
    if (n || p.growing.length) el.innerHTML = `<a href="${BASE}profile/">${n} favourite${n === 1 ? "" : "s"} · ${p.growing.length} growing</a>`;
  });
}
document.addEventListener("click", (e) => {
  const fav = e.target.closest("[data-fav]");
  if (fav) { e.preventDefault(); const [kind, id] = fav.dataset.fav.split(":"); toggleFav(kind, id); return; }
  const grow = e.target.closest("[data-grow]");
  if (grow) {
    e.preventDefault();
    const [crop, variety] = grow.dataset.grow.split("/");
    if (isGrowing(crop, variety || null)) location.href = `${BASE}profile/#growing`;
    else addGrowing(crop, variety || null);
    return;
  }
  if (e.target.closest("[data-profile-export]")) { e.preventDefault(); exportProfile(); }
});
document.addEventListener("openfarm:profile", renderProfileBits);
renderProfileBits();

function renderAll(loc) { renderWeather(loc); renderYourRegion(loc); renderSeedSources(loc); renderYourClimate(loc); ensureClimate(loc); }
document.addEventListener("openfarm:location", (e) => renderAll(e.detail));
renderAll(getLocation());

// ---- header search: Pagefind results first, then offline GeoNames places (Nominatim as fallback) ----
(function headerSearch() {
  const form = $(".top-search"), input = form?.querySelector("input");
  if (!input) return;
  const box = document.createElement("div");
  box.className = "suggest"; box.id = "suggest"; box.setAttribute("role", "listbox"); box.hidden = true;
  form.append(box);
  input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "suggest"); input.setAttribute("aria-expanded", "false");
  let pf = null, timer = null, seq = 0, active = -1, extra = null;

  async function pagefind() {
    if (!pf) { pf = await import(`${BASE}pagefind/pagefind.js`); await pf.options?.({ baseUrl: BASE }); pf.init?.(); }
    return pf;
  }
  const opts = () => [...box.querySelectorAll("[role=option]")];
  function setActive(i) {
    const o = opts(); if (!o.length) return;
    active = (i + o.length) % o.length;
    o.forEach((el, j) => el.setAttribute("aria-selected", j === active));
    input.setAttribute("aria-activedescendant", o[active].id); o[active].scrollIntoView({ block: "nearest" });
  }
  function close() { box.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; }
  function render(q, pages, localHits) {
    let i = 0;
    const opt = (html, attrs) => `<div role="option" id="sg-${i++}" class="sg-opt" ${attrs}>${html}</div>`;
    let h = "";
    if (pages.length) h += `<div class="sg-group" role="presentation">Plants, guides &amp; regions</div>` +
      pages.map((p) => opt(`<strong>${esc(p.meta?.title || p.url)}</strong><span>${p.excerpt || ""}</span>`, `data-href="${esc(p.url)}"`)).join("");
    h += `<div class="sg-group" role="presentation">Places</div>`;
    if (localHits.length) {
      h += localHits.map((it) => {
        const label = placeLabel(it);
        const page = it.slug && INDEX.placePages?.[it.slug];
        const pageHref = page ? `${BASE}${String(page).replace(/^\//, "")}` : "";
        return opt(`${flagImg(it.cc, BASE, placesData?.countries?.[it.cc]?.[0] || it.cc)} ${esc(label)}`,
          `data-lat="${it.lat}" data-lon="${it.lon}" data-label="${esc(label)}" data-cc="${esc(it.cc || "")}"${it.slug ? ` data-place="${esc(it.slug)}"` : ""}${pageHref ? ` data-href="${esc(pageHref)}"` : ""}`);
      }).join("");
      h += `<div class="sg-note">Places: GeoNames, CC BY 4.0</div>`;
    } else if (q.length >= 2) {
      h += `<div class="sg-note">No matching cities in the offline list.</div>`;
    }
    if (extra && extra.q === q) {
      h += extra.items.length ? extra.items.map((it) => opt(`${flagImg(it.address?.country_code, BASE)} ${esc(it.display_name)}`,
        `data-lat="${it.lat}" data-lon="${it.lon}" data-label="${esc(it.display_name)}" data-cc="${esc(it.address?.country_code?.toUpperCase() || "")}"`)).join("")
        : `<div class="sg-note">No extra places found.</div>`;
      h += `<div class="sg-note">Extra places: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, Nominatim</div>`;
    } else if (q.length >= 3) {
      h += opt(`Find more places for “${esc(q)}” on OpenStreetMap…`, `data-places="1"`);
    }
    h += opt(`All results for “${esc(q)}”`, `data-href="${BASE}search/?q=${encodeURIComponent(q)}"`);
    box.innerHTML = h; box.hidden = false; input.setAttribute("aria-expanded", "true"); active = -1;
  }
  async function update() {
    const q = input.value.trim(), my = ++seq;
    if (q.length < 2) { close(); return; }
    let pages = [], localHits = [];
    try { await loadPlaces(); localHits = searchPlaces(q, 8); } catch {}
    try {
      const s = await (await pagefind()).search(q);
      pages = await Promise.all(s.results.slice(0, 5).map((r) => r.data()));
    } catch {}
    if (my === seq) render(q, pages, localHits);
  }
  async function findPlaces() {
    const q = input.value.trim(); if (q.length < 3) return;
    extra = { q, items: [] };
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=3&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": navigator.language || "en" } });
      extra.items = (await r.json()).slice(0, 3);
    } catch {}
    await update(); setActive(opts().findIndex((o) => o.dataset.lat));
  }
  async function pick(el) {
    if (!el) return;
    if (el.dataset.places) return findPlaces();
    if (el.dataset.lat) {
      const lat = +el.dataset.lat, lon = +el.dataset.lon;
      const kg = await lookup(lat, lon);
      setLocation(completeLocation({
        lat, lon, label: el.dataset.label, country: el.dataset.cc || null,
      }, kg));
      // Cities with a standing page navigate there; others open the home map.
      // Both must keep the Köppen class — dropping it made the rest of the site
      // treat a saved city as "no location".
      if (el.dataset.href) { location.href = el.dataset.href; return; }
      location.href = locationHref(lat, lon, el.dataset.place);
      return;
    }
    if (el.dataset.href) location.href = el.dataset.href;
  }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 250); });
  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Escape") { close(); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(opts()[active]); }
  });
  box.addEventListener("mousedown", (e) => { const o = e.target.closest("[role=option]"); if (o) { e.preventDefault(); pick(o); } });
  input.addEventListener("blur", () => setTimeout(close, 150));
})();

// ---- reminders (bell) – computed in the browser from the local profile, the region calendar and the forecast ----
// There is no push server: reminders appear when the site is open. Browser notifications are optional and only
// requested when the user clicks "Notify me". For reminders while the site is closed, export the .ics calendar.
const RKEY = "openfarm.reminders";
const loadR = () => { try { return { read: [], notified: [], notify: false, ...JSON.parse(localStorage.getItem(RKEY)) }; } catch { return { read: [], notified: [], notify: false }; } };
const saveR = (r) => { r.read = r.read.slice(-500); r.notified = r.notified.slice(-500); try { localStorage.setItem(RKEY, JSON.stringify(r)); } catch {} };
const ACTIONS = { sow_indoors: "Sow %s indoors", sow_direct: "Sow %s outside", plant: "Plant out %s", prune: "Prune %s", harvest: "Harvest %s" };
const lc = (s) => s.toLowerCase();

/** Crops the user cares about (growing first, then favourite crops), with the guide that fits their region. */
export function myCropGuides(p = loadProfile()) {
  if (!p.location?.symbol) return [];
  const crops = [...new Set([...p.growing.map((g) => g.crop), ...p.favourites.crops])];
  return crops.map((c) => ({ crop: c, growing: p.growing.some((g) => g.crop === c), m: matchGuides(p.location.symbol, p.location.lat, c)[0] })).filter((x) => x.m);
}

export async function computeReminders() {
  const p = loadProfile(), out = [], now = new Date(), month = now.getMonth() + 1, ym = now.toISOString().slice(0, 7);
  for (const { crop, growing, m } of myCropGuides(p)) {
    const name = lc(m.g.name), url = `${guideHref(m.g)}`;
    const items = p.growing.filter((g) => g.crop === crop);
    const allHarvested = items.length > 0 && items.every((g) => growStatus(g) === "harvested");
    if (allHarvested) continue;
    for (const [k, tmpl] of Object.entries(ACTIONS)) {
      const months = m.calendar[k] || [];
      if (months.includes(month)) {
        const ending = !months.includes((month % 12) + 1);
        out.push({ id: `${ym}:${k}:${crop}`, icon: k === "harvest" ? "wheat" : k === "prune" ? "scissors" : "sprout", url,
          text: `${tmpl.replace("%s", name)} – ${ending ? "last month of the window" : "this month"}${growing ? "" : " (favourite)"}` });
      }
    }
  }
  if (p.location) {
    try {
      const d = await forecast(p.location.lat, p.location.lon);
      const days = d.daily.time.map((t, i) => ({ t, min: d.daily.temperature_2m_min[i], max: d.daily.temperature_2m_max[i], rain: d.daily.precipitation_sum[i] || 0 }));
      const wd = (t) => new Date(t + "T12:00").toLocaleDateString("en", { weekday: "long" });
      const frost = days.filter((x) => x.min <= 0), rain = days.reduce((a, x) => a + x.rain, 0);
      const grown = p.growing.map((g) => lc(CROP_NAME(g.crop)));
      if (frost.length) out.push({ id: `${frost[0].t}:frost`, icon: "snowflake", url: `${BASE}profile/`,
        text: `Frost forecast ${wd(frost[0].t)} (${Math.round(frost[0].min)} °C) – protect seedlings and tender plants` });
      if (rain < 5 && Math.max(...days.map((x) => x.max)) >= 18) out.push({ id: `${days[0].t}:dry`, icon: "droplet", url: `${BASE}profile/`,
        text: `Dry week ahead (${rain.toFixed(1)} mm rain forecast)${grown.length ? ` – water ${[...new Set(grown)].slice(0, 3).join(", ")}` : " – water new sowings"}` });
      if (rain >= 50) out.push({ id: `${days[0].t}:wet`, icon: "cloud-rain", url: `${BASE}profile/`, text: `Very wet week ahead (${Math.round(rain)} mm) – check drainage and watch for slugs and blight` });
    } catch {}
  }
  return out;
}
const CROP_NAME = (slug) => INDEX.guides.find((g) => g.crop === slug)?.name || slug.replace(/-/g, " ");

async function renderBell() {
  const btn = $("[data-bell]"), panel = $("#bell-panel"); if (!btn) return;
  const items = await computeReminders(), r = loadR();
  const unread = items.filter((x) => !r.read.includes(x.id));
  const count = $("[data-bell-count]"); count.hidden = !unread.length; count.textContent = unread.length;
  btn.title = unread.length ? `${unread.length} new reminder${unread.length > 1 ? "s" : ""}` : "Reminders";
  const p = loadProfile();
  const dot = $("[data-profile-dot]");
  if (dot) dot.hidden = !(p.location || p.growing.length || p.favourites.crops.length + p.favourites.varieties.length + p.favourites.guides.length + p.favourites.tools.length);
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  panel.innerHTML = `<div class="bp-head"><strong>Reminders</strong>${unread.length ? `<button type="button" class="link-btn" data-bell-read>Mark all read</button>` : ""}</div>
    ${items.length ? `<ul class="bp-list">${items.map((x) => `<li class="${r.read.includes(x.id) ? "" : "unread"}"><a href="${x.url}" data-rid="${esc(x.id)}">${icon(x.icon)} ${esc(x.text)}</a></li>`).join("")}</ul>`
      : `<p class="small">${p.location ? "No reminders right now. Add crops to “What I'm growing” on your profile to get sowing and harvest reminders." : `Set your location on the <a href="${BASE}#where">home page</a> and add crops you grow to get reminders.`}</p>`}
    <div class="bp-foot small">
      ${perm === "unsupported" ? "" : perm === "granted" && r.notify ? "Browser notifications are on while the site is open." :
        perm === "denied" ? "Browser notifications are blocked in your browser settings." : `<button type="button" class="link-btn" data-bell-notify>Notify me in this browser</button>`}
      · <a href="${BASE}profile/#calendar">Add to my phone calendar (.ics)</a>
      <p class="credit">Reminders are worked out in this browser from your profile, your region's calendar and the Open-Meteo forecast. Nothing is sent to a server.</p></div>`;
  // Show new reminders as browser notifications only if the user switched this on.
  if (r.notify && perm === "granted") {
    for (const x of unread.filter((x) => !r.notified.includes(x.id)).slice(0, 3)) {
      try { new Notification("OpenFarm", { body: x.text, tag: x.id }); } catch {}
      r.notified.push(x.id);
    }
    saveR(r);
  }
}
document.addEventListener("click", async (e) => {
  const btn = $("[data-bell]"), panel = $("#bell-panel"); if (!btn) return;
  if (e.target.closest("[data-bell]")) {
    panel.hidden = !panel.hidden; btn.setAttribute("aria-expanded", !panel.hidden);
    if (!panel.hidden) panel.querySelector("a, button")?.focus();
    return;
  }
  if (e.target.closest("[data-bell-read]")) {
    const r = loadR(); (await computeReminders()).forEach((x) => r.read.includes(x.id) || r.read.push(x.id)); saveR(r); renderBell(); return;
  }
  if (e.target.closest("[data-bell-notify]")) {
    const res = await Notification.requestPermission(); const r = loadR(); r.notify = res === "granted"; saveR(r); renderBell(); return;
  }
  const a = e.target.closest("[data-rid]");
  if (a) { const r = loadR(); r.read.includes(a.dataset.rid) || r.read.push(a.dataset.rid); saveR(r); }
  if (!e.target.closest("#bell-panel") && !panel.hidden) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }
});
document.addEventListener("keydown", (e) => {
  const panel = $("#bell-panel");
  if (e.key === "Escape" && panel && !panel.hidden) { panel.hidden = true; $("[data-bell]").setAttribute("aria-expanded", "false"); $("[data-bell]").focus(); }
});
document.addEventListener("openfarm:profile", renderBell);
document.addEventListener("openfarm:location", renderBell);
renderBell();

// ---- calendar export (.ics): yearly all-day events for sowing, planting, pruning and harvest windows ----
export function buildICS(p = loadProfile()) {
  const esc = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const fold = (l) => l.match(/.{1,73}/g).join("\r\n ");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const year = new Date().getFullYear(), site = location.origin + BASE;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OpenFarm//Growing reminders//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:OpenFarm – my garden"];
  for (const { crop, m } of myCropGuides(p).filter((x) => x.growing)) {
    for (const [k, tmpl] of Object.entries(ACTIONS)) {
      const months = [...new Set(m.calendar[k] || [])].sort((a, b) => a - b);
      // contiguous runs, e.g. [3,4,5,9] → [[3,5],[9,9]] (Dec→Jan wraps are kept as separate runs)
      const runs = []; for (const mo of months) { const last = runs.at(-1); if (last && mo === last[1] + 1) last[1] = mo; else runs.push([mo, mo]); }
      for (const [a, b] of runs) {
        const pad = (n) => String(n).padStart(2, "0");
        const end = b === 12 ? `${year + 1}0101` : `${year}${pad(b + 1)}01`;
        const title = `${tmpl.replace("%s", lc(m.g.name))}${a === b ? "" : ` (${MONTHS[a - 1]}–${MONTHS[b - 1]})`}`;
        lines.push("BEGIN:VEVENT", `UID:openfarm-${crop}-${k}-${a}@openfarm`, `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${year}${pad(a)}01`, `DTEND;VALUE=DATE:${end}`, "RRULE:FREQ=YEARLY", "TRANSP:TRANSPARENT",
          fold(`SUMMARY:${esc("🌱 " + title)}`), fold(`DESCRIPTION:${esc(`${m.g.title}${m.kind === "similar" ? " (nearest region – not written for yours)" : ""}${m.shifted ? " (months shifted for the southern hemisphere – unverified)" : ""}\n${site}${m.g.url ? m.g.url.replace(/^\//, "") : `crops/${m.g.crop}/${m.g.region}/`}`)}`),
          fold(`URL:${site}${m.g.url ? m.g.url.replace(/^\//, "") : `crops/${m.g.crop}/${m.g.region}/`}`),
          "BEGIN:VALARM", "ACTION:DISPLAY", fold(`DESCRIPTION:${esc(title)}`), "TRIGGER;RELATED=START:PT9H", "END:VALARM", "END:VEVENT");
      }
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
export function downloadICS() {
  const blob = new Blob([buildICS()], { type: "text/calendar" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "openfarm-garden.ics" });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------------------------
// Plant hardiness zone (USDA-style): average of the yearly extreme minimum temperature, 1991–2020,
// from the Open-Meteo historical weather API (ERA5 reanalysis, ~25 km grid, CC BY 4.0).
// Zone 1 starts at −60 °F; every zone is 10 °F wide and split into a (colder) and b (warmer) halves.
// Cached per 0.1° cell in localStorage, so the 30-year request is made once per place.
// ---------------------------------------------------------------------------------------------
const HZ_KEY = "openfarm.hardiness";
export const zoneIndex = (z) => { const m = /^(\d+)([ab]?)$/.exec(String(z)); return m ? (+m[1]) * 2 + (m[2] === "b" ? 1 : 0) : null; };
export function zoneFromC(minC) {
  const f = minC * 9 / 5 + 32;
  const half = Math.floor((f + 60) / 5);            // 0 = 1a
  const n = Math.max(0, Math.min(25, half));        // clamp to 1a … 13b
  return `${Math.floor(n / 2) + 1}${n % 2 ? "b" : "a"}`;
}
export async function hardinessZone(lat, lon) {
  const key = `${(+lat).toFixed(1)},${(+lon).toFixed(1)}`;
  let cache = {}; try { cache = JSON.parse(localStorage.getItem(HZ_KEY)) || {}; } catch {}
  if (cache[key]) return cache[key];
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${(+lat).toFixed(2)}&longitude=${(+lon).toFixed(2)}` +
    `&start_date=1991-01-01&end_date=2020-12-31&daily=temperature_2m_min&timezone=auto`;
  const r = await fetch(url); if (!r.ok) throw new Error("hardiness " + r.status);
  const d = await r.json(); const t = d.daily?.time || [], v = d.daily?.temperature_2m_min || [];
  const mins = {};
  t.forEach((day, i) => { const y = day.slice(0, 4); if (v[i] != null && (mins[y] == null || v[i] < mins[y])) mins[y] = v[i]; });
  const years = Object.values(mins); if (years.length < 20) return null;
  const avg = years.reduce((a, b) => a + b, 0) / years.length;
  const res = { zone: zoneFromC(avg), minC: Math.round(avg * 10) / 10, years: years.length };
  cache[key] = res; try { localStorage.setItem(HZ_KEY, JSON.stringify(cache)); } catch {}
  return res;
}
export const hardinessLine = (h) => h
  ? `<p class="hz"><strong>Hardiness zone: ${esc(h.zone)}</strong> <span class="small muted">(average yearly coldest night ${h.minC} °C, 1991–2020)</span></p>`
  : "";

// Crop / variety pages: warn when the saved location is outside the plant's hardiness range.
(async function hardinessWarning() {
  const el = document.querySelector("[data-hardiness]"); const loc = getLocation();
  if (!el || !loc) return;
  try {
    const h = await hardinessZone(loc.lat, loc.lon); if (!h) return;
    const z = zoneIndex(h.zone), lo = zoneIndex(el.dataset.min), hi = zoneIndex((el.dataset.max || "") + (/[ab]$/.test(el.dataset.max || "") ? "" : "b"));
    if (z == null || lo == null || hi == null) {
      el.innerHTML = `<p class="small">Your zone is ${esc(h.zone)}. This plant's recorded range could not be compared.</p>`;
      return;
    }
    const annual = el.dataset.annual === "1";
    let msg = "";
    if (z < lo) msg = annual ? `Your zone (${h.zone}) is colder than ${el.dataset.min}: it will not survive winter outdoors – grow it as an annual or overwinter it indoors.`
                             : `Your zone (${h.zone}) is colder than this plant's range (${el.dataset.min}–${el.dataset.max}): it may not survive winter outdoors without protection.`;
    else if (z > hi) msg = `Your zone (${h.zone}) is warmer than this plant's range (${el.dataset.min}–${el.dataset.max}): winters may be too mild (e.g. too little chilling) for it to thrive.`;
    el.innerHTML = msg ? `<p class="warn small">⚠ ${esc(msg)}</p>` : `<p class="small ok">✓ Your zone (${esc(h.zone)}) is within its range.</p>`;
  } catch { /* offline or API limit: show nothing */ }
})();

// ---- Filters & labels panel (crop and guide card lists); remembered in localStorage ----
(function cardFilters() {
  const KEY = "openfarm.ui";
  let ui = {}; try { ui = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const apply = () => {
    document.body.classList.toggle("show-labels", !!ui.labels);
    let shown = 0, total = 0;
    document.querySelectorAll(".crop-grid > li[data-guides]").forEach((li) => {
      const out = (ui.withGuide && li.dataset.guides === "0") || (ui.reviewed && li.dataset.reviewed === "0") ||
        (ui.perennial && li.dataset.life !== "perennial") ||
        (ui.edible && li.dataset.edible !== "1") ||
        (ui.flowers && li.dataset.type !== "flower");
      li.classList.toggle("ui-out", !!out); total++; if (!out) shown++;
    });
    const filtered = !!(ui.withGuide || ui.reviewed || ui.perennial || ui.edible || ui.flowers);
    document.body.classList.toggle("ui-filtered", filtered);
    document.querySelectorAll("[data-ui-count]").forEach((el) => (el.textContent = filtered ? `${shown} of ${total} shown` : ""));
    document.querySelectorAll("[data-ui]").forEach((cb) => (cb.checked = !!ui[cb.dataset.ui]));
    dispatchEvent(new Event("openfarm:filters"));
  };
  document.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-ui]"); if (!cb) return;
    ui[cb.dataset.ui] = cb.checked; try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch {}
    apply();
    flashSaved("Saved");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-ui-reset]")) return;
    ui = {}; try { localStorage.removeItem(KEY); } catch {} apply();
    flashSaved("Saved");
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    try { ui = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { ui = {}; }
    apply();
  });
  apply();
})();

// ---- Your climate sidebar + inline line (discoverable on first visit) ----
async function renderYourClimate(loc) {
  const boxes = document.querySelectorAll("[data-your-climate-body]");
  const lines = document.querySelectorAll("[data-your-climate-line]");
  const setLine = (html, show) => lines.forEach((el) => { el.hidden = !show; if (show) el.innerHTML = html; });
  if (!loc || !loc.symbol) {
    const prompt = `<p>Set your location to see your climate region and hardiness zone.</p>
      <p><a class="button small" href="${BASE}#where">Set location</a></p>`;
    boxes.forEach((b) => { b.innerHTML = prompt; });
    setLine(`Set your location to see your climate region and hardiness zone. <a href="${BASE}#where">Set location</a>`, true);
    return;
  }
  const region = regionOf(loc.symbol) || REGION_BY[loc.region];
  const placeName = (loc.label || "").split(",")[0] || `${loc.lat}, ${loc.lon}`;
  const cc = String(loc.country || "").toUpperCase();
  const countryMeta = (INDEX.countries || {})[cc];
  const countryHTML = countryMeta
    ? ` · <a href="${BASE}countries/${cc.toLowerCase()}/">${esc(countryMeta.name)}</a>`
    : (cc ? ` · ${esc(cc)}` : "");
  const regionHTML = region
    ? `${swatch(region)}<a href="${BASE}regions/${region.slug}/"><strong>${esc(region.name)}</strong></a>`
    : esc(loc.symbol || "Unknown");
  const head = `<p class="kg-big">${regionHTML}</p>
    <p class="small">${esc(placeName)}${countryHTML}${loc.symbol ? ` · Köppen <a class="kg" href="${BASE}help/#koppen">${esc(loc.symbol)}</a>` : ""} · <a href="${BASE}#where">Change</a></p>
    <div data-hz-live><p class="small muted">Hardiness zone: working it out…</p></div>`;
  boxes.forEach((b) => { b.innerHTML = head; });
  const lineBase = `Your climate: ${region ? esc(region.name) : esc(loc.symbol)}`;
  setLine(lineBase + " · Hardiness zone: working it out…", true);
  try {
    const h = await hardinessZone(loc.lat, loc.lon);
    const hz = h ? `Hardiness zone ${esc(h.zone)}` : "";
    document.querySelectorAll("[data-hz-live]").forEach((el) => {
      el.innerHTML = h ? hardinessLine(h) : `<p class="small muted">Hardiness zone unavailable right now.</p>`;
    });
    setLine(hz ? `${lineBase} · ${hz}` : lineBase, true);
  } catch {
    document.querySelectorAll("[data-hz-live]").forEach((el) => { el.innerHTML = `<p class="small muted">Hardiness zone unavailable right now.</p>`; });
    setLine(lineBase, true);
  }
}

// ---- Main-nav dropdowns (Crops, Region): hover+click desktop, disclosure on mobile, keyboard, Escape ----
(function navDrops() {
  const drops = [...document.querySelectorAll("[data-nav-drop]")];
  if (!drops.length) return;
  const mobile = () => matchMedia("(max-width: 860px)").matches;
  const menuOf = (drop) => drop.querySelector(".nav-menu");
  const btnOf = (drop) => drop.querySelector(".nav-drop-btn");
  const itemsOf = (drop) => [...(menuOf(drop)?.querySelectorAll("[role=menuitem]") || [])];
  const close = (drop) => {
    const menu = menuOf(drop), btn = btnOf(drop);
    if (!menu || !btn) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    drop.classList.remove("is-open");
  };
  const closeAll = (except) => drops.forEach((d) => { if (d !== except) close(d); });
  const open = (drop, focus = false) => {
    closeAll(drop);
    const menu = menuOf(drop), btn = btnOf(drop);
    if (!menu || !btn) return;
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    drop.classList.add("is-open");
    if (focus) itemsOf(drop)[0]?.focus();
  };
  const toggle = (drop) => (menuOf(drop)?.hidden === false ? close(drop) : open(drop, true));
  for (const drop of drops) {
    const btn = btnOf(drop);
    drop.addEventListener("mouseenter", () => { if (!mobile()) open(drop); });
    drop.addEventListener("mouseleave", () => { if (!mobile()) close(drop); });
    btn?.addEventListener("click", (e) => { e.preventDefault(); toggle(drop); });
    btn?.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); open(drop, true); }
    });
    menuOf(drop)?.addEventListener("keydown", (e) => {
      const items = itemsOf(drop);
      const i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); close(drop); btn?.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
      else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
      else if (e.key === "End") { e.preventDefault(); items.at(-1)?.focus(); }
      else if (e.key === "Tab") close(drop);
    });
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-nav-drop]")) closeAll();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
})();

// ---- Header search toggle + mobile hamburger ----
(function headerChrome() {
  const header = document.querySelector("header.top");
  if (!header) return;
  const navBtn = header.querySelector("[data-nav-toggle]");
  const searchBtn = header.querySelector("[data-search-toggle]");
  const form = header.querySelector(".top-search");
  const input = form?.querySelector("input");
  const mq = () => matchMedia("(max-width: 860px)").matches;

  function setNav(open) {
    header.classList.toggle("is-nav-open", open);
    navBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    const lab = navBtn?.querySelector(".visually-hidden");
    if (lab) lab.textContent = open ? "Close menu" : "Menu";
    if (navBtn) navBtn.title = open ? "Close menu" : "Menu";
  }
  function setSearch(open) {
    header.classList.toggle("is-search-open", open);
    searchBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      requestAnimationFrame(() => input?.focus());
    } else {
      form?.querySelector(".suggest")?.setAttribute("hidden", "");
    }
  }
  function closeAllChrome() {
    const wasSearch = header.classList.contains("is-search-open");
    setNav(false);
    setSearch(false);
    return wasSearch;
  }

  navBtn?.addEventListener("click", () => {
    const open = !header.classList.contains("is-nav-open");
    setNav(open);
  });
  searchBtn?.addEventListener("click", () => {
    const open = !header.classList.contains("is-search-open");
    setSearch(open);
    if (!open) searchBtn.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!header.classList.contains("is-nav-open") && !header.classList.contains("is-search-open")) return;
    const wasSearch = closeAllChrome();
    if (wasSearch) searchBtn?.focus();
    else navBtn?.focus();
  });
  document.addEventListener("click", (e) => {
    if (!mq()) return;
    if (e.target.closest("header.top")) return;
    closeAllChrome();
  });
  matchMedia("(max-width: 860px)").addEventListener("change", (e) => {
    if (!e.matches) closeAllChrome();
  });
})();

// ---- Offline gazetteer (GeoNames cities15000, CC BY 4.0), lazy-loaded ----
let placesData = null, placesLoading = null;
const normPlace = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export async function loadPlaces() {
  if (placesData) return placesData;
  if (!placesLoading) {
    placesLoading = fetch(BASE + "assets/places.json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { placesData = d; indexPlaces(d); return d; })
      .catch(() => { placesData = { countries: {}, admin1: {}, cities: [] }; indexPlaces(placesData); return placesData; });
  }
  return placesLoading;
}
export function searchPlaces(q, limit = 8) {
  if (!placesData) return [];
  const nq = normPlace(q);
  if (nq.length < 2) return [];
  const hits = [];
  for (const [cc, row] of Object.entries(placesData.countries || {})) {
    const [name, capital, lat, lon] = row;
    const nn = normPlace(name), ncc = normPlace(cc);
    let score = 0;
    if (nn === nq || ncc === nq) score = 100;
    else if (nn.startsWith(nq)) score = 85;
    else if (nn.includes(nq)) score = 50;
    if (score && lat != null && lon != null) hits.push({ type: "country", name, cc, lat, lon, label: name, pop: row[4] || 0, score: score + 8 });
  }
  for (const c of placesData.cities || []) {
    const [name, ascii, cc, admin, lat, lon, pop] = c;
    let score = 0;
    for (const nm of [name, ascii].filter(Boolean)) {
      const nn = normPlace(nm);
      if (nn === nq) score = Math.max(score, 100);
      else if (nn.startsWith(nq)) score = Math.max(score, 80);
      else if (nn.split(/[-'\s]/).some((w) => w.startsWith(nq))) score = Math.max(score, 65);
      else if (nn.includes(nq)) score = Math.max(score, 40);
    }
    if (score) {
      const hit = { type: "city", name, ascii, cc, admin, lat, lon, pop, score: score + Math.log10((pop || 0) + 1) };
      const keyed = placeIndex?.byCoord.get(`${lat},${lon},${cc}`);
      if (keyed) hit.slug = keyed.slug;
      hits.push(hit);
    }
  }
  hits.sort((a, b) => b.score - a.score || (b.pop || 0) - (a.pop || 0));
  return hits.slice(0, limit);
}
export function placeLabel(hit) {
  if (!hit) return "";
  if (hit.type === "country") return hit.name;
  const country = placesData?.countries?.[hit.cc]?.[0] || hit.cc;
  const admin = hit.admin && placesData?.admin1?.[`${hit.cc}.${hit.admin}`];
  return [hit.name, admin, country].filter(Boolean).join(", ");
}


// ---- Readable location URLs: ?place=amsterdam-nl (disambiguate with admin1, e.g. portland-or-us) ----
const PLACE_NEAR_KM = 25;
let placeIndex = null; // { cities, bySlug, byCoord }

function slugifyPlace(s) {
  return normPlace(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function adminSlugOf(hit) {
  const admin = hit.admin;
  if (!admin) return "";
  if (/^[A-Za-z]{1,3}$/.test(admin)) return admin.toLowerCase();
  const name = placesData?.admin1?.[`${hit.cc}.${admin}`];
  return slugifyPlace(name || admin);
}
function cityBaseSlug(hit) {
  return `${slugifyPlace(hit.ascii || hit.name)}-${String(hit.cc || "").toLowerCase()}`;
}
function indexPlaces(data) {
  const cities = (data?.cities || []).map((c) => {
    const [name, ascii, cc, admin, lat, lon, pop] = c;
    return { type: "city", name, ascii, cc, admin, lat, lon, pop };
  });
  const counts = new Map();
  for (const c of cities) {
    const b = cityBaseSlug(c);
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  const bySlug = new Map(), byCoord = new Map();
  for (const c of cities) {
    const base = cityBaseSlug(c);
    let slug = counts.get(base) > 1
      ? `${slugifyPlace(c.ascii || c.name)}-${adminSlugOf(c)}-${String(c.cc || "").toLowerCase()}`
      : base;
    if (bySlug.has(slug)) slug = `${slug}-${String(c.lat).replace(".", "p")}`;
    c.slug = slug;
    bySlug.set(slug, c);
    byCoord.set(`${c.lat},${c.lon},${c.cc}`, c);
  }
  placeIndex = { cities, bySlug, byCoord };
}
function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLon = (bLon - aLon) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
export function resolvePlace(slug) {
  if (!placeIndex || !slug) return null;
  return placeIndex.bySlug.get(String(slug).trim().toLowerCase()) || null;
}
export function nearestPlace(lat, lon, maxKm = PLACE_NEAR_KM) {
  if (!placeIndex?.cities.length) return null;
  let best = null, bestD = Infinity;
  for (const c of placeIndex.cities) {
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) return null;
  return { place: best, km: bestD, near: bestD <= maxKm };
}
export function locationSearch(lat, lon, knownSlug) {
  if (knownSlug) return `?place=${encodeURIComponent(knownSlug)}`;
  const n = nearestPlace(lat, lon);
  if (n?.near) return `?place=${encodeURIComponent(n.place.slug)}`;
  return `?lat=${(+lat).toFixed(4)}&lon=${(+lon).toFixed(4)}`;
}
// Public URL for a guide record from the client index (legacy /guides/… pages redirect).
export function guideHref(g) {
  if (g && g.url) return `${BASE}${String(g.url).replace(/^\//, "")}`;
  if (!g) return BASE;
  return g.variety ? `${BASE}crops/${g.crop}/${g.variety}/${g.region}/` : `${BASE}crops/${g.crop}/${g.region}/`;
}
export function favGuideHref(id) {
  return `${BASE}crops/${String(id).replace(/^\//, "")}/`;
}

export function locationHref(lat, lon, knownSlug) {
  return `${BASE}${locationSearch(lat, lon, knownSlug)}`;
}
