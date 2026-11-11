// Wikimedia Commons thumbnail helpers. Commons only serves standard thumbnail widths, so pick the
// smallest standard width >= the wanted one, and never upscale: if the original is smaller, use it.
const WM_STEPS = [250, 330, 500, 960, 1280, 1920];

export function wmThumb(img, want) {
  if (!img) return "";
  const orig = img.orig_url, ow = img.orig_width;
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

export function wmSrcset(img, want) {
  if (!img || !img.orig_width) return "";
  const a = wmThumb(img, want), b = wmThumb(img, want * 2);
  return a === b ? `${a} 1x` : `${a} 1x, ${b} 2x`;
}
