// Shared build-time helpers for country maps and city (/places) pages.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";
import { CITY_ZOOM } from "../site/assets/js/map-view.js";
export { CITY_ZOOM };

const MAP_W = 1440, MAP_H = 1440, MERC_MAX = 85.05112878;

export const mercX = (lon) => ((lon + 180) / 360) * MAP_W;
export const mercY = (lat) => {
  const r = (Math.max(-MERC_MAX, Math.min(MERC_MAX, lat)) * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2 * MAP_H;
};

/** Modest padding for a city inset. Country maps keep the larger default pads. */
export const CITY_BBOX_PAD = { minPadLon: 0.15, minPadLat: 0.1, frac: 0.12 };

/** Unpadded [west,south,east,north] box around a city (~30 km). */
export function citySourceBbox(lat, lon) {
  if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return null;
  const dLon = 0.4, dLat = 0.28;
  return [+lon - dLon, +lat - dLat, +lon + dLon, +lat + dLat];
}

/** Pad and resolve a [west,south,east,north] bbox the same way country insets do. */
export function paddedBbox(bbox, opts = {}) {
  if (!bbox) return null;
  let [w, s, e, n] = bbox;
  if (e > 180) e = 180;
  if (w < -180) w = -180;
  if (e < w) { // dateline: show the larger side
    if (180 - w >= e - (-180)) e = 180;
    else w = -180;
  }
  const frac = opts.frac ?? 0.18;
  const minPadLon = opts.minPadLon ?? 1.2;
  const minPadLat = opts.minPadLat ?? 0.8;
  const padLon = Math.max(minPadLon, (e - w) * frac || minPadLon);
  const padLat = Math.max(minPadLat, (n - s) * frac || minPadLat);
  w -= padLon; e += padLon; s -= padLat; n += padLat;
  return [w, s, e, n];
}

export function mapViewFromBbox(bbox, opts) {
  const pad = paddedBbox(bbox, opts);
  if (!pad) return null;
  const [w, s, e, n] = pad;
  const x1 = mercX(w), x2 = mercX(e), y1 = mercY(n), y2 = mercY(s);
  const x = Math.max(0, Math.min(x1, x2));
  const y = Math.max(0, Math.min(y1, y2));
  const width = Math.min(MAP_W, Math.max(x1, x2)) - x;
  const height = Math.min(MAP_H, Math.max(y1, y2)) - y;
  if (!(width > 2 && height > 2)) return null;
  return { x: +x.toFixed(2), y: +y.toFixed(2), width: +width.toFixed(2), height: +height.toFixed(2), imgW: MAP_W, imgH: MAP_H };
}

export function mapBoundsFromBbox(bbox, opts) {
  const pad = paddedBbox(bbox, opts);
  if (!pad) return null;
  const [w, s, e, n] = pad;
  return { west: +w.toFixed(4), south: +s.toFixed(4), east: +e.toFixed(4), north: +n.toFixed(4) };
}

export function loadOutlines() {
  const p = path.join(ROOT, "data/country-outlines.json");
  if (!fs.existsSync(p)) return { attribution: "", countries: {} };
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function loadKoppenLookup() {
  const buf = fs.readFileSync(path.join(ROOT, "site/assets/koppen-0p5.bin"));
  if (String.fromCharCode(...buf.subarray(0, 4)) !== "KG05") throw new Error("bad climate grid");
  const grid = new Uint8Array(360 * 720);
  let o = 0;
  for (let i = 4; i < buf.length; i += 2) {
    grid.fill(buf[i], o, o + buf[i + 1]);
    o += buf[i + 1];
  }
  const legend = {};
  for (const line of fs.readFileSync(path.join(ROOT, "data/koppen/legend.txt"), "utf8").split("\n")) {
    const m = line.match(/^\s*(\d+):\s+(\S+)/);
    if (m) legend[+m[1]] = m[2];
  }
  const cell = (r, c) => grid[r * 720 + ((c % 720) + 720) % 720];
  return function lookup(lat, lon) {
    const r0 = Math.min(359, Math.max(0, Math.floor((90 - lat) / 0.5)));
    const c0 = Math.floor((((lon + 180) % 360) + 360) % 360 / 0.5);
    for (let d = 0; d <= 4; d++) {
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
          const r = r0 + dr; if (r < 0 || r > 359) continue;
          const v = cell(r, c0 + dc);
          if (v) return { code: v, symbol: legend[v] || null, nearest: d > 0 };
        }
      }
    }
    return null;
  };
}

export function svgPathForOutline(geometry, mapView) {
  if (!geometry || !mapView || !geometry.coordinates) return null;
  const parts = [];
  for (const poly of geometry.coordinates) {
    for (const ring of poly) {
      if (!ring.length) continue;
      let cmd = "M";
      for (const [lon, lat] of ring) {
        parts.push(`${cmd}${mercX(lon).toFixed(1)} ${mercY(lat).toFixed(1)}`);
        cmd = "L";
      }
      parts.push("Z");
    }
  }
  return parts.length ? parts.join("") : null;
}

export const shiftMonths = (months, n) => (months || []).map((m) => ((m - 1 + n) % 12) + 1);
export function shiftCalendar(cal, months) {
  if (!cal) return null;
  const out = {};
  for (const [k, v] of Object.entries(cal)) {
    if (Array.isArray(v) && v.every((x) => typeof x === "number")) out[k] = shiftMonths(v, months);
    else out[k] = v;
  }
  return out;
}

/** Capitals (when in cities15000) plus the most populous cities already listed on each country page (up to 12). */
export const PLACE_PAGE_TOP_N = 12;

export function selectPlacePageCities(cityHits, placesPack) {
  const byCc = {};
  for (const c of cityHits) (byCc[c.cc] ||= []).push(c);
  for (const list of Object.values(byCc)) list.sort((a, b) => b.pop - a.pop);
  const chosen = new Set();
  const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  for (const list of Object.values(byCc)) {
    for (const c of list.slice(0, PLACE_PAGE_TOP_N)) chosen.add(c);
  }
  for (const [cc, meta] of Object.entries(placesPack.countries || {})) {
    const capital = meta[1];
    if (!capital) continue;
    const want = norm(capital);
    const hit = (byCc[cc] || []).find((c) => norm(c.name) === want || norm(c.ascii) === want);
    if (hit) chosen.add(hit);
  }
  return [...chosen];
}

export const PLACE_PAGE_NOTE = (
  "City pages are published for each territory’s capital (when it appears in the GeoNames cities15000 list) " +
  "and for the up to 12 most populous cities already listed on the country page. " +
  "Other GeoNames cities still work with ?place= links and search, but do not have a standing page."
);
