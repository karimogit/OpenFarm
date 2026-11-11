// Shared helpers for telling botanical plates / drawings from photographs.
export const ILLUST_RE = new RegExp(
  [
    "k[oö]hler",
    "koehler",
    "medizinal[- ]?pflanzen",
    "illustration[_ ]",
    "illustrated",
    "botanical illustrations?",
    "engraving",
    "lithograph",
    "herbarium",
    "erbario",
    "herbario",
    "woodcut",
    "etching",
    "flore m[eé]dicale",
    "flora von deutschland",
    "otto wilhelm thom[eé]",
    "am[eé]d[eé]e masclef",
    "francisco manuel blanco",
    "curtis.?s botanical",
    "sowerby",
    "scientific diagram",
    " anatomi",
    "pancrace bessa",
    "van nooten",
    "woodville",
    "redout[eé]",
    "masclef",
  ].join("|"),
  "i",
);

const PHOTO_OK_RE = /botanischer garten|botanical garden|botanical gardens|jardin botanique/i;

const ILLUST_CAT_RE = new RegExp(
  [
    "botanical illustrations",
    "illustrations of",
    "engravings of",
    "lithographs of",
    "drawings of",
    "watercolors? of",
    "watercolours? of",
    "herbarium specimens",
    "herbarium of",
    "scientific illustrations",
    "medical plants",
    "k[oö]hler",
    "medizinal-pflanzen",
    "flora von deutschland",
    "flora de filipinas",
    "atlas des plantes",
  ].join("|"),
  "i",
);

export function looksLikeIllustration({ file = "", author = "", src = "", title = "", categories = [] } = {}) {
  const blob = [file, author, src, title].join(" ");
  if (PHOTO_OK_RE.test(blob) && !/illustration[_ ]|k[oö]hler|medizinal/i.test(blob)) return false;
  // "kohlrabi" contains "kohl" but is not a Köhler plate by that alone.
  if (ILLUST_RE.test(blob)) return true;
  for (const c of categories) {
    if (ILLUST_CAT_RE.test(c)) return true;
  }
  return false;
}
