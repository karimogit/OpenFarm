#!/usr/bin/env python3
"""Import licence-safe taxonomy from Wikidata (CC0).

Cultivar records: English-labelled items with taxon rank cultivar (P105 = Q4886)
whose taxon name starts with one crop's scientific name (longest match wins;
ties are skipped). Only quoted cultivar epithets are kept. No growing advice
is copied. Each crop is filled up to 8 varieties.

New crops: a short list of widely grown food plants that this catalogue does
not already have. The scientific name must match a Wikidata taxon name exactly;
family comes from that item. The page text is ours.

Not imported: OpenPlantDB's bulk file (many rows cite seed catalogues or
"general horticultural reference" with no URL) and the Wind River variety
database (CC BY on the compilation, but built from seed-catalogue feeds, which
SOURCES.md excludes).

  python3 scripts/import_wikidata.py           # print what would be added
  python3 scripts/import_wikidata.py --write   # write markdown
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "OpenFarmBot/0.2 (https://github.com/karimogit/OpenFarm; Wikidata CC0 import)"
TODAY = "2026-11-12"
MAX_VARIETIES = 8
QUOTE = re.compile(r"['\u2018\u2019]([^'\u2018\u2019]{1,80})['\u2018\u2019]")
RANK = {"var.", "var", "subsp.", "subsp", "ssp.", "ssp", "sect.", "sect", "subg.", "subg", "f.", "×", "x"}

# slug, name, binomials to try (first hit on Wikidata P225 wins), type, lifecycle, aliases, our own sentence
NEW_CROPS = [
    ("watermelon", "Watermelon", ["Citrullus lanatus", "Citrullus vulgaris"], "fruit", "annual", [],
     "Watermelon is a warm-season trailing vine grown for its sweet fruit. It needs a long frost-free stretch. This page names the species; sowing dates belong in a regional guide."),
    ("oregano", "Oregano", ["Origanum vulgare"], "herb", "perennial", [],
     "Oregano is a perennial herb grown for its aromatic leaves, which are stronger after the plant flowers. This page names the species; climate-specific care belongs in a regional guide."),
    ("taro", "Taro", ["Colocasia esculenta"], "vegetable", "perennial", ["dasheen"],
     "Taro is a tropical perennial grown for its starchy corms and, in some varieties, its leaves. Corms and leaves need thorough cooking. This page names the species only."),
    ("lentil", "Lentil", ["Lens culinaris", "Vicia lens"], "legume", "annual", [],
     "Lentil is a cool-season grain legume grown for its lens-shaped seeds. This page names the species; sowing dates belong in a regional guide."),
    ("mung-bean", "Mung bean", ["Vigna radiata"], "legume", "annual", ["green gram"],
     "Mung bean is a warm-season legume grown for its dry seeds and for bean sprouts. This page names the species; sowing dates belong in a regional guide."),
    ("adzuki-bean", "Adzuki bean", ["Vigna angularis"], "legume", "annual", ["azuki bean"],
     "Adzuki bean is a warm-season legume grown for its small red seeds. This page names the species; sowing dates belong in a regional guide."),
    ("pigeon-pea", "Pigeon pea", ["Cajanus cajan"], "legume", "perennial-grown-as-annual", [],
     "Pigeon pea is a shrubby legume, often grown as an annual, kept for its dry peas. This page names the species; sowing dates belong in a regional guide."),
    ("lima-bean", "Lima bean", ["Phaseolus lunatus"], "legume", "annual", ["butter bean"],
     "Lima bean is a warm-season legume grown for its seeds, eaten fresh or dried. This page names the species; sowing dates belong in a regional guide."),
    ("winged-bean", "Winged bean", ["Psophocarpus tetragonolobus"], "legume", "perennial-grown-as-annual", ["goa bean"],
     "Winged bean is a twining legume grown for its winged pods, young leaves and tubers. This page names the species; sowing dates belong in a regional guide."),
    ("rice", "Rice", ["Oryza sativa"], "grain", "annual", [],
     "Rice is the cereal grown for its grain, in flooded paddies or, for some varieties, on dry ground. This page names the species; water and sowing details belong in a regional guide."),
    ("wheat", "Wheat", ["Triticum aestivum"], "grain", "annual", ["bread wheat"],
     "Wheat is the cool-season cereal grown for bread and other grain. This page names the species; sowing dates belong in a regional guide."),
    ("barley", "Barley", ["Hordeum vulgare"], "grain", "annual", [],
     "Barley is a cool-season cereal grown for grain, malt and animal feed. This page names the species; sowing dates belong in a regional guide."),
    ("rye", "Rye", ["Secale cereale"], "grain", "annual", [],
     "Rye is a hardy cool-season cereal grown for grain and as a winter cover. This page names the species; sowing dates belong in a regional guide."),
    ("sorghum", "Sorghum", ["Sorghum bicolor"], "grain", "annual", [],
     "Sorghum is a warm-season cereal grown for grain, syrup and fodder. This page names the species; sowing dates belong in a regional guide."),
    ("millet", "Proso millet", ["Panicum miliaceum"], "grain", "annual", ["common millet"],
     "Proso millet is a short-season cereal grown for its small grain. This page names the species; sowing dates belong in a regional guide."),
    ("chia", "Chia", ["Salvia hispanica"], "grain", "annual", [],
     "Chia is an annual sage grown for its edible seeds. This page names the species; sowing dates belong in a regional guide."),
    ("flax", "Flax", ["Linum usitatissimum"], "grain", "annual", ["linseed"],
     "Flax is an annual grown for its seed (linseed) and for fibre. This page names the species; sowing dates belong in a regional guide."),
    ("sugarcane", "Sugarcane", ["Saccharum officinarum"], "other", "perennial", [],
     "Sugarcane is a tall perennial grass grown for the sugar stored in its stalks. This page names the species; planting dates belong in a regional guide."),
    ("fig", "Fig", ["Ficus carica"], "fruit-tree", "perennial", ["common fig"],
     "Fig is a deciduous fruit tree or large shrub grown for its sweet fruit. This page names the species; pruning and winter care belong in a regional guide."),
    ("date", "Date", ["Phoenix dactylifera"], "fruit-tree", "perennial", ["date palm"],
     "Date is a palm grown for its sweet fruit. It needs a long hot season and, for most varieties, a male tree nearby. This page names the species only."),
    ("avocado", "Avocado", ["Persea americana"], "fruit-tree", "perennial", [],
     "Avocado is an evergreen tree grown for its rich fruit. Many varieties are frost-tender. This page names the species; climate limits belong in a regional guide."),
    ("mango", "Mango", ["Mangifera indica"], "fruit-tree", "perennial", [],
     "Mango is a tropical evergreen tree grown for its fruit. This page names the species; climate limits belong in a regional guide."),
    ("lychee", "Lychee", ["Litchi chinensis"], "fruit-tree", "perennial", ["litchi"],
     "Lychee is a subtropical evergreen tree grown for its sweet aril. This page names the species; climate limits belong in a regional guide."),
    ("jackfruit", "Jackfruit", ["Artocarpus heterophyllus"], "fruit-tree", "perennial", [],
     "Jackfruit is a tropical tree grown for its very large compound fruit. This page names the species; climate limits belong in a regional guide."),
    ("breadfruit", "Breadfruit", ["Artocarpus altilis"], "fruit-tree", "perennial", [],
     "Breadfruit is a tropical tree grown for its starchy fruit. This page names the species; climate limits belong in a regional guide."),
    ("soursop", "Soursop", ["Annona muricata"], "fruit-tree", "perennial", ["guanabana"],
     "Soursop is a tropical tree grown for its large aromatic fruit. This page names the species; climate limits belong in a regional guide."),
    ("tamarind", "Tamarind", ["Tamarindus indica"], "fruit-tree", "perennial", [],
     "Tamarind is a long-lived tropical tree grown for the sour pulp around its seeds. This page names the species only."),
    ("medlar", "Medlar", ["Mespilus germanica", "Crataegus germanica"], "fruit-tree", "perennial", [],
     "Medlar is a small deciduous fruit tree. The fruit is left to soften after picking before it is eaten. This page names the species only."),
    ("jujube", "Jujube", ["Ziziphus jujuba"], "fruit-tree", "perennial", ["Chinese date"],
     "Jujube is a small deciduous fruit tree grown for its sweet fruit. This page names the species; climate limits belong in a regional guide."),
    ("asian-pear", "Asian pear", ["Pyrus pyrifolia"], "fruit-tree", "perennial", ["nashi"],
     "Asian pear is a deciduous fruit tree grown for its crisp, apple-shaped fruit. This page names the species; pollination and climate limits belong in a regional guide."),
    ("sour-cherry", "Sour cherry", ["Prunus cerasus"], "fruit-tree", "perennial", ["tart cherry"],
     "Sour cherry is a deciduous fruit tree grown for cooking and juice. Many cultivars set fruit without a second tree. This page names the species only."),
    ("lime", "Lime", ["Citrus × aurantiifolia", "Citrus ×aurantiifolia", "Citrus aurantiifolia", "Citrus aurantifolia"], "fruit-tree", "perennial", ["key lime"],
     "Lime is a small evergreen citrus tree grown for its acid fruit. It is damaged by frost. This page names the species; climate limits belong in a regional guide."),
    ("kumquat", "Kumquat", ["Citrus japonica", "Fortunella margarita"], "fruit-tree", "perennial", [],
     "Kumquat is a small evergreen citrus grown for its small fruit, which is eaten skin and all. This page names the species; climate limits belong in a regional guide."),
    ("yuzu", "Yuzu", ["Citrus × junos", "Citrus ×junos", "Citrus junos"], "fruit-tree", "perennial", [],
     "Yuzu is a hardy citrus grown for its aromatic rind and juice. This page names the species; climate limits belong in a regional guide."),
    ("pomelo", "Pomelo", ["Citrus maxima"], "fruit-tree", "perennial", ["pummelo"],
     "Pomelo is a large evergreen citrus tree grown for its thick-rinded fruit. This page names the species; climate limits belong in a regional guide."),
    ("finger-lime", "Finger lime", ["Citrus australasica"], "fruit-tree", "perennial", ["caviar lime"],
     "Finger lime is an Australian citrus shrub grown for its small fruit, whose pulp separates into tiny vesicles. This page names the species only."),
    ("pecan", "Pecan", ["Carya illinoinensis"], "nut", "perennial", [],
     "Pecan is a large deciduous tree grown for its nuts. It needs a long warm season to fill the kernels. This page names the species only."),
    ("coconut", "Coconut", ["Cocos nucifera"], "nut", "perennial", ["coconut palm"],
     "Coconut is a tropical palm grown for its fruit, water and oil. It does not tolerate frost. This page names the species only."),
    ("macadamia", "Macadamia", ["Macadamia integrifolia"], "nut", "perennial", [],
     "Macadamia is a subtropical evergreen tree grown for its hard-shelled nuts. This page names the species; climate limits belong in a regional guide."),
    ("cashew", "Cashew", ["Anacardium occidentale"], "nut", "perennial", [],
     "Cashew is a tropical tree grown for the kernel inside its kidney-shaped shell. The shell oil is a skin irritant. This page names the species only."),
    ("brazil-nut", "Brazil nut", ["Bertholletia excelsa"], "nut", "perennial", [],
     "Brazil nut is a very large Amazonian tree grown for its nuts, which develop inside a hard woody fruit. This page names the species only."),
    ("stone-pine", "Stone pine", ["Pinus pinea"], "nut", "perennial", ["pine nut"],
     "Stone pine is a Mediterranean pine grown for its edible seeds, sold as pine nuts. This page names the species only."),
    ("cranberry", "Cranberry", ["Vaccinium macrocarpon"], "berry", "perennial", [],
     "Cranberry is a low evergreen bog shrub grown for its tart berries. Commercial beds are flooded at harvest. This page names the species only."),
    ("raspberry", "Raspberry", ["Rubus idaeus"], "berry", "perennial", [],
     "Raspberry is a cane fruit grown for its berries. Canes usually fruit in their second year and are then cut out. This page names the species only."),
    ("lingonberry", "Lingonberry", ["Vaccinium vitis-idaea"], "berry", "perennial", ["cowberry"],
     "Lingonberry is a low evergreen shrub grown for its tart red berries. This page names the species; climate limits belong in a regional guide."),
    ("aronia", "Aronia", ["Aronia melanocarpa"], "berry", "perennial", ["black chokeberry"],
     "Aronia is a hardy deciduous shrub grown for its astringent dark berries, usually cooked or juiced. This page names the species only."),
    ("sea-buckthorn", "Sea buckthorn", ["Hippophae rhamnoides", "Elaeagnus rhamnoides"], "berry", "perennial", ["seaberry"],
     "Sea buckthorn is a thorny deciduous shrub grown for its orange berries. Male and female flowers are on separate plants. This page names the species only."),
    ("serviceberry", "Serviceberry", ["Amelanchier alnifolia"], "berry", "perennial", ["saskatoon"],
     "Serviceberry is a deciduous shrub or small tree grown for its sweet dark fruit. This page is the species Amelanchier alnifolia; climate-specific care belongs in a regional guide."),
    ("dragon-fruit", "Dragon fruit", ["Selenicereus undatus", "Hylocereus undatus"], "fruit", "perennial", ["pitaya"],
     "Dragon fruit is a climbing cactus grown for its fruit. It is damaged by frost and needs a sturdy support. This page names the species only."),
    ("cacao", "Cacao", ["Theobroma cacao"], "fruit-tree", "perennial", ["cocoa"],
     "Cacao is a tropical understory tree grown for the seeds inside its pods, which are fermented and dried to make cocoa. This page names the species only."),
    ("black-pepper", "Black pepper", ["Piper nigrum"], "spice", "perennial", [],
     "Black pepper is a tropical vine grown for its dried fruit, the peppercorn. This page names the species; climate limits belong in a regional guide."),
    ("cinnamon", "Cinnamon", ["Cinnamomum verum", "Cinnamomum zeylanicum"], "spice", "perennial", ["true cinnamon"],
     "Cinnamon is an evergreen tree whose inner bark is the spice. This page names the species; climate limits belong in a regional guide."),
    ("vanilla", "Vanilla", ["Vanilla planifolia"], "spice", "perennial", [],
     "Vanilla is a tropical orchid vine grown for its cured seed pods. Flowers are often pollinated by hand away from its native range. This page names the species only."),
    ("cardamom", "Cardamom", ["Elettaria cardamomum"], "spice", "perennial", [],
     "Cardamom is a tropical perennial grown for the seeds inside its pods. This page names the species; climate limits belong in a regional guide."),
    ("clove", "Clove", ["Syzygium aromaticum"], "spice", "perennial", [],
     "Clove is a tropical evergreen tree grown for its dried unopened flower buds. This page names the species; climate limits belong in a regional guide."),
    ("nutmeg", "Nutmeg", ["Myristica fragrans"], "spice", "perennial", [],
     "Nutmeg is a tropical evergreen tree. The seed is nutmeg and the aril around it is mace. This page names the species only."),
    ("wasabi", "Wasabi", ["Eutrema japonicum", "Wasabia japonica"], "spice", "perennial", [],
     "Wasabi is a perennial brassica grown for its pungent rhizome. It wants cool, shady, wet conditions. This page names the species only."),
    ("caraway", "Caraway", ["Carum carvi"], "spice", "biennial", [],
     "Caraway is a biennial herb grown for its aromatic seeds. This page names the species; sowing dates belong in a regional guide."),
    ("star-anise", "Star anise", ["Illicium verum"], "spice", "perennial", [],
     "Star anise is an evergreen tree grown for its star-shaped dried fruits. This page names the species; climate limits belong in a regional guide."),
    ("sichuan-pepper", "Sichuan pepper", ["Zanthoxylum simulans", "Zanthoxylum bungeanum"], "spice", "perennial", [],
     "Sichuan pepper is a small deciduous tree grown for the aromatic husks around its seeds. This page names the species only."),
    ("curry-leaf", "Curry leaf", ["Bergera koenigii", "Murraya koenigii"], "spice", "perennial", [],
     "Curry leaf is a small tropical tree grown for its aromatic leaves. This page names the species; climate limits belong in a regional guide."),
    ("moringa", "Moringa", ["Moringa oleifera"], "vegetable", "perennial", ["drumstick tree"],
     "Moringa is a fast-growing tropical tree whose young leaves, pods and flowers are eaten. This page names the species; climate limits belong in a regional guide."),
    ("jicama", "Jicama", ["Pachyrhizus erosus"], "vegetable", "perennial-grown-as-annual", ["yam bean"],
     "Jicama is a climbing legume grown for its crisp tuber. The leaves, pods and ripe seeds are not eaten. This page names the species only."),
    ("bitter-melon", "Bitter melon", ["Momordica charantia"], "vegetable", "annual", ["bitter gourd"],
     "Bitter melon is a warm-season climbing vine grown for its bitter fruit, which is cooked. This page names the species; sowing dates belong in a regional guide."),
    ("malabar-spinach", "Malabar spinach", ["Basella alba"], "vegetable", "perennial-grown-as-annual", ["Ceylon spinach"],
     "Malabar spinach is a hot-season climbing green, often grown as an annual, kept for its succulent leaves. This page names the species only."),
    ("new-zealand-spinach", "New Zealand spinach", ["Tetragonia tetragonoides", "Tetragonia tetragonioides", "Tetragonia expansa"], "vegetable", "perennial-grown-as-annual", [],
     "New Zealand spinach is a leafy vegetable that keeps producing in hot weather when ordinary spinach bolts. This page names the species only."),
    ("good-king-henry", "Good King Henry", ["Blitum bonus-henricus", "Chenopodium bonus-henricus"], "vegetable", "perennial", [],
     "Good King Henry is a perennial leafy vegetable, once grown as a garden spinach. This page names the species only."),
    ("scorzonera", "Scorzonera", ["Scorzonera hispanica"], "vegetable", "perennial", ["black salsify"],
     "Scorzonera is grown for its long dark root, which is cooked. This page names the species; sowing dates belong in a regional guide."),
    ("burdock", "Burdock", ["Arctium lappa"], "vegetable", "biennial", ["gobo"],
     "Burdock is a biennial grown for its long root, harvested before the plant flowers. This page names the species; sowing dates belong in a regional guide."),
    ("swede", "Swede", ["Brassica napus"], "vegetable", "biennial", ["rutabaga"],
     "Swede is a biennial brassica grown as an annual for its swollen root. This page names the species; sowing dates belong in a regional guide."),
    ("shiso", "Shiso", ["Perilla frutescens"], "herb", "annual", ["perilla"],
     "Shiso is an annual herb grown for its aromatic leaves, in green and purple forms. This page names the species; sowing dates belong in a regional guide."),
    ("lemon-verbena", "Lemon verbena", ["Aloysia citrodora", "Aloysia triphylla"], "herb", "perennial", [],
     "Lemon verbena is a tender perennial shrub grown for its lemon-scented leaves. This page names the species; winter protection belongs in a regional guide."),
    ("pandan", "Pandan", ["Pandanus amaryllifolius"], "herb", "perennial", ["pandan leaf"],
     "Pandan is a tropical plant grown for its fragrant leaves, used to flavour rice and sweets. This page names the species only."),
    ("rooibos", "Rooibos", ["Aspalathus linearis"], "herb", "perennial", [],
     "Rooibos is a shrub from the Western Cape grown for its leaves, which are fermented and dried as a tisane. This page names the species only."),
    ("roselle", "Roselle", ["Hibiscus sabdariffa"], "herb", "annual", [],
     "Roselle is an annual hibiscus grown for its fleshy red calyces, used for drinks and jam. This page names the species; sowing dates belong in a regional guide."),
    ("yerba-mate", "Yerba mate", ["Ilex paraguariensis"], "herb", "perennial", ["mate"],
     "Yerba mate is an evergreen holly grown for its leaves, which are dried and brewed. This page names the species; climate limits belong in a regional guide."),
    ("oca", "Oca", ["Oxalis tuberosa"], "vegetable", "perennial", [],
     "Oca is an Andean oxalis grown for its colourful tubers. Short days help the tubers form. This page names the species only."),
    ("yacon", "Yacon", ["Smallanthus sonchifolius"], "vegetable", "perennial", [],
     "Yacon is a perennial daisy grown for its sweet, crisp tubers. This page names the species; climate limits belong in a regional guide."),
]


def sparql(query):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    last = None
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise SystemExit(f"Wikidata query failed: {last}")


def yml(value):
    return json.dumps(value, ensure_ascii=False)


def slugify(name):
    import unicodedata
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("'", "").replace("\u2019", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def frontmatter(text):
    parts = text.split("---", 2)
    return parts[1] if len(parts) >= 2 else ""


def field(head, key):
    m = re.search(rf'^{key}:\s*"?([^"\n]+)"?\s*$', head, re.M)
    return m.group(1).strip() if m else ""


def has_species(sci):
    parts = sci.replace("×", " × ").split()
    return any(re.fullmatch(r"[a-z][a-z-]{2,}", p) and p.lower() not in RANK for p in parts[1:])


def load_crops():
    crops = []
    cdir = os.path.join(ROOT, "content/crops")
    for f in sorted(os.listdir(cdir)):
        if not f.endswith(".md"):
            continue
        head = frontmatter(open(os.path.join(cdir, f), encoding="utf-8").read())
        sci = field(head, "scientific_name")
        wd = field(head, "wikidata")
        crops.append({
            "slug": f[:-3],
            "name": field(head, "name"),
            "sci": sci,
            "wd": wd if re.fullmatch(r"Q\d+", wd) else "",
            "species": has_species(sci),
        })
    return crops


def existing_varieties():
    by = {}
    base = os.path.join(ROOT, "content/varieties")
    if not os.path.exists(base):
        return by
    for crop in os.listdir(base):
        d = os.path.join(base, crop)
        if not os.path.isdir(d):
            continue
        for f in os.listdir(d):
            if not f.endswith(".md"):
                continue
            head = frontmatter(open(os.path.join(d, f), encoding="utf-8").read())
            kind = field(head, "kind")
            by.setdefault(crop, {"slugs": set(), "names": set(), "n": 0})
            by[crop]["slugs"].add(f[:-3])
            by[crop]["names"].add(field(head, "name").casefold())
            if kind != "group":
                by[crop]["n"] += 1
    return by


def region_slugs():
    d = os.path.join(ROOT, "content/regions")
    return {f[:-3] for f in os.listdir(d) if f.endswith(".md")}


def label_matches(label, name, binomial):
    lab = (label or "").casefold()
    if not lab or lab.startswith("q") and lab[1:].isdigit():
        return False
    epi = binomial.split()[-1].casefold().lstrip("×").strip()
    genus = binomial.split()[0].casefold().lstrip("×").strip()
    if epi and epi in lab:
        return True
    if genus and genus in lab:
        return True
    if binomial.casefold() in lab or name.casefold() in lab:
        return True
    return False


def good_cultivar_name(name):
    if not name or len(name) < 3 or len(name) > 50:
        return False
    if not re.search(r"[A-Za-z]", name):
        return False
    if name == name.casefold():
        return False
    if re.search(r"\bvariety\b", name, re.I):
        return False
    if re.search(r"\s[A-Za-z]$", name):
        return False
    return True


def taxon_score(crop, taxon):
    sci = re.sub(r"\s+", " ", crop["sci"]).strip().casefold()
    tax = re.sub(r"\s+", " ", taxon or "").strip().casefold()
    if sci and tax.startswith(sci):
        return len(sci)
    return 0


def cultivar_name(label, taxon, crop_name):
    for src in (taxon or "", label or ""):
        found = QUOTE.findall(src)
        if found:
            name = found[-1].strip()
            if 1 < len(name) <= 60:
                return name
    lab = (label or "").strip()
    low = lab.casefold()
    cn = crop_name.casefold()
    for suffix in (f" {cn}", f" {cn} cultivar"):
        if low.endswith(suffix) and len(lab) > len(suffix):
            lab = lab[: -len(suffix)].strip(" -–")
            low = lab.casefold()
    if low in {cn, "cultivar", "hybrid"} or len(lab) < 2 or len(lab) > 50:
        return None
    if re.fullmatch(r"Q\d+", lab):
        return None
    if re.fullmatch(r"[A-Z][A-Za-z-]+ [a-z×].*", lab) and not QUOTE.search(lab):
        return None
    return lab


def fetch_cultivars(parent_ids):
    rows = []
    ids = list(parent_ids)
    for i in range(0, len(ids), 25):
        batch = ids[i:i + 25]
        values = " ".join(f"wd:{q}" for q in batch)
        q = f"""
SELECT ?item ?parent ?taxon ?enlabel ?article WHERE {{
  VALUES ?parent {{ {values} }}
  {{
    ?item wdt:P105 wd:Q4886 ; wdt:P171 ?parent .
  }} UNION {{
    ?item wdt:P105 wd:Q4886 ; wdt:P171 ?mid .
    ?mid wdt:P171 ?parent .
  }}
  FILTER(?item != ?parent)
  ?item rdfs:label ?enlabel . FILTER(LANG(?enlabel) = "en")
  OPTIONAL {{ ?item wdt:P225 ?taxon . }}
  OPTIONAL {{ ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }}
}}
"""
        data = sparql(q)
        for b in data["results"]["bindings"]:
            rows.append({
                "item": b["item"]["value"].rsplit("/", 1)[-1],
                "parent": b["parent"]["value"].rsplit("/", 1)[-1],
                "taxon": b.get("taxon", {}).get("value", ""),
                "label": b["enlabel"]["value"],
                "article": b.get("article", {}).get("value", ""),
            })
        print(f"  cultivars {i + len(batch)}/{len(ids)} parents, rows so far {len(rows)}", flush=True)
        time.sleep(0.4)
    return rows


def wiki_title(article):
    if "/wiki/" not in article:
        return ""
    return urllib.parse.unquote(article.split("/wiki/", 1)[-1]).replace("_", " ")


def write_variety(crop, slug, name, item, taxon, article):
    path = os.path.join(ROOT, "content/varieties", crop["slug"], f"{slug}.md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = [
        "---",
        f"crop: {crop['slug']}",
        f"slug: {slug}",
        f"name: {yml(name)}",
    ]
    if taxon:
        lines += [f"scientific_name: {yml(taxon)}"]
    title = wiki_title(article)
    if title:
        lines += [f"wikipedia: {yml(title)}"]
    lines += [
        f"wikidata: {item}",
        "origin: imported",
        f"imported: {yml(TODAY)}",
        "sources: [wikidata]",
    ]
    if taxon:
        lines += ["field_sources:", "  scientific_name: [wikidata]"]
    lines += [
        "license: CC-BY-SA-4.0",
        "note: >-",
        "  Cultivar name from Wikidata (CC0). No growing instructions have been added.",
        "---",
        "",
        f"{name} is a named cultivar of {crop['name']}. "
        "The name is recorded on Wikidata. Growing instructions for this cultivar have not been added yet.",
        "",
    ]
    open(path, "w", encoding="utf-8").write("\n".join(lines))


def lookup_species(binomials):
    """Return {queried binomial: {item, p225, family, article}} for exact P225 hits."""
    found = {}
    flat = []
    for names in binomials:
        flat.extend(names)
    flat = list(dict.fromkeys(flat))
    for i in range(0, len(flat), 12):
        batch = flat[i:i + 12]
        values = " ".join(yml(n) for n in batch)
        q = f"""
SELECT ?sci ?item ?itemLabel ?familyLabel ?article ?rank WHERE {{
  VALUES ?sci {{ {values} }}
  ?item wdt:P225 ?sci .
  OPTIONAL {{ ?item rdfs:label ?itemLabel . FILTER(LANG(?itemLabel) = "en") }}
  OPTIONAL {{ ?item wdt:P105 ?rank . }}
  ?item wdt:P171* ?fam .
  ?fam wdt:P105 wd:Q35409 .
  ?fam rdfs:label ?familyLabel .
  FILTER(LANG(?familyLabel) = "en" || LANG(?familyLabel) = "mul")
  FILTER(REGEX(STR(?familyLabel), "^[A-Z][a-z]+aceae$"))
  OPTIONAL {{ ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }}
}}
"""
        data = sparql(q)
        for b in data["results"]["bindings"]:
            sci = b["sci"]["value"]
            fam = b["familyLabel"]["value"]
            if not re.fullmatch(r"[A-Z][a-z]+aceae", fam):
                continue
            rec = {
                "item": b["item"]["value"].rsplit("/", 1)[-1],
                "label": b.get("itemLabel", {}).get("value", ""),
                "family": fam,
                "article": b.get("article", {}).get("value", ""),
                "species": b.get("rank", {}).get("value", "").endswith("Q7432"),
            }
            prev = found.get(sci)
            if not prev or (rec["species"] and not prev["species"]) or (rec["article"] and not prev["article"] and rec["species"] == prev["species"]):
                found[sci] = rec
        time.sleep(0.4)
    return found


def write_crop(spec, hit, binomial):
    slug, name, _names, typ, life, aliases, sentence = spec
    if len(sentence) < 80:
        raise SystemExit(f"sentence for {slug} is shorter than 80 characters")
    lines = [
        "---",
        f"slug: {slug}",
        f"name: {yml(name)}",
        f"scientific_name: {yml(binomial)}",
        f"family: {hit['family']}",
        f"wikidata: {hit['item']}",
    ]
    title = wiki_title(hit["article"])
    if title:
        lines.append(f"wikipedia: {yml(title)}")
    if aliases:
        lines.append("aliases: [" + ", ".join(yml(a) for a in aliases) + "]")
    lines += [
        f"type: {typ}",
        f"lifecycle: {life}",
        "origin: curated",
        "sources: [wikidata]",
        "field_sources:",
        "  scientific_name: [wikidata]",
        "  family: [wikidata]",
        "license: CC-BY-SA-4.0",
        "authors: [OpenFarm contributors]",
        f"last_reviewed: {yml(TODAY)}",
        "---",
        "",
        sentence,
        "",
    ]
    path = os.path.join(ROOT, "content/crops", f"{slug}.md")
    open(path, "w", encoding="utf-8").write("\n".join(lines))


def main():
    write = "--write" in sys.argv
    crops = load_crops()
    by_slug = {c["slug"]: c for c in crops}
    scis = {re.sub(r"\s+", " ", c["sci"]).casefold() for c in crops if c["sci"]}
    regions = region_slugs()
    have = existing_varieties()

    # --- new crops ---
    print("Looking up new crop names on Wikidata…", flush=True)
    hits = lookup_species([c[2] for c in NEW_CROPS])
    new_n = 0
    for spec in NEW_CROPS:
        slug, name, names, *_rest = spec
        if slug in by_slug:
            print(f"  skip crop {slug}: already present")
            continue
        binomial = next((n for n in names if n in hits), None)
        if not binomial:
            print(f"  skip crop {slug}: no exact Wikidata taxon name among {names}")
            continue
        if binomial.casefold() in scis or any(s.startswith(binomial.casefold() + " ") for s in scis):
            print(f"  skip crop {slug}: {binomial} already in the catalogue")
            continue
        hit = hits[binomial]
        if hit.get("label") and not label_matches(hit.get("label", ""), name, binomial):
            print(f"  skip crop {slug}: Wikidata label {hit.get('label')!r} does not match {binomial}")
            continue
        print(f"  crop {slug}: {binomial} {hit['family']} {hit['item']} ({hit.get('label')})")
        crops.append({"slug": slug, "name": name, "sci": binomial, "wd": hit["item"], "species": True})
        scis.add(binomial.casefold())
        if write:
            write_crop(spec, hit, binomial)
        new_n += 1

    # --- cultivars ---
    by_slug = {c["slug"]: c for c in crops}
    eligible = [c for c in crops if c["wd"] and c["species"]]
    by_q = {}
    for c in eligible:
        by_q.setdefault(c["wd"], []).append(c)
    print(f"Looking up cultivars for {len(by_q)} species…", flush=True)
    rows = fetch_cultivars(by_q.keys())
    # One cultivar can match several crops (a species and a cultivar-named record of that species).
    # Keep the crop whose scientific name is the longest prefix of the cultivar's taxon name.
    chosen = {}
    for row in rows:
        quoted = bool(QUOTE.search(row["taxon"]) or QUOTE.search(row["label"]))
        if not quoted:
            continue
        options = []
        for crop in by_q.get(row["parent"], []):
            if row["item"] == crop["wd"]:
                continue
            score = taxon_score(crop, row["taxon"])
            if score <= 0:
                continue
            name = cultivar_name(row["label"], row["taxon"], crop["name"])
            if not good_cultivar_name(name):
                continue
            options.append((score, len(crop["name"].split()), crop["slug"], crop, name))
        if not options:
            continue
        options.sort(key=lambda o: (-o[0], o[1], o[2]))
        best = options[0]
        tied = [o for o in options[1:] if o[0] == best[0] and o[1] == best[1]]
        if tied:
            continue
        crop, name = best[3], best[4]
        slot = chosen.setdefault(crop["slug"], {})
        prev = slot.get(row["item"])
        better = prev is None or (row["article"] and not prev["article"]) or (row["taxon"] and not prev["taxon"])
        if better:
            slot[row["item"]] = {**row, "name": name, "quoted": quoted}
    grouped = chosen

    var_n = 0
    for slug, items in sorted(grouped.items()):
        crop = by_slug[slug]
        got = have.get(slug, {"slugs": set(), "names": set(), "n": 0})
        room = MAX_VARIETIES - got["n"]
        if room <= 0:
            continue
        ordered = sorted(items.values(), key=lambda r: (0 if r["article"] else 1, 0 if r["quoted"] else 1, r["name"].casefold()))
        added = 0
        for row in ordered:
            if added >= room:
                break
            if row["name"].casefold() in got["names"] or row["name"].casefold() == crop["name"].casefold():
                continue
            slug_v = slugify(row["name"])
            if not slug_v:
                continue
            if slug_v in regions:
                slug_v = f"{slug_v}-cultivar"
            n = 2
            base = slug_v
            while slug_v in got["slugs"] or slug_v in regions:
                slug_v = f"{base}-{n}"
                n += 1
                if n > 6:
                    slug_v = ""
                    break
            if not slug_v or not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug_v):
                continue
            print(f"  variety {slug}/{slug_v}: {row['name']} ({row['item']})")
            if write:
                write_variety(crop, slug_v, row["name"], row["item"], row["taxon"], row["article"])
            got["slugs"].add(slug_v)
            got["names"].add(row["name"].casefold())
            added += 1
            var_n += 1
    print(f"{'Wrote' if write else 'Would add'} {new_n} crops and {var_n} varieties.")


if __name__ == "__main__":
    main()
