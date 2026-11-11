// Viewport-sized Köppen overlay. A Leaflet ImageOverlay of the world mercator
// PNG is scaled to 256×2^zoom pixels (16 384 px already at zoom 6, 65 536 at
// zoom 8), which many GPUs and headless browsers fail to texture, leaving the
// climate colours in the wrong place. We draw the same 1440×1440 PNG through
// an SVG viewBox that matches the current map bounds, same as the no-JS fallback.
const IMG = 1440;
const MAX_LAT = 85.05112878;

export function mercatorPx(lat, lon, size = IMG) {
  const x = ((+lon + 180) / 360) * size;
  const clamped = Math.max(Math.min(+lat, MAX_LAT), -MAX_LAT);
  const latR = clamped * Math.PI / 180;
  const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + latR / 2)) / (2 * Math.PI)) * size;
  return [x, y];
}

export function attachClimateOverlay(map, url, { opacity = 0.65, attribution = "Köppen–Geiger: Beck et al. 2018 (CC BY 4.0)" } = {}) {
  const L = window.L;
  if (!map || !L || !url) return { addTo() {}, remove() {} };

  if (!map.getPane("climate")) {
    map.createPane("climate");
    const pane = map.getPane("climate");
    pane.style.zIndex = 350;
    pane.style.pointerEvents = "none";
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("climate-overlay");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;opacity:${opacity};`;
  const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
  image.setAttribute("href", url);
  image.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
  image.setAttribute("width", String(IMG));
  image.setAttribute("height", String(IMG));
  image.setAttribute("preserveAspectRatio", "none");
  svg.appendChild(image);

  const update = () => {
    if (!svg.isConnected) return;
    const size = map.getSize();
    svg.setAttribute("width", String(size.x));
    svg.setAttribute("height", String(size.y));
    svg.style.width = size.x + "px";
    svg.style.height = size.y + "px";
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(svg, topLeft);
    const b = map.getBounds();
    const [x0, y0] = mercatorPx(b.getNorth(), b.getWest());
    const [x1, y1] = mercatorPx(b.getSouth(), b.getEast());
    const w = Math.max(x1 - x0, 1e-6);
    const h = Math.max(y1 - y0, 1e-6);
    svg.setAttribute("viewBox", `${x0} ${y0} ${w} ${h}`);
  };

  const layer = {
    addTo(m) {
      (m || map).getPane("climate").appendChild(svg);
      (m || map).on("move zoom zoomanim viewreset resize", update);
      if (attribution && (m || map).attributionControl) {
        (m || map).attributionControl.addAttribution(attribution);
      }
      update();
      return layer;
    },
    remove() {
      map.off("move zoom zoomanim viewreset resize", update);
      if (attribution && map.attributionControl) {
        map.attributionControl.removeAttribution(attribution);
      }
      svg.remove();
      return layer;
    },
  };
  return layer;
}
