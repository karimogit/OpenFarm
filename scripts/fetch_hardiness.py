#!/usr/bin/env python3
"""Fill `hardiness: {min, max, sources}` (USDA plant hardiness zones) for perennials, fruit, berries, nuts and herbs.

Source: NC State Extension Gardener Plant Toolbox (plants.ces.ncsu.edu), which lists
"USDA Plant Hardiness Zone: 8a, 8b, …" per species. A page is only used when its heading names the
same scientific name as the crop (genus + species), so no zone values are guessed. Crops without a
matching page stay blank. Run: python3 scripts/fetch_hardiness.py [--write]
"""
import json, os, re, sys, time, urllib.request, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "OpenFarm-data-bot/1.0 (https://github.com/karimogit/OpenFarm)"}
ZONE = re.compile(r"\b(1[0-3]|[1-9])([ab])\b")

def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            return r.read().decode("utf-8", "ignore")
    except Exception:
        return None

def zone_key(z):
    m = re.match(r"(\d+)([ab]?)", z); return int(m.group(1)) * 2 + (1 if m.group(2) == "b" else 0)

def lookup(sci):
    parts = re.sub(r"[×x] ", "", sci).split()
    if len(parts) < 2: return None
    cands = []
    if len(parts) >= 4 and parts[2] in ("var.", "subsp."): cands.append("-".join([parts[0], parts[1], parts[3]]).lower())
    cands.append(f"{parts[0]}-{parts[1]}".lower())
    for slug in cands:
        url = f"https://plants.ces.ncsu.edu/plants/{slug}/"
        t = get(url); time.sleep(1)
        if not t: continue
        title = html.unescape(re.sub(r"<[^>]+>", " ", (re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S) or [None, ""])[1]))
        if f"{parts[0]} {parts[1]}".lower() not in re.sub(r"\s+", " ", title).lower(): continue
        m = re.search(r"USDA Plant Hardiness Zone:\s*(?:<[^>]+>\s*)*([^<]+)", t)
        if not m: continue
        zones = sorted({a + b for a, b in ZONE.findall(m.group(1))}, key=zone_key)
        if not zones: continue
        return {"min": zones[0], "max": zones[-1], "url": url, "title": re.sub(r"\s+", " ", title).strip()}
    return None

def main():
    write = "--write" in sys.argv; out = {}
    cdir = os.path.join(ROOT, "content/crops")
    for f in sorted(os.listdir(cdir)):
        t = open(os.path.join(cdir, f)).read(); head = t.split("---", 2)[1]
        g = lambda k: (re.search(rf'^{k}: *"?([^"\n]+)"?', head, re.M) or [None, ""])[1].strip()
        if not (g("lifecycle") in ("perennial", "biennial") or g("type") in ("fruit", "berry", "nut", "herb")): continue
        if not g("scientific_name") or "hardiness:" in head: continue
        r = lookup(g("scientific_name")); out[f[:-3]] = r
        print(("✓ " if r else "· ") + f[:-3], g("scientific_name"), (r["min"] + "–" + r["max"]) if r else "", flush=True)
        if r and write:
            block = (f"hardiness:\n  min: \"{r['min']}\"\n  max: \"{r['max']}\"\n  sources:\n"
                     f"    - title: {json.dumps(r['title'] + ' – Plant Toolbox')}\n      publisher: NC State Extension\n      url: {r['url']}\n")
            parts = t.split("---", 2)
            open(os.path.join(cdir, f), "w").write("---" + parts[1].rstrip("\n") + "\n" + block + "---" + parts[2])
    json.dump(out, open(os.path.join(ROOT, "data/hardiness.json"), "w"), indent=1, ensure_ascii=False)
    print(sum(1 for v in out.values() if v), "of", len(out), "resolved")

if __name__ == "__main__":
    main()
