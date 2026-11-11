// Home page: the "your details" panel (location search, map, climate region) and the guide cards.
import { BASE, INDEX, $, esc, lookup, matchGuides, addGuideUrl, setLocation, getLocation, swatch, thumbHTML, MONTHS, hardinessZone, hardinessLine, loadPlaces, searchPlaces, placeLabel, resolvePlace, locationSearch, locationHref, nearestPlace, guideHref } from "./common.js";
import { flagImg } from "./icons.js";
import { attachClimateOverlay } from "./climate-overlay.js";

const map = L.map("map", { worldCopyJump: true, zoomControl: true }).setView([30, 10], 1);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap contributors" }).addTo(map);
// Climate overlay is off by default – the region name and colour are shown next to the marker instead.
const overlay = attachClimateOverlay(map, BASE + "assets/koppen-mercator.png", { opacity: 0.6, attribution: "Köppen-Geiger: Beck et al. 2018 (CC BY 4.0)" });
let marker = null;
const mobile = () => matchMedia("(max-width: 860px)").matches;
const panel = document.getElementById("details-panel");
function refitHomeMap() { map.invalidateSize(); }
if (panel) panel.addEventListener("toggle", () => { if (panel.open) setTimeout(refitHomeMap, 0); });
window.addEventListener("resize", refitHomeMap);


async function countryOf(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&lat=${lat}&lon=${lon}`);
    return (await r.json()).address?.country_code?.toUpperCase() || null;
  } catch { return null; }
}

// "Mar–May, Sep" from [3,4,5,9]
function monthRanges(ms = []) {
  const s = [...new Set(ms)].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${MONTHS[s[i] - 1]}–${MONTHS[s[j] - 1]}` : MONTHS[s[i] - 1]); i = j;
  }
  return out.join(", ");
}

function card({ g, kind, via, calendar, shifted }, region) {
  const href = guideHref(g);
  const sow = [...(calendar.sow_indoors || []), ...(calendar.sow_direct || []), ...(calendar.plant || [])];
  const when = [sow.length ? `Sow/plant ${monthRanges(sow)}` : "", calendar.harvest ? `Harvest ${monthRanges(calendar.harvest)}` : ""].filter(Boolean).join(" · ");
  const flag = kind === "similar" ? `<span class="note-flag">nearest region: ${esc(via.name.toLowerCase())}</span>`
    : shifted ? `<span class="note-flag">months shifted +6 – unverified</span>` : "";
  return `<li><a href="${href}">${thumbHTML(g.img)}
      <strong class="name">${esc(g.name)}</strong><em class="sci1">${g.sci ? esc(g.sci) : "&nbsp;"}</em>
      <span class="gtitle">${esc(when)}</span>
      <span class="badges">${flag}</span></a>
    <button class="fav card-fav" type="button" data-fav="guide:${g.crop}/${g.region}" aria-pressed="false" title="Add to favourites">♡</button></li>`;
}

async function choose(lat, lon, label, country, placeSlug) {
  lat = +(+lat).toFixed(4); lon = +(+lon).toFixed(4);
  $("#lat").value = lat; $("#lon").value = lon;
  if (marker) marker.setLatLng([lat, lon]); else marker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 5));
  await loadPlaces();
  const nearby = placeSlug ? null : nearestPlace(lat, lon);
  const slug = placeSlug || (nearby?.near ? nearby.place.slug : "");
  if (!label && nearby?.near) label = placeLabel(nearby.place);
  history.replaceState(null, "", locationSearch(lat, lon, slug || undefined));
  const kg = await lookup(lat, lon);
  if ($("#climate")) $("#climate").hidden = false;
  if (!kg) {
    marker.unbindTooltip();
    if ($("#climate-box")) $("#climate-box").hidden = false;
  $("#climate-box").innerHTML = `<p>No land climate found near ${lat}, ${lon}. Try a point on land.</p>`;
    $("#match-list").innerHTML = ""; return;
  }
  const region = kg.region;
  marker.bindTooltip(`${swatch(region)} <strong>${esc(region.name)}</strong> <span class="kg">${kg.symbol}</span>`,
    { permanent: true, direction: "top", offset: [-14, -14], className: "region-tip" }).openTooltip();
  const place = (label || "").split(",")[0];

  if ($("#climate-box")) $("#climate-box").hidden = false;
  $("#climate-box").innerHTML = `
    <p class="kg-big"><span class="swatch" style="background:${region.color}"></span>
      <a href="${BASE}regions/${region.slug}/"><strong>${esc(region.name)}</strong></a></p>
    <p class="small">${place ? `${esc(place)} · ` : ""}Köppen <a class="kg" href="${BASE}help/#koppen" title="Köppen ${kg.symbol}: ${esc(kg.name)}">${kg.symbol}</a> ${esc(kg.name)} – ${esc(kg.desc)}</p>
    <div id="hz-box"><p class="small muted">Hardiness zone: working it out…</p></div>
    <p class="hint">${lat}, ${lon}${nearby && !nearby.near ? ` · nearest listed city ${esc(nearby.place.name)} (${Math.round(nearby.km)} km)` : ""}${kg.nearest ? " · nearest land cell used" : ""}. 0.5° grid (~50 km) – mountains and coasts can differ.</p>`;
  hardinessZone(lat, lon).then((h) => { const b = $("#hz-box"); if (b) b.innerHTML = h ? hardinessLine(h) : ""; })
    .catch(() => { const b = $("#hz-box"); if (b) b.innerHTML = `<p class="small muted">Hardiness zone unavailable right now.</p>`; });
  $("#details-summary").innerHTML = `<span>${esc(place || `${lat}, ${lon}`)} · ${swatch(region)}${esc(region.name)}</span><span class="chg">change</span>`;
  if (mobile()) $("#details-panel").open = false;

  const loc = { lat, lon, label: label || "", symbol: kg.symbol, region: region.slug, country: country || null };
  setLocation(loc);
  if (!country) countryOf(lat, lon).then((cc) => cc && setLocation({ ...loc, country: cc }));

  const list = matchGuides(kg.symbol, lat);
  const own = list.filter((m) => m.kind !== "similar"), near = list.filter((m) => m.kind === "similar");
  let h = `<p class="small muted">For ${swatch(region)}<strong>${esc(region.name)}</strong>${place ? ` (${esc(place)})` : ""}.</p>`;
  if (own.length) h += `<ul class="crop-grid guide-grid">${own.map((m) => card(m, region)).join("")}</ul>`;
  else h += `<p>No guides are written for the ${esc(region.name.toLowerCase())} region yet.</p>`;
  if (near.length) h += `<h3 class="group">From the nearest region – not written for yours</h3>
    <ul class="crop-grid guide-grid">${near.map((m) => card(m, region)).join("")}</ul>`;
  const vars = INDEX.varieties.filter((v) => v.regions.includes(region.slug));
  if (vars.length) h += `<h3 class="group">Varieties recommended for your region</h3><p>${vars.map((v) => `<a class="chip" href="${BASE}crops/${v.crop}/${v.slug}/">${esc(v.name)} <small>${esc(v.cropName)}</small></a>`).join(" ")}</p>`;
  h += `<p class="small">Know a crop that grows well here? <a href="${BASE}regions/${region.slug}/#help">Add a guide for ${esc(region.name.toLowerCase())}</a>.</p>`;
  $("#match-list").innerHTML = h;
  document.dispatchEvent(new CustomEvent("openfarm:profile"));
}

map.on("click", (e) => choose(e.latlng.lat, L.Util.wrapNum(e.latlng.lng, [-180, 180], true)));
$("#overlay").checked = false;
const overlayLabel = $("#overlay-label");
const setOverlayLabel = (on) => { if (overlayLabel) overlayLabel.textContent = on ? "Hide climate map" : "Show climate map"; };
setOverlayLabel(false);
$("#overlay").addEventListener("change", (e) => {
  if (e.target.checked) overlay.addTo(map); else overlay.remove();
  setOverlayLabel(e.target.checked);
});
$("#coords").addEventListener("submit", (e) => { e.preventDefault(); choose($("#lat").value, $("#lon").value); });
$("#geo").addEventListener("click", () => navigator.geolocation?.getCurrentPosition((p) => choose(p.coords.latitude, p.coords.longitude, "Your location")));
$("#details-panel").addEventListener("toggle", () => { if ($("#details-panel").open) setTimeout(() => map.invalidateSize(), 50); });

// Place search: offline GeoNames list first; Nominatim as a fallback if needed.
$("#search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim(); if (!q) return;
  const ul = $("#results"); ul.hidden = false; ul.innerHTML = "<li>Searching…</li>";
  try {
    await loadPlaces();
    const hits = searchPlaces(q, 8);
    ul.innerHTML = hits.length ? "" : "<li>No matching cities in the offline list – try a bigger city, or coordinates below the map.</li>";
    for (const it of hits) {
      const label = placeLabel(it);
      const li = document.createElement("li"); const b = document.createElement("button");
      b.type = "button"; b.innerHTML = `${flagImg(it.cc, BASE)} ${esc(label)}`;
      b.onclick = () => { ul.hidden = true; choose(it.lat, it.lon, label, it.cc, it.slug); };
      li.append(b); ul.append(li);
    }
  } catch { ul.innerHTML = "<li>Search unavailable – enter coordinates below the map.</li>"; }
});

const p = new URLSearchParams(location.search);
const saved = getLocation();
(async () => {
  if (p.has("place")) {
    await loadPlaces();
    const hit = resolvePlace(p.get("place"));
    if (hit) {
      choose(hit.lat, hit.lon, placeLabel(hit), hit.cc, hit.slug);
      return;
    }
  }
  if (p.has("lat") && p.has("lon")) {
    const same = saved && Math.abs(saved.lat - p.get("lat")) < 1e-3 && Math.abs(saved.lon - p.get("lon")) < 1e-3;
    choose(p.get("lat"), p.get("lon"), same ? saved.label : (p.get("label") || ""), same ? saved.country : null);
  } else if (saved) choose(saved.lat, saved.lon, saved.label, saved.country);
})();
