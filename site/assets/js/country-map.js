// Lazy-loaded Leaflet map for country and city pages: Köppen overlay, optional
// Natural Earth outline, optional pin, bounds fitted to the precomputed view.
import { BASE, hardinessZone, hardinessLine, zoneIndex, esc } from "./common.js";

const OVERLAY_BOUNDS = [[-85.05112878, -180], [85.05112878, 180]];

function loadCss(href) {
  if (document.querySelector(`link[data-leaflet]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  l.dataset.leaflet = "1";
  document.head.append(l);
}

function loadScript(src) {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-leaflet]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.leaflet = "1";
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}

async function ensureLeaflet() {
  loadCss(BASE + "assets/vendor/leaflet/leaflet.css");
  await loadScript(BASE + "assets/vendor/leaflet/leaflet.js");
}

function readJson(figure, sel) {
  const s = figure.querySelector(sel);
  if (!s) return null;
  try { return JSON.parse(s.textContent); } catch { return null; }
}

async function initMap(figure) {
  if (figure.dataset.ready) return;
  const mount = figure.querySelector(".country-map-live");
  const fallback = figure.querySelector(".country-map-fallback");
  if (!mount) return;
  figure.dataset.ready = "1";
  const bounds = readJson(figure, "script[data-bounds]");
  const outline = readJson(figure, "script[data-outline]");
  const pin = readJson(figure, "script[data-pin]");
  try {
    await ensureLeaflet();
    mount.hidden = false;
    if (fallback) fallback.hidden = true;
    const map = window.L.map(mount, { worldCopyJump: true, scrollWheelZoom: false, zoomControl: true });
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 10,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    window.L.imageOverlay(BASE + "assets/koppen-mercator.png", OVERLAY_BOUNDS, {
      opacity: 0.65,
      attribution: "Köppen–Geiger: Beck et al. 2018 (CC BY 4.0)",
    }).addTo(map);
    if (outline) {
      window.L.geoJSON(outline, {
        style: { color: "#1b1b1b", weight: 2, fill: false, opacity: 0.95 },
        attribution: "Boundaries: Natural Earth (public domain)",
      }).addTo(map);
    }
    if (pin && Number.isFinite(+pin.lat) && Number.isFinite(+pin.lon)) {
      window.L.marker([+pin.lat, +pin.lon]).addTo(map);
    }
    if (bounds && Number.isFinite(bounds.south) && Number.isFinite(bounds.west)) {
      let east = bounds.east, west = bounds.west;
      if (east > 180) east = 180;
      if (west < -180) west = -180;
      if (east > west) map.fitBounds([[bounds.south, west], [bounds.north, east]], { padding: [20, 20], maxZoom: 8 });
      else if (pin) map.setView([+pin.lat, +pin.lon], 6);
    } else if (pin) {
      map.setView([+pin.lat, +pin.lon], 7);
    } else {
      map.setView([20, 0], 2);
    }
    setTimeout(() => map.invalidateSize(), 60);
    map.on("click", () => { if (!map.scrollWheelZoom.enabled()) map.scrollWheelZoom.enable(); });
  } catch {
    figure.dataset.ready = "";
    mount.hidden = true;
    if (fallback) fallback.hidden = false;
  }
}

function observeMaps() {
  const figs = document.querySelectorAll("[data-country-map]");
  if (!figs.length) return;
  if (!("IntersectionObserver" in window)) { figs.forEach(initMap); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); initMap(e.target); }
  }, { rootMargin: "240px" });
  figs.forEach((f) => io.observe(f));
}

async function fillPlaceHardiness() {
  const el = document.querySelector("[data-place-hardiness]");
  if (!el) return;
  const lat = +el.dataset.lat, lon = +el.dataset.lon;
  const fail = () => {
    el.innerHTML = `<p class="small muted">Derived hardiness zone unavailable right now. It is computed from Open-Meteo ERA5 reanalysis, 1991–2020 (CC BY 4.0), using official USDA 5 °F half-zone bounds, and is not an official USDA zone map for this city.</p>`;
  };
  try {
    const h = await hardinessZone(lat, lon);
    if (!h) return fail();
    el.innerHTML = `${hardinessLine(h)}<p class="small muted">Derived from Open-Meteo ERA5 reanalysis, 1991–2020 average of each year’s coldest night (CC BY 4.0), labelled with official USDA 5 °F half-zone bounds. This is not an official USDA zone map for this city.</p>`;
    const z = zoneIndex(h.zone);
    document.querySelectorAll("[data-hz-min]").forEach((card) => {
      const lo = zoneIndex(card.dataset.hzMin);
      const max = card.dataset.hzMax || "";
      const hi = zoneIndex(max + (/[ab]$/.test(max) ? "" : "b"));
      if (lo == null || hi == null || z == null) return;
      if (z >= lo && z <= hi) return;
      card.classList.add("out-of-zone");
      const badges = card.querySelector(".badges");
      if (!badges || badges.querySelector(".out-zone-note")) return;
      const note = document.createElement("span");
      note.className = "badge out-zone-note";
      note.textContent = z < lo
        ? `Recorded range ${esc(card.dataset.hzMin)}–${esc(max)} is warmer than derived zone ${esc(h.zone)}`
        : `Recorded range ${esc(card.dataset.hzMin)}–${esc(max)} is colder than derived zone ${esc(h.zone)}`;
      badges.append(note);
    });
  } catch {
    fail();
  }
}

observeMaps();
fillPlaceHardiness();
