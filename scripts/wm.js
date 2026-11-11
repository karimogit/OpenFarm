// Wikimedia Commons thumbnail helpers. Commons only serves standard thumbnail widths, so pick the
// smallest standard width >= the wanted one, and never upscale: if the original is smaller, use it.
// Wikimedia production only serves these standard widths (https://w.wiki/GHai / T414805).
// Direct 320/640 requests are rejected with HTTP 400; 330/500/960 are the closest allowed sizes.
const WM_STEPS = [250, 330, 500, 960, 1280, 1920, 3840];
const HERO_WIDTHS = [330, 500, 960];

export function wmThumb(img, want) {
  if (!img) return "";
  const orig = String(img.orig_url || "").replace(/[?#].*$/, ""), ow = img.orig_width;
  if (!orig || !ow) return img.src;
  const w = WM_STEPS.find((s) => s >= want) || WM_STEPS.at(-1);
  if (w >= ow) return orig;
  const m = orig.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+)\/(.+\/)([^/]+)$/);
  if (!m) return img.src;
  const [, base, dir, file] = m;
  const ext = file.split(".").pop().toLowerCase();
  const suffix = ext === "svg" ? ".png" : ["tif", "tiff"].includes(ext) ? ".jpg" : "";
  return `${base}/thumb/${dir}${file}/${w}px-${file}${suffix}`;
}

// 1x/2x srcset for small card thumbs (want + 2× want).
export function wmSrcset(img, want) {
  if (!img || !img.orig_width) return "";
  const a = wmThumb(img, want), b = wmThumb(img, want * 2);
  return a === b ? `${a} 1x` : `${a} 1x, ${b} 2x`;
}

// Width-descriptor srcset for page heroes (330/500/960).
export function wmSrcsetWidths(img, widths = HERO_WIDTHS) {
  if (!img) return "";
  const list = Array.isArray(widths) && widths.length ? widths : HERO_WIDTHS;
  const parts = [], seen = new Set();
  for (const w of list) {
    const url = wmThumb(img, w);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const used = Math.min(w, img.orig_width || w);
    parts.push(`${url} ${used}w`);
  }
  return parts.join(", ");
}

export function imageUrls(img, widths = [250, ...HERO_WIDTHS]) {
  if (!img) return [];
  const urls = new Set();
  const orig = String(img.orig_url || "").replace(/[?#].*$/, "");
  if (orig) urls.add(orig);
  if (img.src) urls.add(String(img.src).replace(/[?#].*$/, ""));
  for (const w of widths) {
    const u = wmThumb(img, w);
    if (u) urls.add(u);
  }
  return [...urls];
}
