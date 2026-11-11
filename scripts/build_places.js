#!/usr/bin/env node
// Build a compact offline gazetteer from GeoNames cities15000 + countryInfo + admin1
// (https://download.geonames.org/export/dump/, CC BY 4.0).
//
//   node scripts/build_places.js [dir-with-dumps]
//
// Writes data/places.json (cities + countries) and data/countries.json (ISO code → name).
// The site lazy-loads places.json in the header and home search; Nominatim remains a fallback.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ROOT } from "./content.js";

const SRC = process.argv[2] || "/tmp/geonames";
const citiesPath = path.join(SRC, "cities15000.txt");
const countryPath = path.join(SRC, "countryInfo.txt");
const adminPath = path.join(SRC, "admin1CodesASCII.txt");
if (!fs.existsSync(citiesPath) || !fs.existsSync(countryPath)) {
  console.error("Missing GeoNames dumps. Download cities15000.txt, countryInfo.txt and admin1CodesASCII.txt");
  console.error("from https://download.geonames.org/export/dump/ into", SRC);
  process.exit(1);
}

const countries = {}; // CC -> {name, capital, lat, lon, pop, capitalName}
for (const line of fs.readFileSync(countryPath, "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const c = line.split("\t");
  // ISO, ISO3, ISO-Numeric, fips, name, capital, area, pop, continent, tld, currencyCode, currencyName, phone, postalFormat, postalRegex, languages, geonameid, neighbours, equivalentFipsCode
  const cc = c[0];
  if (!cc || cc.length !== 2) continue;
  countries[cc] = { name: c[4], capital: c[5] || "", pop: +c[7] || 0, lat: null, lon: null };
}

const admin1 = {}; // "NL.07" -> "North Holland"
for (const line of fs.readFileSync(adminPath, "utf8").split("\n")) {
  if (!line) continue;
  const [code, name, ascii] = line.split("\t");
  if (code && name) admin1[code] = ascii && ascii !== name ? ascii : name;
}

// Packed city: [name, asciiOrEmpty, cc, admin1code, lat, lon, pop]
const cities = [];
const capitalIndex = {}; // cc -> best capital city row
for (const line of fs.readFileSync(citiesPath, "utf8").split("\n")) {
  if (!line) continue;
  const f = line.split("\t");
  // 0 id, 1 name, 2 ascii, 3 alts, 4 lat, 5 lon, 6 fclass, 7 fcode, 8 cc, 9 cc2, 10 admin1, 11 admin2, 12 admin3, 13 admin4, 14 pop, 15 elev, 16 dem, 17 tz, 18 mod
  const name = f[1], ascii = f[2], cc = f[8], admin = f[10] || "", pop = +f[14] || 0;
  const lat = Math.round(+f[4] * 1000) / 1000, lon = Math.round(+f[5] * 1000) / 1000;
  if (!name || !cc || cc.length !== 2) continue;
  const asciiOut = ascii && ascii.toLowerCase() !== name.toLowerCase() ? ascii : "";
  // Cheap alt names: only include short, distinctive alts later if needed. ascii covers transliteration.
  const row = [name, asciiOut, cc, admin, lat, lon, pop];
  cities.push(row);
  const cap = countries[cc]?.capital;
  if (cap && (name === cap || ascii === cap) && (!(cc in capitalIndex) || pop > capitalIndex[cc][6])) {
    capitalIndex[cc] = row;
    countries[cc].lat = lat;
    countries[cc].lon = lon;
  }
}

// If a capital name didn't match a city row, leave lat/lon null; search can still list the country
// after a city in that country is picked, or fall back to Nominatim.

cities.sort((a, b) => b[6] - a[6] || a[0].localeCompare(b[0]));

const countryTable = Object.fromEntries(
  Object.entries(countries).map(([cc, c]) => [cc, [c.name, c.capital, c.lat, c.lon, c.pop]])
);

const out = {
  attribution: "GeoNames (www.geonames.org), CC BY 4.0",
  countries: countryTable,
  admin1,
  cities,
};

const jsonPath = path.join(ROOT, "data/places.json");
const countriesPath = path.join(ROOT, "data/countries.json");
fs.writeFileSync(jsonPath, JSON.stringify(out));
fs.writeFileSync(countriesPath, JSON.stringify(
  Object.fromEntries(Object.entries(countries).map(([cc, c]) => [cc, c.name])),
  null, 1
) + "\n");

const raw = fs.statSync(jsonPath).size;
const gz = zlib.gzipSync(fs.readFileSync(jsonPath), { level: 9 }).length;
console.log(`Places: ${cities.length} cities, ${Object.keys(countries).length} countries, ${Object.keys(admin1).length} admin1`);
console.log(`data/places.json: ${(raw / 1024).toFixed(1)} KB raw, ${(gz / 1024).toFixed(1)} KB gzip`);
console.log(`data/countries.json: ${(fs.statSync(countriesPath).size / 1024).toFixed(1)} KB`);
