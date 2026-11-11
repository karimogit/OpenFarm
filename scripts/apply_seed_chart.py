#!/usr/bin/env python3
"""Fill `seed_saving` on crops from published seed-saving charts (cited per field).

Data transcribed from:
  - Seed Matters "Seed Saving Chart" (key seed-matters-chart): pollination, garden-scale isolation distance,
    number of plants, seed life, annual/biennial, notes on crossing.
  - Oregon State University Extension "Seed Saving Chart" (osu-seed-saving-chart): when to harvest, processing.
  - University of Minnesota Extension "Saving vegetable seeds" (umn-saving-seeds): tomato, bean and pea processing.
Matching is by scientific name (species, or genus for "Capsicum spp" / "Cucurbita spp" rows).
Existing curated values are kept; only empty fields are filled. Run: python3 scripts/apply_seed_chart.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FT, MI = 0.3048, 1609.344
r = lambda m: round(m) if m < 100 else int(round(m, -1))

# name: (match, cycle, pollination, isolation_m [min,max], plants, seed_life_years, note)
SM = {
 "arugula": ("Eruca sativa", "annual", "insect", [r(.5*MI)]*2, 40, 5, "Outcrossing species; a good first insect-pollinated crop."),
 "bean": ("Phaseolus vulgaris", "annual", "self", [r(20*FT)]*2, 10, 4, None),
 "fava": ("Vicia faba", "annual", "self", [r(50*FT)]*2, 20, 4, "Mainly self-pollinating, but insects do cross-pollinate it."),
 "corn": ("Zea mays", "annual", "wind", [r(MI), r(2*MI)], 100, 6, "Seed matures 6–8 weeks after the eating stage."),
 "cucumber": ("Cucumis sativus", "annual", "insect", [r(.5*MI)]*2, 10, 8, "Separate male and female flowers."),
 "eggplant": ("Solanum melongena", "annual", "self", [r(50*FT)]*2, 10, 6, "Harvest seed from overripe fruit."),
 "lettuce": ("Lactuca sativa", "annual", "self", [r(20*FT)]*2, 10, 3, None),
 "melon": ("Cucumis melo", "annual", "insect", [r(.5*MI)]*2, 10, 7, "Does not cross with watermelon."),
 "mustard": ("Brassica juncea", "annual", "insect", [r(.5*MI)]*2, 40, 5, "Will cross with wild species."),
 "pea": ("Pisum sativum", "annual", "self", [r(20*FT)]*2, 25, 5, None),
 "pepper": ("Capsicum", "annual", "self", [r(100*FT)]*2, 10, 4, "Mainly self-pollinating, but insects do cross-pollinate; hot and sweet peppers can cross."),
 "radish": ("Raphanus sativus", "annual", "insect", [r(.5*MI)]*2, 50, 5, "Can cross with wild radish."),
 "spinach": ("Spinacia oleracea", "annual", "wind", [r(2*MI)]*2, 50, 4, "Separate male and female plants."),
 "squash": ("Cucurbita", "annual", "insect", [r(.5*MI)]*2, 10, 7, "Crosses only within the same species; separate male and female flowers."),
 "tomato": ("Solanum lycopersicum", "annual", "self", [r(10*FT)]*2, 10, 5, None),
 "watermelon": ("Citrullus lanatus", "annual", "insect", [r(.5*MI)]*2, 10, 6, "Does not cross with other melons."),
 "beet": ("Beta vulgaris", "biennial", "wind", [r(MI)]*2, 30, 6, "Beet and chard are the same species and cross with each other."),
 "oleracea": ("Brassica oleracea", "biennial", "insect", [r(.5*MI)]*2, 40, 5, "Crosses with all Brassica oleracea crops (cabbage, kale, broccoli, cauliflower, kohlrabi, collards…)."),
 "carrot": ("Daucus carota", "biennial", "insect", [r(MI)]*2, 60, 3, "Crosses with wild carrot (Queen Anne's lace)."),
 "celery": ("Apium graveolens", "biennial", "insect", [r(.5*MI)]*2, 30, 5, "Difficult to overwinter."),
 "leek": ("Allium ampeloprasum", "biennial", "insect", [r(MI)]*2, 20, 2, "Seed is held tightly in the seed head."),
 "onion": ("Allium cepa", "biennial", "insect", [r(MI)]*2, 50, 2, "Very short seed life."),
 "parsley": ("Petroselinum crispum", "biennial", "insect", [r(MI)]*2, 30, 5, "Seed heads shatter easily."),
 "parsnip": ("Pastinaca sativa", "biennial", "insect", [r(MI)]*2, 20, 1, "Extremely short seed life – sow fresh seed."),
 "turnip": ("Brassica rapa", "biennial", "insect", [r(.5*MI)]*2, 40, 5, "Brassica rapa crops (turnip, Chinese cabbage, bok choy, rapini…) cross with each other."),
}
# OSU chart (harvest + processing) and UMN (tomato, beans, peas)
OSU = {
 "Phaseolus vulgaris": ("Leave the pods on the plant until they are dry and the seeds rattle.", "dry-thresh", "Shell the seeds and spread them out to dry. UMN: dry pods indoors for at least two weeks before shelling.", ["osu-seed-saving-chart", "umn-saving-seeds"]),
 "Pisum sativum": ("Leave the pods on the plant until they are dry and the seeds rattle.", "dry-thresh", "Shell the seeds and spread them out to dry. UMN: dry pods indoors for at least two weeks before shelling.", ["osu-seed-saving-chart", "umn-saving-seeds"]),
 "Capsicum": ("Pick a fully mature fruit (if possible fully red).", "scrape-dry", "Scrape out the seeds and spread them out to dry; they are ready to store when they break rather than bend.", ["osu-seed-saving-chart"]),
 "Solanum lycopersicum": ("Pick fruit when fully ripe.", "wet-ferment", "Squeeze the seeds and gel into a jar with some water and let it ferment for 3–5 days, stirring; good seed sinks. Rinse and spread out to dry.", ["osu-seed-saving-chart", "umn-saving-seeds"]),
 "Solanum melongena": ("Leave the fruit on the plant until it is hard, dull and off-coloured.", "wet-wash", "Pull the flesh away from the seeds, wash and rinse, then spread out to dry. Good seeds sink in water.", ["osu-seed-saving-chart"]),
 "Cucumis sativus": ("Seed is ready when the fruit has turned golden or orange and is going soft.", "wet-wash", "Scrape the seeds into a bowl and rub off the slimy coating in a sieve under water (some ferment them like tomato), then dry.", ["osu-seed-saving-chart"]),
 "Cucurbita pepo": ("For summer squash, seed is ready when the fruit is hard and cannot be dented with a fingernail – this may be after frost.", "wet-wash", "Scrape the seeds into a bowl, wash and rinse, then spread out to dry.", ["osu-seed-saving-chart"]),
 "Citrullus lanatus": ("Harvest seeds from ripe fruit.", "wet-wash", "Rinse the seeds in a strainer with a drop of dish soap to remove sugar before drying.", ["osu-seed-saving-chart"]),
 "Lactuca sativa": ("Gather seed once the plant has bolted and about half of the flowers have turned to white fluff – wait too long and the seed blows away.", "dry-thresh", "Rub the seeds out of the seed heads and winnow off the chaff by shaking on a tray and gently blowing.", ["osu-seed-saving-chart"]),
}

def main():
    cdir = os.path.join(ROOT, "content/crops"); n = 0
    for f in sorted(os.listdir(cdir)):
        p = os.path.join(cdir, f); text = open(p).read()
        head, body = text.split("---", 2)[1:]
        m = re.search(r'^scientific_name: *"?([^"\n]+)"?', head, re.M)
        if not m or not re.search(r"^wikidata:", head, re.M): continue
        sci = m.group(1).strip()
        hit = next((v for v in SM.values() if sci == v[0] or sci.startswith(v[0] + " ") or (" " not in v[0] and sci.split()[0] == v[0])), None)
        osu = next((v for k, v in OSU.items() if sci == k or sci.startswith(k + " ") or (" " not in k and sci.split()[0] == k)), None)
        if not hit: continue
        if re.search(r"^seed_saving:", head, re.M):
            # curated: append only missing keys inside the existing block
            block = re.search(r"^seed_saving:\n((?:  .*\n?)+)", head, re.M)
            have = set(re.findall(r"^  ([a-z_]+):", block.group(1), re.M))
            add = []
            if "cycle" not in have: add.append(f"  cycle: {hit[1]}")
            if "min_plants" not in have: add.append(f"  min_plants: {hit[4]}")
            if hit[6] and "cross_note" not in have: add.append(f"  cross_note: {json.dumps(hit[6])}")
            if osu and "harvest" not in have: add += [f"  harvest: {json.dumps(osu[0])}", f"  processing: {osu[1]}", f"  processing_note: {json.dumps(osu[2])}"]
            srcs = re.search(r"^  sources:\n((?:    - .*\n?)+)", block.group(1), re.M)
            newsrc = [s for s in ["seed-matters-chart"] + (osu[3] if osu else []) if s not in (srcs.group(1) if srcs else "")]
            seg = block.group(1)
            if srcs: seg = seg.replace(srcs.group(0), srcs.group(0).rstrip("\n") + "\n" + "".join(f"    - {s}\n" for s in newsrc))
            seg = seg.rstrip("\n") + "\n" + "".join(a + "\n" for a in add)
            head = head.replace(block.group(1), seg)
        else:
            lines = ["seed_saving:", f"  pollination: {hit[2]}", f"  cycle: {hit[1]}", f"  isolation_m: [{hit[3][0]}, {hit[3][1]}]",
                     f"  min_plants: {hit[4]}", f"  viability_years: {hit[5]}"]
            if hit[6]: lines.append(f"  cross_note: {json.dumps(hit[6])}")
            if osu: lines += [f"  harvest: {json.dumps(osu[0])}", f"  processing: {osu[1]}", f"  processing_note: {json.dumps(osu[2])}"]
            lines.append("  sources:"); lines += [f"    - {s}" for s in ["seed-matters-chart"] + (osu[3] if osu else [])]
            head = head.rstrip("\n") + "\n" + "\n".join(lines) + "\n"
        open(p, "w").write("---" + head + "---" + body); n += 1
        print(f[:-3], sci)
    print(n, "crops updated")

if __name__ == "__main__":
    main()
