// Shared browser code for every page: location memory, Köppen → climate region lookup,
// guide matching, the Open-Meteo weather widget, the "your region" box and seed-source sorting.
// No backend: the climate grid is a ~25 kB static file and everything else is static JSON.
export const BASE = window.OPENFARM_BASE || "/";
export const REPO = window.OPENFARM_REPO || "https://github.com/karimogit/OpenFarm";
export const INDEX = JSON.parse(document.getElementById("of-index").textContent);
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
//   favourites: { crops: ["tomato"], varieties: ["tomato/sungold"], guides: ["tomato/temperate-oceanic"] },
//   growing: [{ id, crop, variety?, sown?: "YYYY-MM-DD", notes? }], updated: ISO date }
export const PROFILE_VERSION = 1;
const PKEY = "openfarm.profile", OLD_LOCATION_KEY = "openfarm.location";
const SLUG = /^[a-z0-9][a-z0-9-]*$/, PAIR = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
export const emptyProfile = () => ({ version: PROFILE_VERSION, location: null, favourites: { crops: [], varieties: [], guides: [] }, growing: [], updated: null });
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

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
  else for (const [k, re] of [["crops", SLUG], ["varieties", PAIR], ["guides", PAIR]]) {
    const list = f[k] ?? [];
    if (!Array.isArray(list) || list.length > 5000 || !list.every((x) => typeof x === "string" && re.test(x))) errors.push(`favourites.${k} must be a list of ids like ${k === "crops" ? '"tomato"' : '"tomato/…"'}.`);
    else out.favourites[k] = [...new Set(list)];
  }
  const g = p.growing ?? [];
  if (!Array.isArray(g) || g.length > 5000) errors.push("growing must be a list.");
  else g.forEach((x, i) => {
    if (!x || typeof x !== "object" || typeof x.crop !== "string" || !SLUG.test(x.crop)) return errors.push(`growing[${i}] needs a crop id.`);
    if (x.variety != null && (typeof x.variety !== "string" || !SLUG.test(x.variety))) return errors.push(`growing[${i}].variety is not a valid id.`);
    if (x.sown != null && x.sown !== "" && (typeof x.sown !== "string" || !DATE.test(x.sown))) return errors.push(`growing[${i}].sown must be YYYY-MM-DD.`);
    if (x.notes != null && (typeof x.notes !== "string" || x.notes.length > 5000)) return errors.push(`growing[${i}].notes must be text (max 5000 characters).`);
    out.growing.push({ id: typeof x.id === "string" && x.id.length < 40 ? x.id : newId(), crop: x.crop, variety: x.variety || null, sown: x.sown || "", notes: x.notes || "" });
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
export function saveProfile(p, { silent = false } = {}) {
  p.version = PROFILE_VERSION; p.updated = new Date().toISOString();
  try { localStorage.setItem(PKEY, JSON.stringify(p)); localStorage.removeItem(OLD_LOCATION_KEY); } catch {}
  if (!silent) document.dispatchEvent(new CustomEvent("openfarm:profile", { detail: p }));
  return p;
}
export function clearProfile() {
  try { localStorage.removeItem(PKEY); localStorage.removeItem(OLD_LOCATION_KEY); localStorage.removeItem("openfarm.reminders"); sessionStorage.clear(); } catch {}
  document.dispatchEvent(new CustomEvent("openfarm:profile", { detail: emptyProfile() }));
  document.dispatchEvent(new CustomEvent("openfarm:location", { detail: null }));
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
  const rows = [["list", "kind", "crop", "variety", "region", "sown", "notes", "url"]];
  for (const g of p.growing) rows.push(["growing", g.variety ? "variety" : "crop", g.crop, g.variety || "", "", g.sown || "", g.notes || "",
    location.origin + BASE + (g.variety ? `crops/${g.crop}/varieties/${g.variety}/` : `crops/${g.crop}/`)]);
  for (const c of p.favourites.crops) rows.push(["favourite", "crop", c, "", "", "", "", location.origin + BASE + `crops/${c}/`]);
  for (const v of p.favourites.varieties) { const [c, s] = v.split("/"); rows.push(["favourite", "variety", c, s, "", "", "", location.origin + BASE + `crops/${c}/varieties/${s}/`]); }
  for (const g of p.favourites.guides) { const [c, r] = g.split("/"); rows.push(["favourite", "guide", c, "", r, "", "", location.origin + BASE + `guides/${c}/${r}/`]); }
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
  for (const g of p.growing) L.push(`- **${name(g.crop)}**${g.variety ? ` – ${g.variety.replace(/-/g, " ")}` : ""}${g.sown ? ` · sown ${g.sown}` : ""}${g.notes ? `\n  ${g.notes.replace(/\n/g, "\n  ")}` : ""}`);
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
  for (const g of p.favourites.guides) L.push(`- Guide: ${name(g.split("/")[0])} – ${REGION_BY[g.split("/")[1]]?.name || g.split("/")[1]}`);
  if (!p.favourites.crops.length && !p.favourites.varieties.length && !p.favourites.guides.length) L.push(`_None yet._`);
  return L.join("\n") + "\n";
}
export const exportMarkdown = () => downloadText(profileMarkdown(), "text/markdown;charset=utf-8", `openfarm-notebook-${today()}.md`);
const FAV_KINDS = { crop: "crops", variety: "varieties", guide: "guides" };
export const isFav = (kind, id, p = loadProfile()) => p.favourites[FAV_KINDS[kind]].includes(id);
export function toggleFav(kind, id) {
  const p = loadProfile(), list = p.favourites[FAV_KINDS[kind]], i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  saveProfile(p); return i < 0;
}
export function addGrowing(crop, variety = null) {
  const p = loadProfile();
  p.growing.push({ id: newId(), crop, variety, sown: "", notes: "" });
  saveProfile(p);
}
export const isGrowing = (crop, variety = null, p = loadProfile()) => p.growing.some((g) => g.crop === crop && (!variety || g.variety === variety));

export const getLocation = () => loadProfile().location;
export function setLocation(loc) {
  const p = loadProfile(); p.location = loc; saveProfile(p, { silent: true });
  document.dispatchEvent(new CustomEvent("openfarm:location", { detail: loc }));
}

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
  : `<span class="${cls} none">🌱</span>`;

export const swatch = (r) => `<span class="swatch sm" style="background:${r.color}"></span>`;
const place = (loc) => esc((loc.label || "").split(",")[0] || `${loc.lat}, ${loc.lon}`);

// ---- header chip ----
function renderHere(loc) {
  const a = $("[data-here]"); if (!a) return;
  if (!loc) { a.hidden = true; return; }
  const r = REGION_BY[loc.region];
  a.hidden = false;
  a.innerHTML = `📍 ${place(loc)}${r ? ` · ${swatch(r)}${esc(r.name)}` : ""}`;
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
    box.innerHTML = `<p class="small">📍 <a href="${BASE}#where">Pick your location</a> to see which guide fits your climate region.</p>`;
    return;
  }
  const region = regionOf(loc.symbol);
  const [m] = matchGuides(loc.symbol, loc.lat, crop);
  const vars = INDEX.varieties.filter((v) => v.crop === crop && v.regions.includes(region.slug));
  let h = `<h2>${swatch(region)} For ${place(loc)}: ${esc(region.name)}</h2>`;
  if (m && m.kind !== "similar") {
    h += `<p>✅ <a href="${BASE}guides/${m.g.crop}/${m.g.region}/"><strong>${esc(m.g.title)}</strong></a> fits your climate region${m.kind === "region" ? ` (written for a related class, not ${esc(loc.symbol)} exactly)` : ""}.</p>`;
  } else {
    h += `<p>No guide for <strong>${esc(region.name.toLowerCase())}</strong> yet – meanwhile:</p><ul class="small">`;
    if (m) h += `<li>Nearest region with a guide: <a href="${BASE}guides/${m.g.crop}/${m.g.region}/"><strong>${esc(m.g.title)}</strong></a>
      <span class="flag">${esc(m.via.name.toLowerCase())} – not written for yours, check the timing</span></li>`;
    h += `<li>The general facts – sowing, spacing, temperatures and days to harvest – are under <a href="#facts">Quick facts</a> and apply everywhere.</li>`;
    h += `<li><a href="${addGuideUrl(crop, region.slug)}" target="_blank" rel="noopener noreferrer">No guide for ${esc(region.name)} yet – write one<span class="visually-hidden"> (opens in new tab)</span></a></li></ul>`;
  }
  if (m?.shifted) h += `<p class="flag">Southern hemisphere: the guide's months are for the north – shift by about six months (unverified).</p>`;
  if (vars.length) h += `<p class="small">Varieties recommended for your region: ${vars.map((v) => `<a href="${BASE}crops/${v.crop}/varieties/${v.slug}/">${esc(v.name)}</a>`).join(", ")}</p>`;
  box.innerHTML = h;
}

// Variety pages without a region recommendation: point to the guide for the visitor's region, if any.
(function varietyRegionHint() {
  const el = $("[data-your-region-variety]"); const loc = getLocation(); if (!el || !loc?.symbol) return;
  const region = regionOf(loc.symbol); const [m] = matchGuides(loc.symbol, loc.lat, el.dataset.crop);
  if (!region) return;
  el.innerHTML = m && m.kind !== "similar"
    ? `For your region (${swatch(region)}${esc(region.name)}): <a href="${BASE}guides/${m.g.crop}/${m.g.region}/">${esc(m.g.title)}</a>.`
    : `No guide for ${swatch(region)}${esc(region.name)} yet – <a href="${addGuideUrl(el.dataset.crop, region.slug)}" target="_blank" rel="noopener noreferrer">write one<span class="visually-hidden"> (opens in new tab)</span></a>.`;
})();

// ---- seed sources: put the ones serving your country first ----
function renderSeedSources(loc) {
  const cc = loc?.country?.toUpperCase();
  document.querySelectorAll("[data-seed-sources] ul, .seed-cards").forEach((ul) => {
    const items = [...ul.children];
    for (const li of items) li.classList.toggle("near", !!(cc && li.dataset.countries?.split(",").includes(cc)));
    items.sort((a, b) => b.classList.contains("near") - a.classList.contains("near")).forEach((li) => ul.append(li));
  });
}

// ---- favourite (♥) and "I'm growing this" buttons, profile counts ----
function renderProfileBits() {
  const p = loadProfile();
  document.querySelectorAll("[data-fav]").forEach((b) => {
    const [kind, id] = b.dataset.fav.split(":"); const on = isFav(kind, id, p);
    b.setAttribute("aria-pressed", on); b.classList.toggle("on", on);
    b.title = on ? "Remove from favourites" : "Add to favourites";
    b.setAttribute("aria-label", b.title);
    b.innerHTML = `${on ? "♥" : "♡"}${b.dataset.label !== undefined ? ` <span>${on ? "Favourite" : "Favourite"}</span>` : ""}`;
  });
  document.querySelectorAll("[data-grow]").forEach((b) => {
    const [crop, variety] = b.dataset.grow.split("/"); const on = isGrowing(crop, variety || null, p);
    b.classList.toggle("on", on);
    b.innerHTML = on ? `🌱 <span>In my garden</span>` : `＋ <span>I'm growing this</span>`;
  });
  const n = p.favourites.crops.length + p.favourites.varieties.length + p.favourites.guides.length;
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

function renderAll(loc) { renderWeather(loc); renderYourRegion(loc); renderSeedSources(loc); }
document.addEventListener("openfarm:location", (e) => renderAll(e.detail));
renderAll(getLocation());

// ---- header search: Pagefind results (crops, varieties, guides, regions) first, then a small "Places" group ----
// Nominatim's usage policy forbids client-side autocomplete, so places are only looked up when the user asks
// (the "Find place …" option, or Enter on it): one request, max 3 results, with OSM attribution.
(function headerSearch() {
  const form = $(".top-search"), input = form?.querySelector("input");
  if (!input) return;
  const box = document.createElement("div");
  box.className = "suggest"; box.id = "suggest"; box.setAttribute("role", "listbox"); box.hidden = true;
  form.append(box);
  input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "suggest"); input.setAttribute("aria-expanded", "false");
  let pf = null, timer = null, seq = 0, active = -1, places = null;

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
  function render(q, pages) {
    let i = 0;
    const opt = (html, attrs) => `<div role="option" id="sg-${i++}" class="sg-opt" ${attrs}>${html}</div>`;
    let h = "";
    if (pages.length) h += `<div class="sg-group" role="presentation">Plants, guides &amp; regions</div>` +
      pages.map((p) => opt(`<strong>${esc(p.meta?.title || p.url)}</strong><span>${p.excerpt || ""}</span>`, `data-href="${esc(p.url)}"`)).join("");
    h += `<div class="sg-group" role="presentation">Places</div>`;
    if (places && places.q === q) {
      h += places.items.length ? places.items.map((it) => opt(`📍 ${esc(it.display_name)}`, `data-lat="${it.lat}" data-lon="${it.lon}" data-label="${esc(it.display_name)}" data-cc="${esc(it.address?.country_code?.toUpperCase() || "")}"`)).join("")
        : `<div class="sg-note">No places found.</div>`;
      h += `<div class="sg-note">Places: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, Nominatim</div>`;
    } else h += opt(`📍 Find place “${esc(q)}”…`, `data-places="1"`);
    h += opt(`🔎 All results for “${esc(q)}”`, `data-href="${BASE}search/?q=${encodeURIComponent(q)}"`);
    box.innerHTML = h; box.hidden = false; input.setAttribute("aria-expanded", "true"); active = -1;
  }
  async function update() {
    const q = input.value.trim(), my = ++seq;
    if (q.length < 2) { close(); return; }
    let pages = [];
    try {
      const s = await (await pagefind()).search(q);
      pages = await Promise.all(s.results.slice(0, 5).map((r) => r.data()));
    } catch {}
    if (my === seq) render(q, pages);
  }
  async function findPlaces() {
    const q = input.value.trim(); if (q.length < 3) return;
    places = { q, items: [] };
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=3&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": navigator.language || "en" } });
      places.items = (await r.json()).slice(0, 3);
    } catch {}
    await update(); setActive(opts().findIndex((o) => o.dataset.lat));
  }
  async function pick(el) {
    if (!el) return;
    if (el.dataset.places) return findPlaces();
    if (el.dataset.href) { location.href = el.dataset.href; return; }
    if (el.dataset.lat) {
      const lat = +el.dataset.lat, lon = +el.dataset.lon, kg = await lookup(lat, lon);
      setLocation({ lat: +lat.toFixed(4), lon: +lon.toFixed(4), label: el.dataset.label, symbol: kg?.symbol || null, region: kg?.region?.slug || null, country: el.dataset.cc || null });
      location.href = `${BASE}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    }
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
    const name = lc(m.g.name), url = `${BASE}guides/${m.g.crop}/${m.g.region}/`;
    for (const [k, tmpl] of Object.entries(ACTIONS)) {
      const months = m.calendar[k] || [];
      if (months.includes(month)) {
        const ending = !months.includes((month % 12) + 1);
        out.push({ id: `${ym}:${k}:${crop}`, icon: k === "harvest" ? "🧺" : k === "prune" ? "✂️" : "🌱", url,
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
      if (frost.length) out.push({ id: `${frost[0].t}:frost`, icon: "❄️", url: `${BASE}profile/`,
        text: `Frost forecast ${wd(frost[0].t)} (${Math.round(frost[0].min)} °C) – protect seedlings and tender plants` });
      if (rain < 5 && Math.max(...days.map((x) => x.max)) >= 18) out.push({ id: `${days[0].t}:dry`, icon: "💧", url: `${BASE}profile/`,
        text: `Dry week ahead (${rain.toFixed(1)} mm rain forecast)${grown.length ? ` – water ${[...new Set(grown)].slice(0, 3).join(", ")}` : " – water new sowings"}` });
      if (rain >= 50) out.push({ id: `${days[0].t}:wet`, icon: "🌧️", url: `${BASE}profile/`, text: `Very wet week ahead (${Math.round(rain)} mm) – check drainage and watch for slugs and blight` });
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
  if (dot) dot.hidden = !(p.location || p.growing.length || p.favourites.crops.length + p.favourites.varieties.length + p.favourites.guides.length);
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  panel.innerHTML = `<div class="bp-head"><strong>Reminders</strong>${unread.length ? `<button type="button" class="link-btn" data-bell-read>Mark all read</button>` : ""}</div>
    ${items.length ? `<ul class="bp-list">${items.map((x) => `<li class="${r.read.includes(x.id) ? "" : "unread"}"><a href="${x.url}" data-rid="${esc(x.id)}"><span aria-hidden="true">${x.icon}</span> ${esc(x.text)}</a></li>`).join("")}</ul>`
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
          fold(`SUMMARY:${esc("🌱 " + title)}`), fold(`DESCRIPTION:${esc(`${m.g.title}${m.kind === "similar" ? " (nearest region – not written for yours)" : ""}${m.shifted ? " (months shifted for the southern hemisphere – unverified)" : ""}\n${site}guides/${m.g.crop}/${m.g.region}/`)}`),
          fold(`URL:${site}guides/${m.g.crop}/${m.g.region}/`),
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
    const z = zoneIndex(h.zone), lo = zoneIndex(el.dataset.min), hi = zoneIndex(el.dataset.max + (/[ab]$/.test(el.dataset.max) ? "" : "b"));
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
        (ui.perennial && li.dataset.life !== "perennial");
      li.classList.toggle("ui-out", !!out); total++; if (!out) shown++;
    });
    const filtered = !!(ui.withGuide || ui.reviewed || ui.perennial);
    document.body.classList.toggle("ui-filtered", filtered);
    document.querySelectorAll("[data-ui-count]").forEach((el) => (el.textContent = filtered ? `${shown} of ${total} shown` : ""));
    document.querySelectorAll("[data-ui]").forEach((cb) => (cb.checked = !!ui[cb.dataset.ui]));
    dispatchEvent(new Event("openfarm:filters"));
  };
  document.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-ui]"); if (!cb) return;
    ui[cb.dataset.ui] = cb.checked; try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch {}
    apply();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-ui-reset]")) return;
    ui = {}; try { localStorage.removeItem(KEY); } catch {} apply();
  });
  apply();
})();
