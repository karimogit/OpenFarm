// USDA-style half zones. Index 0 is 1a, 25 is 13b (5 °F / about 2.8 °C steps).
// A bare number such as "8" means the whole zone: it starts at 8a and ends at 8b.

const ZONE_RE = /^(1[0-3]|[1-9])([ab])?$/;

export function zoneBound(zone, edge = "start") {
  const m = String(zone ?? "").trim().toLowerCase().match(ZONE_RE);
  if (!m) return null;
  const base = (Number(m[1]) - 1) * 2;
  if (m[2] === "a") return base;
  if (m[2] === "b") return base + 1;
  return edge === "end" ? base + 1 : base;
}

/** True when half-zone index (0 = 1a … 25 = 13b) lies inside the sourced min–max range. */
export function zoneCovers(min, max, index) {
  const a = zoneBound(min, "start");
  const b = zoneBound(max, "end");
  return a != null && b != null && a <= b && index >= a && index <= b;
}
