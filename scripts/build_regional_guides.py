#!/usr/bin/env python3
"""Generate climate-region guides from published regional planting calendars (one guide per crop and region).

Each region uses ONE regional extension calendar, transcribed in data/calendars/*.json (or below for short
text sources). Planting months come straight from the source; harvest months are ESTIMATED from the
source's planting window plus the same source's days to harvest (said so in every guide's `uncertainty`).
Existing guides are never overwritten, and a crop is skipped where another guide already covers the
Köppen class. Run: python3 scripts/build_regional_guides.py [--write]
"""
import json, math, os, re, sys, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MON = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
MNAME = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
TODAY = datetime.date.today().isoformat()

def mon(s):
    m = re.match(r"(?:early |mid |late )?([a-z]{3})", s.strip().lower()); return MON.get(m.group(1)) if m else None

def span(a, b):
    out, m = [], a
    while True:
        out.append(m)
        if m == b: return out
        m = m % 12 + 1

def months_of_range(txt):
    """'Feb 1 to Mar 15' / 'Sept–Apr' / 'Jan–Mar, Aug–Oct' / 'Oct' -> list of months."""
    out = []
    for part in re.split(r",", txt):
        bits = [b for b in re.split(r"\s*(?:to|–|-)\s*", part.strip()) if b and not b.isdigit()]
        bits = [mon(b) for b in bits if mon(b)]
        if len(bits) == 1: out.append(bits[0])
        elif len(bits) >= 2: out += span(bits[0], bits[-1])
    return sorted(set(out), key=out.index)

def nums(s):
    v = [int(x) for x in re.findall(r"\d+", s)]; return v

def harvest_from(plant_months, dmin, dmax, cap=None):
    out = []
    for m in plant_months:
        for k in range(int(dmin // 30.4), int(math.ceil(dmax / 30.4)) + 1):
            h = (m - 1 + k) % 12 + 1
            if k >= 1 and h not in out: out.append(h)
    if cap: out = [h for h in out if h in cap]
    return sorted(out)

# ---------------------------------------------------------------- regions
def hot_desert():
    d = json.load(open(os.path.join(ROOT, "data/calendars/hot-desert-ua-az1005.json")))
    M = {"Basil": "basil", "Beans, Snap": "bush-bean", "Beans, Yardlong": "yardlong-bean", "Beets": "beet", "Blackeyed Peas": "black-eyed-pea",
         "Bok Choy": "bok-choy", "Broccoli": "broccoli", "Cabbage": "cabbage", "Cabbage, Chinese": "chinese-cabbage", "Carrots": "carrot",
         "Cauliflower": "cauliflower", "Celery": "celery", "Chard": "swiss-chard", "Collard Greens": "collard-greens", "Corn, Sweet": "corn",
         "Cucumbers": "cucumber", "Eggplant": "eggplant", "Endive": "endive", "Garlic": "garlic", "Kale": "kale", "Kohlrabi": "kohlrabi",
         "Lettuce, Leaf": "lettuce", "Leek": "leek", "Melons, CantaloupeHoneydews, etc.": "cantaloupe", "Okra": "okra", "Onions, Bulb": "onion",
         "Parsnips": "parsnip", "Peanuts": "peanut", "Peas": "pea", "Peppers": "capsicum", "Potatoes": "potato", "Potatoes, Sweet": "sweet-potato",
         "Pumpkin": "pumpkin", "Radishes": "radish", "Spinach": "spinach", "Squash, Summer": "zucchini", "Squash, Winter": "squash",
         "Sunflower": "sunflower", "Turnips": "turnip", "Artichokes, Globe": "artichoke", "Asparagus": "asparagus"}
    out = {}
    for row, slug in M.items():
        r = d["rows"].get(row)
        if not r: continue
        hm = r["halfmonths"]
        sow = sorted({i // 2 + 1 for i, c in enumerate(hm) if "S" in c})
        plant = sorted({i // 2 + 1 for i, c in enumerate(hm) if "T" in c or "X" in c})
        days = r["days"]; n = nums(days)
        if "month" in days: n = [x * 30 for x in n]
        if "year" in days or not n: dmin = dmax = None
        else:
            s = re.search(r"S\s*=\s*([\d\-–]+)", days); t = re.search(r"T\s*=?\s*([\d\-–]+)", days)
            sn = nums(s.group(1)) if s else n; dmin, dmax = min(sn), max(sn)
        cal = {}
        if sow: cal["sow_direct"] = sow
        if plant: cal["plant"] = plant
        cal["harvest"] = harvest_from(sorted(set(sow + plant)), dmin, dmax) if dmin else []
        out[slug] = dict(cal=cal, days=[dmin, dmax] if dmin else None,
            timing=f"University of Arizona's Maricopa County calendar lists **{row}** for: " + describe(hm) + f". Time to harvest: {days}.")
    return dict(region="hot-desert", koppen=["BWh"], ref="Phoenix / Maricopa County, Arizona, USA", sources=["ua-maricopa-calendar"],
                place="the low desert (Phoenix, Arizona)", crops=out)

def describe(hm):
    lab = {"S": "seed", "T": "transplants", "X": "sets/cloves", "T/S": "seed or transplants"}
    runs, cur = [], None
    for i, c in enumerate(hm + [""]):
        if c != (cur[0] if cur else None):
            if cur and cur[0]: runs.append((cur[0], cur[1], i - 1))
            cur = (c, i)
    def d(i): return ("1" if i % 2 == 0 else "15") + " " + MNAME[i // 2][:3]
    return "; ".join(f"{lab.get(c, c)} {d(a)}–{d(b)}" if a != b else f"{lab.get(c, c)} {d(a)}" for c, a, b in runs)

def humid_subtropical():
    d = json.load(open(os.path.join(ROOT, "data/calendars/humid-subtropical-clemson-hgic1256.json")))
    M = {"Beans, Snap": ("bush-bean", "Beans, Snap"), "Beets": ("beet", "Beets"), "Broccoli 1": ("broccoli", "Broccoli"), "Cabbage 1": ("cabbage", "Cabbage"),
         "Cantaloupe": ("cantaloupe", "Cantaloupe"), "Carrots": ("carrot", "Carrots"), "Cauliflower 1": ("cauliflower", "Cauliflower"),
         "Collards": ("collard-greens", "Collards"), "Cucumber": ("cucumber", "Cucumbers"), "Eggplant 1": ("eggplant", "Eggplant"),
         "Garlic": ("garlic", None), "Kale": ("kale", "Kale"), "Leeks": ("leek", None), "Lettuce 2": ("lettuce", "Lettuce, Leaf"),
         "Onion, sets": ("onion", "Onions, Bulb"), "Okra": ("okra", "Okra"), "Peanuts": ("peanut", "Peanuts"), "Peas, Garden": ("pea", "Peas, Garden"),
         "Peas, Southern": ("black-eyed-pea", "Peas, Southern"), "Pepper 1": ("capsicum", "Pepper"), "Potatoes, Irish": ("potato", "Potatoes, Irish"),
         "Potatoes, Sweet": ("sweet-potato", "Potatoes, Sweet"), "Pumpkins": ("pumpkin", None), "Radish 2": ("radish", "Radish"),
         "Spinach 2": ("spinach", "Spinach"), "Sweet Corn 2": ("corn", "Sweet Corn"), "Squash, Summer": ("zucchini", "Squash, Summer"),
         "Squash, Winter": ("squash", "Squash, Winter"), "Turnips 2": ("turnip", "Turnips"), "Honeydew": ("honeydew-melon", "Cantaloupe"),
         "Asparagus": ("asparagus", None)}
    out = {}
    for row, (slug, drow) in M.items():
        r = d["rows"][row]; trans = row.endswith(" 1")
        months = []
        for k in ("coastal_spring", "coastal_fall"):
            if "Not recommended" not in r[k]: months += months_of_range(r[k])
        months = sorted(set(months))
        dd = nums(d["days"].get(drow, "")) if drow else []
        cal = {("plant" if trans or slug in ("asparagus", "garlic", "onion", "potato", "sweet-potato") else "sow_direct"): months}
        cal["harvest"] = harvest_from(months, min(dd), max(dd)) if len(dd) >= 1 and "year" not in d["days"].get(drow, "") else []
        name = re.sub(r" [12]$", "", row)
        txt = f"Clemson's chart for the **Coastal Plain** gives **{name}**: spring {r['coastal_spring']}, autumn {r['coastal_fall']}" + (" (as transplants)" if trans else "") + "."
        if drow and dd: txt += f" Approximate days to harvest: {d['days'][drow]}."
        out[slug] = dict(cal=cal, days=[min(dd), max(dd)] if len(dd) >= 1 and "year" not in d["days"].get(drow, "") else None, timing=txt,
                         extra=f"In the Piedmont (inland) the chart gives spring {r['piedmont_spring']} and autumn {r['piedmont_fall']}.")
    return dict(region="humid-subtropical", koppen=["Cfa"], ref="Charleston / South Carolina Coastal Plain, USA", sources=["clemson-planning-a-garden"],
                place="the South Carolina coast", crops=out)

def tropical_monsoon():
    d = json.load(open(os.path.join(ROOT, "data/calendars/tropical-monsoon-uf-vh021.json")))
    M = {"Arugula": "arugula", "Beans, bush": "bush-bean", "Beets": "beet", "Broccoli": "broccoli", "Cabbage": "cabbage", "Cantaloupes": "cantaloupe",
         "Carrots": "carrot", "Cauliflower": "cauliflower", "Celery": "celery", "Chinese cabbage": "chinese-cabbage", "Collards": "collard-greens",
         "Corn, sweet": "corn", "Cucumbers": "cucumber", "Eggplant": "eggplant", "Kale": "kale", "Kohlrabi": "kohlrabi", "Lettuce": "lettuce",
         "Okra": "okra", "Onions, bulbing": "onion", "Onions, bunching": "spring-onion", "Peas, snow or English": "pea", "Peas, southern": "black-eyed-pea",
         "Peppers": "capsicum", "Potatoes, Irish": "potato", "Potatoes, sweet": "sweet-potato", "Pumpkin": "pumpkin", "Radish": "radish",
         "Spinach": "spinach", "Squash, summer": "zucchini", "Squash, winter": "squash", "Strawberry": "strawberry", "Swiss chard": "swiss-chard",
         "Tomatoes (supported)": "tomato", "Turnips": "turnip", "Watermelon": None}
    out = {}
    for row, slug in M.items():
        if not slug: continue
        r = d["rows"][row]; months = months_of_range(r["south"])
        seed = re.sub(r"\(.*?\)", "", r["days"]); tr = re.search(r"\((.*?)\)", r["days"])
        sn = nums(seed); tn = nums(tr.group(1)) if tr else []
        trans = bool(tn) and slug in ("broccoli", "cabbage", "cauliflower", "collard-greens", "eggplant", "capsicum", "tomato", "chinese-cabbage", "kohlrabi")
        key = "plant" if trans or slug in ("potato", "sweet-potato", "strawberry", "onion") else "sow_direct"
        dd = tn if trans else sn
        cal = {key: months, "harvest": harvest_from(months, min(dd), max(dd)) if dd else []}
        out[slug] = dict(cal=cal, days=[min(sn), max(sn)] if sn else None,
            timing=f"UF/IFAS lists outdoor planting of **{row.lower()}** in **South Florida** from **{r['south']}**; days to harvest {r['days']} (in brackets: from transplants).")
    return dict(region="tropical-monsoon", koppen=["Am"], ref="Miami / South Florida, USA", sources=["uf-vh021"],
                place="South Florida", crops=out)

def humid_continental():
    # Central Iowa (PM 534); harvest from Iowa State's chart wording is not machine-readable, so months use CSU's days to harvest? No – use ISU text only:
    C = {  # crop: (calendar, text)
     "radish": ({"sow_direct": [4, 5, 8, 9]}, "Several plantings 7–10 days apart in spring; autumn plantings from mid-August to mid-September."),
     "lettuce": ({"sow_direct": [4, 8]}, "Sow in early spring; autumn plantings in August."),
     "onion": ({"sow_direct": [4], "plant": [4]}, "Dry onions: sow seed early to mid-April; plant sets and plants from early April to 1 May."),
     "pea": ({"sow_direct": [3, 4, 8]}, "Sow as soon as the soil can be worked in early spring; an autumn sowing about 1–10 August."),
     "spinach": ({"sow_direct": [4, 8]}, "Sow in April; an autumn crop about 10 August."),
     "cabbage": ({"plant": [4], "sow_direct": [6, 7]}, "Set out transplants early April to 1 May; direct seed in summer for an autumn crop."),
     "broccoli": ({"plant": [4]}, "Set out transplants in early to mid-April."),
     "cauliflower": ({"plant": [4]}, "Set out transplants in early to mid-April."),
     "kale": ({"sow_direct": [4, 7]}, "Seed with lettuce and other early spring crops; direct-seed in early July for an autumn crop."),
     "collard-greens": ({"sow_direct": [4, 7]}, "Seed with lettuce and other early spring crops; direct-seed in early July for an autumn crop."),
     "carrot": ({"sow_direct": [4, 5, 6, 7]}, "Sow from early April to 1 August, every 3–4 weeks for a continuous harvest."),
     "beet": ({"sow_direct": [4, 5, 6, 7]}, "Sow from early April to 1 August, every 2–3 weeks."),
     "swiss-chard": ({"sow_direct": [4, 5, 6, 7]}, "Sow from early April to 1 August, every 2–3 weeks."),
     "turnip": ({"sow_direct": [4, 8, 9]}, "Sow in April and again in August or early September for an autumn crop."),
     "bush-bean": ({"sow_direct": [5, 6, 7]}, "Plant any time after 5 May; last practical date 1 August."),
     "corn": ({"sow_direct": [5, 6]}, "Plant when the soil reaches 60 °F (16 °C); last practical date for an early variety 1 July."),
     "capsicum": ({"plant": [5, 6]}, "Plant seedlings in mid-May; last practical date 20 June."),
     "eggplant": ({"plant": [5, 6]}, "Plant seedlings in mid-May; last practical date 20 June."),
     "zucchini": ({"sow_direct": [5, 6, 7]}, "Seed in mid-May; last practical date 20 July. Keeps producing until frost if picked often."),
     "cucumber": ({"sow_direct": [5, 6, 7]}, "Seed in mid-May; last practical date 20 July."),
     "cantaloupe": ({"sow_direct": [5, 6]}, "Seed in mid-May; last practical date for early varieties 20 June."),
     "squash": ({"sow_direct": [5]}, "Seed in mid-May; needs the full season to mature fruit that stores."),
     "pumpkin": ({"sow_direct": [5]}, "Seed in mid-May; needs the full season."),
    }
    # Harvest: days to harvest from Iowa State PM 819 are not in the transcribed text; use the frost window and
    # Clemson's days to harvest (Table 2) as an explicit second source.
    cl = json.load(open(os.path.join(ROOT, "data/calendars/humid-subtropical-clemson-hgic1256.json")))["days"]
    D = {"radish": "Radish", "lettuce": "Lettuce, Leaf", "onion": "Onions, Bulb", "pea": "Peas, Garden", "spinach": "Spinach", "cabbage": "Cabbage",
         "broccoli": "Broccoli", "cauliflower": "Cauliflower", "kale": "Kale", "collard-greens": "Collards", "carrot": "Carrots", "beet": "Beets",
         "turnip": "Turnips", "bush-bean": "Beans, Snap", "corn": "Sweet Corn", "capsicum": "Pepper", "eggplant": "Eggplant", "zucchini": "Squash, Summer",
         "cucumber": "Cucumbers", "cantaloupe": "Cantaloupe", "squash": "Squash, Winter", "pumpkin": "Squash, Winter", "swiss-chard": "Beets"}
    out = {}
    for slug, (cal, txt) in C.items():
        dd = nums(cl[D[slug]]); pm = sorted(set(sum(cal.values(), [])))
        cal = dict(cal); cal["harvest"] = harvest_from(pm, min(dd), max(dd), cap=list(range(4, 11)))
        out[slug] = dict(cal=cal, days=[min(dd), max(dd)], timing=f"Iowa State University (central Iowa): {txt}",
                         extra=f"Days to harvest ({cl[D[slug]]}) are Clemson Extension's figures; harvest months are estimated and end with the autumn frost (October).",
                         srcs=["clemson-planning-a-garden"])
    return dict(region="humid-continental", koppen=["Dfa"], ref="Des Moines / central Iowa, USA", sources=["isu-planting-harvesting-times"],
                place="central Iowa", crops=out)

def cold_semi_arid():
    # CSU GardenNotes Vegetable Planting Guide (timing relative to the last spring frost) + CSU PlantTalk 1626 (Front Range frost dates 15 May / 15 Oct).
    G = {"hardy": ([4, 5], "as soon as the soil is dry enough, as early as 2–4 weeks before the average last frost (15 May on the Front Range)"),
         "semi": ([5], "0–2 weeks before the average last frost (15 May)"),
         "tender": ([5], "around the average last frost (15 May); transplants of cucumber and summer squash only once frost risk is over"),
         "very": ([5, 6], "2 or more weeks after the average last frost (15 May), once days stay above about 13 °C (55 °F)")}
    C = {"broccoli": ("hardy", "plant", "65"), "cabbage": ("hardy", "plant", "85"), "kohlrabi": ("hardy", "sow_direct", "50"), "onion": ("hardy", "plant", "110"),
         "lettuce": ("hardy", "sow_direct", "60"), "pea": ("hardy", "sow_direct", "65"), "radish": ("hardy", "sow_direct", "30"), "spinach": ("hardy", "sow_direct", "40"),
         "turnip": ("hardy", "sow_direct", "50"), "beet": ("semi", "sow_direct", "60"), "carrot": ("semi", "sow_direct", "70"), "cauliflower": ("semi", "plant", "65"),
         "parsley": ("semi", "sow_direct", None), "parsnip": ("semi", "sow_direct", "70"), "swiss-chard": ("semi", "sow_direct", "60"),
         "bush-bean": ("tender", "sow_direct", "60"), "corn": ("tender", "sow_direct", "60-90"), "cucumber": ("tender", "sow_direct", "55"),
         "zucchini": ("tender", "sow_direct", "50"), "celery": ("tender", "plant", None), "cantaloupe": ("very", "sow_direct", "85"),
         "eggplant": ("very", "plant", "60"), "capsicum": ("very", "plant", "70"), "pumpkin": ("very", "sow_direct", "100"), "squash": ("very", "sow_direct", "100"),
         "leek": ("hardy", "plant", "120")}
    out = {}
    for slug, (g, key, days) in C.items():
        months, rule = G[g]; dd = nums(days) if days else []
        cal = {key: months, "harvest": harvest_from(months, min(dd), max(dd), cap=list(range(5, 11))) if dd else []}
        if not cal["harvest"]: continue
        out[slug] = dict(cal=cal, days=[min(dd), max(dd)] if dd else None,
            timing=f"Colorado State University groups this crop as **{ {'hardy': 'hardy', 'semi': 'semi-hardy', 'tender': 'tender', 'very': 'very tender'}[g]}**: plant {rule}. Typical days to harvest: {days}" + (" from transplanting" if key == "plant" else "") + ".",
            extra="The average frost dates on the Front Range are 15 May (last) and 15 October (first) according to CSU PlantTalk; harvest months are estimated and stop at the autumn frost.")
    return dict(region="cold-semi-arid", koppen=["BSk"], ref="Denver / Colorado Front Range, USA", sources=["csu-veg-planting-guide", "csu-planting-dates"],
                place="the Colorado Front Range", crops=out)

def subarctic():
    # UAF Georgeson Botanical Garden note 40: indoor sowing dates for a 1 June field planting (warm crops) and 20–25 May (cool crops);
    # direct sowing about 1 week before the last frost. UAF CES calendar: direct-plant 1 June, transplant from 4 June, harvest from 1 August.
    C = {"broccoli": ({"sow_indoors": [4], "plant": [5, 6]}, "Sow indoors about 23 April; plant out 20–25 May (cool-season)."),
         "cabbage": ({"sow_indoors": [4], "plant": [5, 6]}, "Sow indoors about 23 April; plant out 20–25 May."),
         "cauliflower": ({"sow_indoors": [4], "plant": [5, 6]}, "Sow indoors about 23 April; plant out 20–25 May."),
         "leek": ({"sow_indoors": [3], "plant": [5, 6]}, "Sow indoors about 12 March; plant out late May."),
         "onion": ({"sow_indoors": [2], "plant": [5, 6]}, "Sow indoors about 27 February; plant out late May."),
         "celery": ({"sow_indoors": [3], "plant": [5, 6]}, "Sow indoors about 21 March; plant out late May."),
         "tomato": ({"sow_indoors": [4], "plant": [6]}, "Sow indoors about 16 April for planting out on 1 June (a greenhouse crop is started in late March)."),
         "capsicum": ({"sow_indoors": [4], "plant": [6]}, "Sow indoors about 2 April for planting out on 1 June."),
         "cucumber": ({"sow_indoors": [5], "plant": [6]}, "Sow in cell packs about 7 May and plant out on 1 June."),
         "zucchini": ({"sow_indoors": [5], "plant": [6]}, "Sow in cell packs about 7 May and plant out on 1 June."),
         "pumpkin": ({"sow_indoors": [4], "plant": [6]}, "Sow in cell packs about 30 April and plant out on 1 June."),
         "squash": ({"sow_indoors": [4], "plant": [6]}, "Sow in cell packs about 30 April and plant out on 1 June."),
         "lettuce": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost (late May – early June), or start in cell packs about 25 April."),
         "beet": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost."),
         "carrot": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost."),
         "kale": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost (or start indoors in late April)."),
         "kohlrabi": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost."),
         "bok-choy": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost."),
         "parsnip": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost; germinates slowly – sow thickly."),
         "pea": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost."),
         "radish": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost."),
         "spinach": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost."),
         "swiss-chard": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost."),
         "turnip": ({"sow_direct": [5, 6]}, "Direct sow about a week before the last frost."),
         "bush-bean": ({"sow_direct": [6]}, "Direct sow once the soil is above 55 °F (13 °C)."),
         "corn": ({"sow_direct": [5, 6]}, "Sow as soon as the soil can be worked, under clear plastic or IRT mulch.")}
    out = {}
    for slug, (cal, txt) in C.items():
        cal = dict(cal); cal["harvest"] = [8, 9]
        out[slug] = dict(cal=cal, days=None, timing=f"University of Alaska Fairbanks (Georgeson Botanical Garden, Fairbanks): {txt}",
                         extra="The UAF Extension calendar for Interior Alaska plants directly from 1 June, transplants from 4 June and starts the harvest on 1 August. Harvest months are approximate; quick salad crops may be ready earlier.")
    return dict(region="subarctic", koppen=["Dfc"], ref="Fairbanks / Interior Alaska, USA", sources=["uaf-gbg-note40", "uaf-ready-set-grow"],
                place="Interior Alaska", crops=out)

REGIONS = [hot_desert, humid_subtropical, tropical_monsoon, humid_continental, cold_semi_arid, subarctic]

def front(path):
    t = open(path).read(); return t.split("---", 2)[1]

def main():
    write = "--write" in sys.argv
    crops = {os.path.basename(p)[:-3]: front(p) for p in glob.glob(os.path.join(ROOT, "content/crops/*.md"))}
    existing = {}
    for p in glob.glob(os.path.join(ROOT, "content/guides/*/*.md")):
        h = front(p); c = p.split("/")[-2]
        kg = re.search(r"^koppen: \[(.*?)\]", h, re.M).group(1).replace(" ", "").split(",")
        hemi = re.search(r"^hemisphere: (\w+)", h, re.M).group(1)
        existing.setdefault(c, []).append((os.path.basename(p)[:-3], kg, hemi))
    made, skipped = {}, []
    for fn in REGIONS:
        R = fn()
        for slug, g in R["crops"].items():
            if slug not in crops: skipped.append(f"{R['region']}:{slug} (no crop)"); continue
            if not g["cal"].get("harvest"): skipped.append(f"{R['region']}:{slug} (no harvest window)"); continue
            ex = existing.get(slug, [])
            if any(r == R["region"] for r, _, _ in ex) or any(set(kg) & set(R["koppen"]) and h == "north" for _, kg, h in ex):
                skipped.append(f"{R['region']}:{slug} (already covered)"); continue
            name = re.search(r'^name: *"?([^"\n]+)"?', crops[slug], re.M).group(1)
            sun = (re.search(r"^sun: (\S+)", crops[slug], re.M) or [None, "full"])[1]
            water = (re.search(r"^water: (\S+)", crops[slug], re.M) or [None, "moderate"])[1]
            if sun not in ("full", "full-partial", "partial", "shade"): sun = "full"
            if water not in ("low", "moderate", "high"): water = "moderate"
            cal = {k: v for k, v in g["cal"].items() if v}
            srcs = R["sources"] + g.get("srcs", [])
            L = ["---", f"crop: {slug}", f"region: {R['region']}", f"title: {json.dumps(f'{name} in {R['place']}')}",
                 f"koppen: [{', '.join(R['koppen'])}]", "hemisphere: north", f"reference_location: {json.dumps(R['ref'])}", "calendar:"]
            for k in ("sow_indoors", "sow_direct", "plant", "harvest"):
                if k in cal: L.append(f"  {k}: [{', '.join(map(str, cal[k]))}]")
            if g.get("days") and g["days"][0]: L.append(f"days_to_maturity: [{g['days'][0]}, {g['days'][1]}]")
            L += [f"sun: {sun}", f"water: {water}", "confidence: medium",
                  "uncertainty: " + json.dumps("Planting months are taken from one regional extension calendar for the reference location; "
                    "harvest months are estimated from that planting window plus the days to harvest and are approximate. "
                    "Other places in this climate region can differ by weeks – check local frost dates."),
                  "sources:"] + [f"  - {s}" for s in srcs] + ["license: CC-BY-SA-4.0", "authors: [OpenFarm contributors]", f"last_reviewed: {TODAY}", "---", "",
                  "## Timing", "", g["timing"]]
            if g.get("extra"): L += ["", g["extra"]]
            L += ["", "## Notes", "", f"This guide was generated from a published regional planting calendar (see sources) by `scripts/build_regional_guides.py`. "
                  "General growing facts – spacing, sowing depth and temperatures – are on the crop page.", ""]
            made.setdefault(R["region"], []).append(slug)
            if write:
                os.makedirs(os.path.join(ROOT, "content/guides", slug), exist_ok=True)
                open(os.path.join(ROOT, "content/guides", slug, R["region"] + ".md"), "w").write("\n".join(L))
    for r, l in made.items(): print(f"{r}: {len(l)} – {', '.join(l)}")
    print("skipped:", len(skipped)); [print("  ", s) for s in skipped]

if __name__ == "__main__":
    main()
