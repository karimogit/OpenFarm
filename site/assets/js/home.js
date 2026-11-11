// Home page: map, place search and the "guides for your climate region" list.
import { BASE, KG, INDEX, REGION_BY, $, esc, lookup, matchGuides, calendarHTML, addGuideUrl, setLocation, getLocation, swatch } from "./common.js";

const map = L.map("map", { worldCopyJump: true }).setView([30, 10], 2);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap contributors" }).addTo(map);
// Climate overlay is off by default – the region name and colour are shown next to the marker instead.
const overlay = L.imageOverlay(BASE + "assets/koppen-mercator.png", [[-85.0511, -180], [85.0511, 180]], { opacity: 0.6, attribution: "Köppen-Geiger: Beck et al. 2018 (CC BY 4.0)" });
let marker = null;

async function countryOf(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&lat=${lat}&lon=${lon}`);
    return (await r.json()).address?.country_code?.toUpperCase() || null;
  } catch { return null; }
}

async function choose(lat, lon, label, country) {
  lat = +(+lat).toFixed(4); lon = +(+lon).toFixed(4);
  $("#lat").value = lat; $("#lon").value = lon;
  if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 6));
  history.replaceState(null, "", `?lat=${lat}&lon=${lon}`);
  const kg = await lookup(lat, lon);
  $("#climate").hidden = false; $("#matches").hidden = false;
  if (!kg) {
    marker.unbindTooltip();
    $("#climate-box").innerHTML = `<p>No land climate found near ${lat}, ${lon}. Try a point on land.</p>`;
    $("#match-list").innerHTML = ""; return;
  }
  const region = kg.region;
  marker.bindTooltip(`${swatch(region)} <strong>${esc(region.name)}</strong> <span class="kg">${kg.symbol}</span>`,
    { permanent: true, direction: "right", offset: [12, -18], className: "region-tip" }).openTooltip();

  $("#climate-box").innerHTML = `
    <p class="kg-big"><span class="swatch" style="background:${region.color}"></span>
      <a href="${BASE}regions/${region.slug}/"><strong>${esc(region.name)}</strong></a></p>
    <p>Köppen class <span class="kg">${kg.symbol}</span> ${esc(kg.name)} – ${esc(kg.desc)}${label ? `<br><small>${esc(label)}</small>` : ""}</p>
    <p class="hint">${lat}, ${lon} · ${lat < 0 ? "southern" : "northern"} hemisphere${kg.nearest ? " · nearest land cell used" : ""}.
    Coarse 0.5° grid (~50 km) – mountains and coasts can differ locally.</p>`;

  const loc = { lat, lon, label: label || "", symbol: kg.symbol, region: region.slug, country: country || null };
  setLocation(loc);
  if (!country) countryOf(lat, lon).then((cc) => cc && setLocation({ ...loc, country: cc }));

  const list = matchGuides(kg.symbol, lat);
  const covered = new Set(list.map((m) => m.g.crop));
  const groups = [
    ["Written for your climate region", list.filter((m) => m.kind !== "similar")],
    ["From the nearest region – not written for yours", list.filter((m) => m.kind === "similar")],
  ];
  let h = "";
  for (const [title, items] of groups) {
    if (!items.length) continue;
    h += `<h3 class="group">${title}</h3>` + items.map(({ g, kind, via, calendar, shifted }) => `
      <article class="match">
        <h4><a href="${BASE}guides/${g.crop}/${g.region}/">${esc(g.name)}</a> <small>${esc(g.title)}</small></h4>
        <p>${g.koppen.map((k) => `<span class="kg">${k}</span>`).join("")}
          <span class="conf conf-${g.confidence}">${g.confidence} confidence</span>
          ${kind === "similar" ? `<span class="flag">nearest region: ${esc(via.name.toLowerCase())}</span> <a class="small" href="${addGuideUrl(g.crop, region.slug)}">＋ Add a guide for your region</a>` : ""}
          ${kind === "region" ? `<span class="flag">same climate region, written for ${g.koppen.join("/")}</span>` : ""}
          ${shifted ? `<span class="flag">months shifted +6 for the southern hemisphere – unverified</span>` : ""}
          ${kg.symbol[0] === "A" && g.hemisphere !== "any" ? `<span class="flag">tropics: align with your local dry season</span>` : ""}</p>
        ${calendarHTML(calendar)}
      </article>`).join("");
  }
  if (!list.length) h = `<p>No guides for the ${esc(region.name.toLowerCase())} region or its neighbours yet.</p>`;
  const vars = INDEX.varieties.filter((v) => v.regions.includes(region.slug));
  if (vars.length) h += `<h3 class="group">Varieties recommended for your region</h3><p>${vars.map((v) => `<a class="chip" href="${BASE}crops/${v.crop}/varieties/${v.slug}/">${esc(v.name)} <small>${esc(v.cropName)}</small></a>`).join(" ")}</p>`;
  h += `<p class="cal-legend"><i class="on sow_indoors"></i>sow indoors <i class="on sow_direct"></i>sow outside <i class="on plant"></i>plant out <i class="on prune"></i>prune <i class="on harvest"></i>harvest</p>
    <p class="small">Don't see your crop? <a href="${BASE}crops/">Browse all crops</a> or <a href="${BASE}regions/${region.slug}/#help">add a guide for ${esc(region.name.toLowerCase())}</a> – every guide is a plain text file on GitHub.</p>`;
  $("#match-list").innerHTML = h;
}

map.on("click", (e) => choose(e.latlng.lat, L.Util.wrapNum(e.latlng.lng, [-180, 180], true)));
$("#overlay").checked = false;
$("#overlay").addEventListener("change", (e) => (e.target.checked ? overlay.addTo(map) : overlay.remove()));
$("#coords").addEventListener("submit", (e) => { e.preventDefault(); choose($("#lat").value, $("#lon").value); });
$("#geo").addEventListener("click", () => navigator.geolocation?.getCurrentPosition((p) => choose(p.coords.latitude, p.coords.longitude, "Your location")));
document.querySelectorAll("[data-demo]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault(); const u = new URLSearchParams(a.search);
  const m = a.textContent.match(/^(.*) \((\w\w)\)$/);
  choose(u.get("lat"), u.get("lon"), m ? m[1] : a.textContent, m ? m[2] : null);
}));

// Place search via OpenStreetMap Nominatim (public, rate-limited – one request per submit).
$("#search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim(); if (!q) return;
  const ul = $("#results"); ul.hidden = false; ul.innerHTML = "<li>Searching…</li>";
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": navigator.language || "en" } });
    const items = await r.json();
    ul.innerHTML = items.length ? "" : "<li>No places found – try lat/lon below.</li>";
    for (const it of items) {
      const li = document.createElement("li"); const b = document.createElement("button");
      b.type = "button"; b.textContent = it.display_name;
      b.onclick = () => { ul.hidden = true; choose(it.lat, it.lon, it.display_name, it.address?.country_code?.toUpperCase()); };
      li.append(b); ul.append(li);
    }
  } catch { ul.innerHTML = "<li>Search unavailable – enter lat/lon below.</li>"; }
});

const p = new URLSearchParams(location.search);
const saved = getLocation();
if (p.has("lat") && p.has("lon")) {
  const same = saved && Math.abs(saved.lat - p.get("lat")) < 1e-3 && Math.abs(saved.lon - p.get("lon")) < 1e-3;
  choose(p.get("lat"), p.get("lon"), same ? saved.label : "", same ? saved.country : null);
} else if (saved) choose(saved.lat, saved.lon, saved.label, saved.country);
