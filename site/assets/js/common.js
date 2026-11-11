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

// ---- remembered location (localStorage; only ever sent to Open-Meteo for the forecast) ----
const KEY = "openfarm.location";
export function getLocation() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
export function setLocation(loc) {
  try { localStorage.setItem(KEY, JSON.stringify(loc)); } catch {}
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
      ${days.map((x) => `<tr class="${x.min <= 0 ? "frost" : ""}"><td>${wd(x.t)}</td><td>${ICON(x.code)}</td><td>${Math.round(x.min)}° / ${Math.round(x.max)}°</td><td>${x.rain ? x.rain.toFixed(1) : "0"} mm</td><td>${x.soil === null ? "–" : Math.round(x.soil) + "°"}</td></tr>`).join("")}
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
    h += `<p>There is no ${esc(name.toLowerCase())} guide for the <strong>${esc(region.name.toLowerCase())}</strong> climate region yet.</p>`;
    if (m) h += `<p>Nearest match: <a href="${BASE}guides/${m.g.crop}/${m.g.region}/"><strong>${esc(m.g.title)}</strong></a>
      <span class="flag">from the nearest region (${esc(m.via.name.toLowerCase())}) – not written for yours</span></p>`;
    else h += `<p class="small">The general facts on this page still apply.</p>`;
    h += `<p><a class="button" href="${addGuideUrl(crop, region.slug)}">＋ Add a guide for your region</a></p>`;
  }
  if (m?.shifted) h += `<p class="flag">Southern hemisphere: the guide's months are for the north – shift by about six months (unverified).</p>`;
  if (vars.length) h += `<p class="small">Varieties recommended for your region: ${vars.map((v) => `<a href="${BASE}crops/${v.crop}/varieties/${v.slug}/">${esc(v.name)}</a>`).join(", ")}</p>`;
  box.innerHTML = h;
}

// ---- seed sources: put the ones serving your country first ----
function renderSeedSources(loc) {
  const cc = loc?.country?.toUpperCase();
  document.querySelectorAll("[data-seed-sources] ul, .seed-cards").forEach((ul) => {
    const items = [...ul.children];
    for (const li of items) li.classList.toggle("near", !!(cc && li.dataset.countries?.split(",").includes(cc)));
    items.sort((a, b) => b.classList.contains("near") - a.classList.contains("near")).forEach((li) => ul.append(li));
  });
}

function renderAll(loc) { renderHere(loc); renderWeather(loc); renderYourRegion(loc); renderSeedSources(loc); }
document.addEventListener("openfarm:location", (e) => renderAll(e.detail));
renderAll(getLocation());
