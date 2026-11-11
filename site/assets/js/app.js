// OpenFarm location → Köppen → guides. No backend: the climate grid is a ~25 kB static file.
const BASE = window.OPENFARM_BASE || "/";
const GUIDES = JSON.parse(document.getElementById("guide-data").textContent);
const KG = JSON.parse(document.getElementById("koppen-data").textContent);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ROWS = [["sow_indoors","Sow indoors"],["sow_direct","Sow outside"],["plant","Plant out"],["harvest","Harvest"]];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

/** Returns { code, symbol, name, desc, nearest } – searches nearby cells if the point falls on ocean. */
export async function lookup(lat, lon) {
  await loadGrid();
  const r0 = Math.min(359, Math.max(0, Math.floor((90 - lat) / 0.5)));
  const c0 = Math.floor((((lon + 180) % 360) + 360) % 360 / 0.5);
  for (let d = 0; d <= 4; d++) {
    for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
      const r = r0 + dr; if (r < 0 || r > 359) continue;
      const v = cell(r, c0 + dc);
      if (v) { const [symbol, name, desc] = KG.classes[v]; return { code: v, symbol, name, desc, nearest: d > 0 }; }
    }
  }
  return null;
}

// ---- matching ----
const shift = (months, n) => months.map((m) => ((m - 1 + n) % 12) + 1);
function matchGuides(symbol, lat) {
  const south = lat < 0;
  const tropical = symbol[0] === "A";
  const exact = GUIDES.filter((g) => g.koppen.includes(symbol));
  // "Close" = same main group and precipitation letter (e.g. Cfa ≈ Cfb), used only when nothing exact exists for a crop.
  const close = GUIDES.filter((g) => !g.koppen.includes(symbol) && g.koppen.some((k) => k.slice(0, 2) === symbol.slice(0, 2)));
  const crops = new Map();
  for (const g of exact) if (!crops.has(g.crop)) crops.set(g.crop, { g, kind: "exact" });
  for (const g of close) if (!crops.has(g.crop)) crops.set(g.crop, { g, kind: "close" });
  return [...crops.values()].map(({ g, kind }) => {
    let calendar = g.calendar, shifted = false;
    if (south && g.hemisphere === "north" && !tropical) {
      calendar = Object.fromEntries(Object.entries(g.calendar).map(([k, v]) => [k, shift(v, 6)]));
      shifted = true;
    }
    return { g, kind, calendar, shifted };
  }).sort((a, b) => (a.kind === b.kind ? a.g.name.localeCompare(b.g.name) : a.kind === "exact" ? -1 : 1));
}

function calendarHTML(cal) {
  let h = `<div class="cal"><div class="cal-row cal-head"><span class="cal-label"></span>${MONTHS.map((m) => `<span data-m="${m[0]}">${m}</span>`).join("")}</div>`;
  for (const [k, label] of ROWS) if (cal[k]) h += `<div class="cal-row"><span class="cal-label">${label}</span>${MONTHS.map((m, i) => `<span class="${cal[k].includes(i + 1) ? "on " + k : ""}" title="${label} – ${m}"></span>`).join("")}</div>`;
  return h + `</div><p class="cal-legend"><i class="on sow_indoors"></i>sow indoors <i class="on sow_direct"></i>sow outside <i class="on plant"></i>plant out <i class="on harvest"></i>harvest</p>`;
}

// ---- UI ----
const map = L.map("map", { worldCopyJump: true }).setView([30, 10], 2);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap contributors" }).addTo(map);
const overlay = L.imageOverlay(BASE + "assets/koppen-mercator.png", [[-85.0511, -180], [85.0511, 180]], { opacity: 0.6, attribution: "Köppen-Geiger: Beck et al. 2018 (CC BY 4.0)" });
let marker = null;

async function choose(lat, lon, label) {
  lat = +(+lat).toFixed(4); lon = +(+lon).toFixed(4);
  $("#lat").value = lat; $("#lon").value = lon;
  if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 5));
  history.replaceState(null, "", `?lat=${lat}&lon=${lon}`);
  const kg = await lookup(lat, lon);
  $("#climate").hidden = false; $("#matches").hidden = false;
  if (!kg) {
    $("#climate-box").innerHTML = `<p>No land climate found near ${lat}, ${lon}. Try a point on land.</p>`;
    $("#match-list").innerHTML = ""; return;
  }
  const color = KG.colors[kg.code];
  $("#climate-box").innerHTML = `
    <p class="kg-big"><span class="swatch" style="background:${color}"></span><strong>${kg.symbol}</strong> – ${esc(kg.name)}</p>
    <p>${esc(kg.desc)} ${label ? `<br><small>${esc(label)}</small>` : ""}</p>
    <p class="hint">${lat}, ${lon} · ${lat < 0 ? "southern" : "northern"} hemisphere${kg.nearest ? " · nearest land cell used" : ""}.
    Coarse 0.5° grid (~50 km) – mountains and coasts can differ locally.</p>`;
  const list = matchGuides(kg.symbol, lat);
  $("#match-list").innerHTML = list.length ? list.map(({ g, kind, calendar, shifted }) => `
    <article class="match">
      <h3><a href="${BASE}guides/${g.crop}/${g.variant}/">${esc(g.name)}</a> <small>${esc(g.title)}</small></h3>
      <p>${g.koppen.map((k) => `<span class="kg">${k}</span>`).join("")}
        <span class="conf conf-${g.confidence}">${g.confidence} confidence</span>
        ${kind === "close" ? `<span class="flag">closest climate match – not written for ${kg.symbol}</span>` : ""}
        ${shifted ? `<span class="flag">months shifted +6 for the southern hemisphere – unverified</span>` : ""}
        ${kg.symbol[0] === "A" && g.hemisphere !== "any" ? `<span class="flag">tropics: align with your local dry season</span>` : ""}</p>
      ${calendarHTML(calendar)}
    </article>`).join("")
    : `<p>No guides for <strong>${kg.symbol}</strong> yet. <a href="${BASE}contribute/">Be the first to write one!</a></p>`;
}

map.on("click", (e) => choose(e.latlng.lat, L.Util.wrapNum(e.latlng.lng, [-180, 180], true)));
$("#overlay").addEventListener("change", (e) => (e.target.checked ? overlay.addTo(map) : overlay.remove()));
$("#coords").addEventListener("submit", (e) => { e.preventDefault(); choose($("#lat").value, $("#lon").value); });
$("#geo").addEventListener("click", () => navigator.geolocation?.getCurrentPosition((p) => choose(p.coords.latitude, p.coords.longitude, "Your location")));
document.querySelectorAll("[data-demo]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault(); const u = new URLSearchParams(a.search); choose(u.get("lat"), u.get("lon"), a.textContent);
}));

// Place search via OpenStreetMap Nominatim (public, rate-limited – one request per submit).
$("#search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim(); if (!q) return;
  const ul = $("#results"); ul.hidden = false; ul.innerHTML = "<li>Searching…</li>";
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": navigator.language || "en" } });
    const items = await r.json();
    ul.innerHTML = items.length ? "" : "<li>No places found – try lat/lon below.</li>";
    for (const it of items) {
      const li = document.createElement("li"); const b = document.createElement("button");
      b.type = "button"; b.textContent = it.display_name;
      b.onclick = () => { ul.hidden = true; choose(it.lat, it.lon, it.display_name); };
      li.append(b); ul.append(li);
    }
  } catch { ul.innerHTML = "<li>Search unavailable – enter lat/lon below.</li>"; }
});

const p = new URLSearchParams(location.search);
if (p.has("lat") && p.has("lon")) choose(p.get("lat"), p.get("lon"));
