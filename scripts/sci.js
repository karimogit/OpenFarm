// Format a botanical/cultivar name for display (ICNafp + ICNCP).
// Latin epithets are marked with <span class="lat"> (italic in CSS). Rank
// abbreviations (var., subsp., f.), the hybrid sign, and cultivar epithets
// in single quotes stay upright. Never invent missing ranks or epithets.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

const RANK = /^(var\.|subsp\.|ssp\.|f\.|fo\.|cv\.|convar\.|grex)$/i;
const HYBRID = /^(×|x|X)$/;

function takeQuotes(name) {
  const m = String(name || "").trim().match(/^(.*?)\s+'([^']+)'\s*$/);
  return m ? { base: m[1].trim(), cultivar: m[2] } : { base: String(name || "").trim(), cultivar: null };
}

function markLatin(base) {
  return base.split(/\s+/).filter(Boolean).map((tok) => {
    if (RANK.test(tok) || HYBRID.test(tok) || tok === "×") return esc(tok);
    return `<span class="lat">${esc(tok)}</span>`;
  }).join(" ");
}

// varietySci: sourced variety-level name, if any.
// cropSci: crop species name (fallback).
// cultivar: cultivar epithet without quotes, if known.
export function scientificMarkup(varietySci, cropSci, cultivar) {
  const sourced = (varietySci || "").trim();
  const crop = (cropSci || "").trim();
  const raw = sourced || crop;
  if (!raw) return "";
  const parsed = takeQuotes(raw);
  const base = parsed.base;
  const hasInfra = /\b(?:var|subsp|ssp|f|fo|cv|convar|grex)\./i.test(base);
  // If the variety name is only the same species as the crop, still use it as the binomial.
  let html = markLatin(base);
  const cv = parsed.cultivar || (hasInfra ? null : (cultivar || null));
  if (cv) html += ` &#39;${esc(cv)}&#39;`;
  return html;
}

export function scientificText(varietySci, cropSci, cultivar) {
  return scientificMarkup(varietySci, cropSci, cultivar)
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}
