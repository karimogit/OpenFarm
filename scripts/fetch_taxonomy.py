#!/usr/bin/env python3
"""Check and fill scientific names and botanical families for every crop from Wikidata.

For each content/crops/<crop>.md:
  1. If it has a scientific_name, look for a Wikidata item whose taxon name (P225) is exactly that name.
  2. Otherwise (or if no such taxon exists) use the crop's English Wikipedia article
     (crop `wikipedia`, else the article our photo came from, else a page titled like the crop name)
     and take that item's taxon name; for a cultivar item without P225, take its parent taxon (P171).
  3. Walk P171 (parent taxon) up to the item ranked "family" (P105 = Q35409).
Writes data/taxonomy.json (with Wikidata ids so every name can be checked) and updates the
`scientific_name`, `family` and `wikidata` fields in the crop files. Never guesses: crops it
cannot resolve keep what they had and are listed as unresolved.

Usage: python3 scripts/fetch_taxonomy.py [--write]
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "OpenFarm-taxonomy/1.0 (https://github.com/karimogit/OpenFarm)"}
FAMILY, GENUS = "Q35409", "Q34740"
_cache = {}

CACHE_FILE = os.path.join(os.environ.get("TMPDIR", "/tmp"), "openfarm-wikidata-cache.json")
_http = json.load(open(CACHE_FILE)) if os.path.exists(CACHE_FILE) else {}

def get(url, params):
    q = url + "?" + urllib.parse.urlencode({**params, "format": "json", "maxlag": 30})
    if q in _http: return _http[q]
    for i in range(8):
        try:
            time.sleep(0.25)
            with urllib.request.urlopen(urllib.request.Request(q, headers=UA), timeout=30) as r:
                d = json.load(r)
            if "error" in d and d["error"].get("code") == "maxlag": raise RuntimeError("maxlag")
            _http[q] = d
            if len(_http) % 25 == 0: json.dump(_http, open(CACHE_FILE, "w"))
            return d
        except Exception:
            time.sleep(5 * (i + 1))
    raise RuntimeError("request failed: " + q)

def entity(qid):
    if qid not in _cache:
        d = get("https://www.wikidata.org/w/api.php", {"action": "wbgetentities", "ids": qid, "props": "claims"})
        _cache[qid] = d["entities"][qid]
    return _cache[qid]

def claim(e, p):
    out = []
    for c in e.get("claims", {}).get(p, []):
        v = c["mainsnak"].get("datavalue", {}).get("value")
        if isinstance(v, dict) and "id" in v: out.append(v["id"])
        elif v is not None: out.append(v)
    return out

def by_taxon_name(name):
    d = get("https://www.wikidata.org/w/api.php", {"action": "query", "list": "search", "srsearch": f'haswbstatement:"P225={name}"', "srlimit": 5})
    for hit in d["query"]["search"]:
        e = entity(hit["title"])
        if name in claim(e, "P225"): return hit["title"]
    return None

def wiki_item(title):
    d = get("https://en.wikipedia.org/w/api.php", {"action": "query", "titles": title, "prop": "pageprops", "ppprop": "wikibase_item", "redirects": 1})
    for p in d["query"]["pages"].values():
        if "missing" not in p: return p.get("pageprops", {}).get("wikibase_item"), p["title"]
    return None, None

def family_of(qid):
    seen = set()
    while qid and qid not in seen:
        seen.add(qid)
        e = entity(qid)
        if FAMILY in claim(e, "P105"):
            names = claim(e, "P225")
            return (names[0] if names else None), qid
        parents = claim(e, "P171")
        qid = parents[0] if parents else None
    return None, None

def candidates(sci):
    """'A b var. c / D e' → ['A b var. c', 'D e', 'A b', ...]: full names first, then the binomials."""
    alts = [re.sub(r"\s*'.*$", "", a).strip() for a in sci.split("/")]
    alts = [re.sub(r"subsp\. ([A-Z])", lambda m: "subsp. " + m.group(1).lower(), a) for a in alts if a]
    bins = [" ".join(a.split()[:2]) for a in alts if len(a.split()) > 2]
    out = []
    for a in alts + bins:
        if a and a not in out: out.append(a)
    return out

def resolve(crop, img):
    sci = crop.get("scientific_name")
    if sci:
        for i, name in enumerate(candidates(sci)):
            q = by_taxon_name(name)
            if q: return {"scientific_name": name, "wikidata": q,
                          "how": "recorded name matches a Wikidata taxon" if name == sci else f"Wikidata taxon for '{name}' (recorded: '{sci}')"}
    titles = []
    if crop.get("wikipedia"): titles.append(crop["wikipedia"].rsplit("/", 1)[-1])
    if img and img.get("article"): titles.append(urllib.parse.unquote(img["article"].rsplit("/", 1)[-1]))
    titles.append(crop["name"])
    for t in titles:
        q, title = wiki_item(t.replace("_", " "))
        if not q: continue
        e = entity(q)
        names = claim(e, "P225")
        if names:
            # Only accept the article if it agrees with the rescue genus (when there is one) – guards against
            # a photo article that is about a different plant.
            if sci and names[0].split()[0] != sci.split()[0] and crop.get("name", "").lower() not in title.lower(): continue
            return {"scientific_name": names[0], "wikidata": q, "how": f"Wikipedia article '{title}'"}
        parents = claim(e, "P171") or [x for x in claim(e, "P279") if claim(entity(x), "P225")]
        if parents:
            pn = claim(entity(parents[0]), "P225")
            if pn and (not sci or pn[0].split()[0] == sci.split()[0]):
                return {"scientific_name": pn[0], "wikidata": parents[0], "cultivar_item": q,
                        "how": f"Wikipedia article '{title}' is a cultivar of this taxon"}
    return None

def main():
    write = "--write" in sys.argv
    imgs = json.load(open(os.path.join(ROOT, "data/images.json")))
    out, unresolved = {}, []
    cdir = os.path.join(ROOT, "content/crops")
    for f in sorted(os.listdir(cdir)):
        slug = f[:-3]
        text = open(os.path.join(cdir, f)).read()
        fm = {}
        for l in text.split("---", 2)[1].split("\n"):  # top-level scalar fields only
            m = re.match(r"^(name|scientific_name|wikipedia): *(.+)$", l)
            if m: fm[m.group(1)] = m.group(2).strip().strip("'\"")
        r = resolve(fm, imgs.get("crop:" + slug))
        if not r:
            unresolved.append(slug); print("?", slug, fm.get("scientific_name"), flush=True); continue
        fam, fq = family_of(r["wikidata"])
        r["family"] = fam
        out[slug] = r
        print("✓", slug, r["scientific_name"], fam or "–", r["wikidata"], flush=True)
    json.dump(_http, open(CACHE_FILE, "w"))
    json.dump({"source": "Wikidata (CC0), https://www.wikidata.org", "crops": out, "unresolved": unresolved},
              open(os.path.join(ROOT, "data/taxonomy.json"), "w"), indent=1, ensure_ascii=False)
    if write:
        for slug, r in out.items():
            p = os.path.join(cdir, slug + ".md")
            head, body = open(p).read().split("---", 2)[1:]
            lines = [l for l in head.strip("\n").split("\n") if not re.match(r"^(scientific_name|family|wikidata):", l)]
            i = next(i for i, l in enumerate(lines) if l.startswith("name:")) + 1
            add = [f"scientific_name: {json.dumps(r['scientific_name'], ensure_ascii=False)}"]
            if r.get("family"): add.append(f"family: {r['family']}")
            add.append(f"wikidata: {r['wikidata']}")
            lines[i:i] = add
            open(p, "w").write("---\n" + "\n".join(lines) + "\n---" + body)
    print(f"{len(out)} resolved, {len(unresolved)} unresolved: {', '.join(unresolved)}")

if __name__ == "__main__":
    main()
