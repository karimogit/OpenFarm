// Map init must wait for Leaflet CSS and a non-zero pane, then refit after invalidateSize.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./content.js";
import { viewFor, CITY_ZOOM } from "../site/assets/js/map-view.js";
import { mercatorPx, overlayViewBox, OVERLAY_COPY_OFFSETS } from "../site/assets/js/climate-overlay.js";

let failed = 0;
function ok(cond, msg) { if (!cond) { failed++; console.error("FAIL:", msg); } else console.log("ok:", msg); }

const src = fs.readFileSync(path.join(ROOT, "site/assets/js/country-map.js"), "utf8");
ok(src.includes("loadCss(BASE + \"assets/vendor/leaflet/leaflet.css\")"), "Leaflet CSS is loaded via BASE");
ok(/await Promise\.all\(\[\s*loadCss/.test(src) || src.includes("await Promise.all"), "CSS and JS load are awaited together");
ok(src.indexOf("fallback.hidden = true") < src.indexOf("window.L.map("), "SVG fallback is hidden before L.map()");
ok(src.includes("afterLayout()") && src.indexOf("afterLayout()") < src.indexOf("window.L.map("), "layout is flushed before L.map()");
ok(src.includes("clientWidth") && src.includes("clientHeight"), "refuses to init a zero-size pane");
ok(src.includes("map.invalidateSize()") && src.includes("applyView(map, view)"), "refits bounds after invalidateSize");
ok(src.includes("imagePath") && src.includes("assets/vendor/leaflet/images/") && src.includes("Icon.Default"), "marker icons set imagePath so Leaflet does not prefix the URL twice");
ok(!/iconUrl:\s*dir\s*\+/.test(src) && !src.includes('iconUrl: dir + "marker-icon.png"'), "marker iconUrl stays a filename, not a second copy of the image directory");

const nl = viewFor({ south: 50.45, west: 3.05, north: 54.05, east: 7.95 }, { lat: 52.374, lon: 4.89 });
ok(nl.type === "bounds" && nl.south === 50.45 && nl.west === 3.05 && nl.east === 7.95 && nl.north === 54.05, "Netherlands-style bounds are used as fitBounds");
const wrap = viewFor({ south: -20, west: 160, north: 10, east: 200 }, null);
ok(wrap.type === "bounds" && wrap.east === 180, "dateline east is capped at 180");
const pinOnly = viewFor(null, { lat: 52.374, lon: 4.89 });
ok(pinOnly.type === "center" && pinOnly.lat === 52.374 && pinOnly.zoom === 7, "pin-only view centres on the pin");
const crossed = viewFor({ south: 1, west: 20, north: 2, east: 10 }, { lat: 1.5, lon: 15 });
ok(crossed.type === "center" && crossed.lat === 1.5, "invalid east<west falls back to the pin");
const city = viewFor({ south: 50.45, west: 3.05, north: 54.05, east: 7.95 }, { lat: 52.374, lon: 4.89, zoom: CITY_ZOOM });
ok(city.type === "center" && city.lat === 52.374 && city.lon === 4.89 && city.zoom === CITY_ZOOM,
  "city pin with zoom centres on the city and ignores country-sized bounds");
ok(CITY_ZOOM >= 9 && CITY_ZOOM <= 12, "CITY_ZOOM is a city-scale Leaflet zoom");

const home = fs.readFileSync(path.join(ROOT, "site/assets/js/home.js"), "utf8");
ok(home.includes("invalidateSize") && home.includes("details-panel"), "home map refits when the location panel is opened");
ok(!home.includes("Math.max(map.getZoom(), 5)"), "home map no longer keeps a western-Europe zoom when a city is chosen");
ok(home.includes("CITY_ZOOM") && home.includes("map.setView([lat, lon], CITY_ZOOM)"), "home map zooms to CITY_ZOOM on city selection");
ok(home.includes("lastView") && /if \(lastView\) map\.setView/.test(home), "home map restores the chosen city view after a panel refit");
ok(/maxZoom:\s*12/.test(src), "country/city map tiles allow zoom 12 so a city view can zoom in");
ok(src.includes("attachClimateOverlay") && !src.includes("imageOverlay"), "country map uses a viewport SVG climate overlay, not a world-sized ImageOverlay");
const [ax, ay] = mercatorPx(52.37, 4.89);
ok(Math.abs(ax - 739.6) < 1 && Math.abs(ay - 473.2) < 1, `Amsterdam mercator px ~ (739.6, 473.2), got (${ax.toFixed(1)}, ${ay.toFixed(1)})`);

const nlBox = overlayViewBox(3.05, 50.45, 7.95, 54.05);
ok(nlBox && nlBox.width > 15 && nlBox.width < 30 && nlBox.x > 0 && nlBox.x + nlBox.width < 1440,
  "a country viewBox stays inside one world");
const dateline = overlayViewBox(170, -20, -170, 10);
ok(dateline && dateline.width > 50 && dateline.width < 120,
  `antimeridian view uses the short span, not the long way (width ${dateline && dateline.width.toFixed(1)})`);
const wide = overlayViewBox(-200, -40, 200, 40);
ok(wide && wide.width > 1440 && wide.x < 0 && wide.x + wide.width > 1440,
  "a low-zoom view wider than one world extends past the base image");
ok(OVERLAY_COPY_OFFSETS.includes(-1) && OVERLAY_COPY_OFFSETS.includes(1) && OVERLAY_COPY_OFFSETS.includes(0),
  "climate overlay repeats the world image across ±180°");


if (failed) { console.error(`\n${failed} map test(s) failed.`); process.exit(1); }
console.log("✓ map tests passed");
