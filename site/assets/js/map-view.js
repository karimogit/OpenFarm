// Pure helpers for country/place map views. No DOM — safe to unit-test.
export const CITY_ZOOM = 10;

export function viewFor(bounds, pin) {
  // A pin with an explicit zoom is a city/place view: centre on the pin and
  // ignore country-sized bounds so fitBounds cannot zoom out to a national inset.
  if (pin && Number.isFinite(+pin.lat) && Number.isFinite(+pin.lon) && Number.isFinite(+pin.zoom)) {
    const zoom = Math.min(18, Math.max(1, +pin.zoom));
    return { type: "center", lat: +pin.lat, lon: +pin.lon, zoom };
  }
  if (bounds && Number.isFinite(+bounds.south) && Number.isFinite(+bounds.west)
      && Number.isFinite(+bounds.north) && Number.isFinite(+bounds.east)) {
    let east = +bounds.east, west = +bounds.west;
    if (east > 180) east = 180;
    if (west < -180) west = -180;
    if (east > west) {
      return { type: "bounds", south: +bounds.south, west, north: +bounds.north, east, maxZoom: 8 };
    }
  }
  if (pin && Number.isFinite(+pin.lat) && Number.isFinite(+pin.lon)) {
    return { type: "center", lat: +pin.lat, lon: +pin.lon, zoom: bounds ? 6 : 7 };
  }
  return { type: "center", lat: 20, lon: 0, zoom: 2 };
}
