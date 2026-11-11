#!/usr/bin/env python3
"""Find a freely licensed Wikimedia Commons photo of the *seeds* of each crop (writes data/seed-images.json).

Strict on purpose – no image is better than a wrong one:
  1. Files in the Commons category "Seeds of <scientific name>" (or "<scientific name> seeds"), then
  2. a Commons search for "<scientific name>" seeds,
and a file is only accepted if its file name mentions seeds, it belongs to the genus (name or category),
(seed/seeds/Samen/graine/semilla/semente/zaden), it is a bitmap with a free licence (CC0, PD, CC BY, CC BY-SA).
Only crops whose scientific name was checked against Wikidata (`wikidata:` field) are looked up.
Usage: python3 scripts/fetch_seed_images.py
"""
import json, os, re, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data/seed-images.json")
UA = {"User-Agent": "OpenFarm-seed-images/1.0 (https://github.com/karimogit/OpenFarm)"}
FREE = re.compile(r"^(cc0|cc[ -]by(-sa)?[ -][0-9.]+|cc[ -]by(-sa)?|public domain|pd)", re.I)
SEEDWORD = re.compile(r"\b(seeds?|samen|graines?|semillas?|sementes?|zaden|semi|frø|frö)\b", re.I)
BAD = re.compile(r"(book|catalog|catalogue|packet|label|illustration|drawing|plate|herbarium|poster|stamp|seedling|germinat|sprout|Garden and farm seeds|Hoffman Seeds|Recalcitrant seed|Compilation|seed potato|Production of|Wellcome|viability test|midden|poop)", re.I)
# Files rejected in manual review (wrong species, generic or misleading); see PR notes.
REJECT = re.compile(r"Fabaceae \(seeds\)|Eastern dodder|Cassava seed|Turmeric seeds|Citrus reticulata x sinensis|Hazel tree seed pods|Rongmei|East-West Seed|source of sesame|Kincaid|Pyrus bourgaeana|Musa yunnanensis|Sambucus racemosa|Vicia hirsuta|Morus rubra|Am\. blitoides|Robusta|Thyme Seed Power|Passiflora ligularis|Inga feuillei")
strip = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()

def api(params):
    q = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    for i in range(5):
        try:
            time.sleep(0.3)
            with urllib.request.urlopen(urllib.request.Request(q, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(3 * (i + 1))
    return {}

def info(pages, genus):
    for p in pages:
        ii = (p.get("imageinfo") or [None])[0]
        if not ii or not re.search(r"\.(jpe?g|png|tiff?|webp)$", p["title"], re.I): continue
        m = ii.get("extmetadata", {})
        lic = strip(m.get("LicenseShortName", {}).get("value"))
        if m.get("NonFree", {}).get("value") == "true" or not FREE.match(lic): continue
        title, cats = p["title"], strip(m.get("Categories", {}).get("value"))
        # The file name must say "seed" and the file must be about this genus (name or Commons category);
        # catalogues, books, packets and drawings are skipped.
        if not SEEDWORD.search(title.replace("_", " ")) or BAD.search(title + " " + cats) or REJECT.search(title): continue
        if genus.lower() not in (title + " " + cats).lower(): continue
        if ii["width"] < 300: continue
        return {"file": p["title"][5:], "orig_url": ii["url"], "orig_width": ii["width"], "orig_height": ii["height"],
                "src": ii.get("thumburl", ii["url"]), "author": strip(m.get("Artist", {}).get("value")) or "Unknown author",
                "license": lic, "license_url": m.get("LicenseUrl", {}).get("value"), "source": ii["descriptionurl"]}
    return None

PROPS = {"prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 500}

def find(sci):
    genus = sci.split()[0].replace("×", "").strip()
    for cat in (f"Category:Seeds of {sci}", f"Category:{sci} seeds", f"Category:{sci} - seeds"):
        d = api({"action": "query", "generator": "categorymembers", "gcmtitle": cat, "gcmtype": "file", "gcmlimit": 20, **PROPS})
        pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p["title"])
        hit = info(pages, genus)
        if hit: return {**hit, "found_by": cat}
    d = api({"action": "query", "generator": "search", "gsrsearch": f'"{sci}" seeds filetype:bitmap', "gsrnamespace": 6, "gsrlimit": 15, **PROPS})
    pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p["index"])
    hit = info(pages, genus)
    return {**hit, "found_by": f'Commons search "{sci}" seeds'} if hit else None

def main():
    cache = json.load(open(OUT)) if os.path.exists(OUT) else {}
    cdir = os.path.join(ROOT, "content/crops")
    for f in sorted(os.listdir(cdir)):
        head = open(os.path.join(cdir, f)).read().split("---", 2)[1]
        sci = re.search(r'^scientific_name: *"?([^"\n]+)"?', head, re.M)
        if not sci or not re.search(r"^wikidata:", head, re.M): continue
        key = "crop:" + f[:-3]
        if key in cache: continue
        cache[key] = find(sci.group(1).strip())
        print("✓" if cache[key] else "–", key, cache[key]["file"] if cache[key] else "", flush=True)
        json.dump(cache, open(OUT, "w"), indent=1, ensure_ascii=False)
    found = sum(1 for v in cache.values() if v)
    print(f"{found} of {len(cache)} crops have a seed photo")

if __name__ == "__main__":
    main()
