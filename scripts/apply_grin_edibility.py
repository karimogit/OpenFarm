#!/usr/bin/env python3
"""Match OpenFarm crop scientific names to USDA-ARS GRIN Taxonomy economic uses
and write data/grin-edibility.json plus optional frontmatter updates.

GRIN information is in the public domain (GRIN-Global FAQ). Cite USDA-ARS NPGS /
GRIN Taxonomy. The bulk dump (taxonomy_data.cab) is not committed.

Matching rules (never invent a name or a plant part):
  - Exact match on the GRIN `name` field after typographic normalisation
    (×/x spacing, subsp. abbreviations). A hybrid sign is not inserted.
  - Uses are taken from the matched taxon, its accepted current_id, and other
    records that synonymise to that same current_id.
  - For a species-rank crop, also include uses of immediate infraspecific taxa
    of that species (so Solanum lycopersicum picks up FOOD fruit on var.
    lycopersicum). Different species or hybrids are not included.
  - edible=true only for FOOD, or for ADDITIVE uses that are themselves food
    uses (flavoring, sweetener, coloring, dietary fiber, thickening/gelling/
    emulsifier/stabilizer). Not FORAGE, MEDICINE, SOCIAL, or other codes.
  - edible_parts only when usage_type or plant_part_code names a part we can
    map to the schema enum. "vegetable" or a missing part does not invent one.
  - toxic=true when a POISON use exists; toxic_parts only when GRIN names the
    part. "mammals" / "fish" without a part does not invent leaves or foliage.
"""
from __future__ import annotations

import argparse, json, re, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CROPS = ROOT / "content/crops"
OUT = ROOT / "data/grin-edibility.json"
DEFAULT_TXT = Path("/tmp/grin/txt")

FOOD_TYPE_TO_PART = {
    "fruit": "fruit",
    "fruits": "fruit",
    "seeds": "seed",
    "nut": "nut",
    "pulse": "seed",
    "cereal": "seed",
    "pseudocereal": "seed",
    "oil/fat": "oil",
    # vegetable, beverage base, starch, gum/mucilage, sugar, flavoring: no part
}
PART_CODE_TO_PARTS = {
    "FRUITS": ["fruit"],
    "SEEDS": ["seed"],
    "LEAVES": ["leaf"],
    "STEM": ["stem"],
    "ROOTS": ["root"],
    "STEM/LVS": ["stem", "leaf"],
    "FLOWERS": ["flower"],
    "FLOWER/LVS": ["flower", "leaf"],
    "FRUIT/SEED": ["fruit", "seed"],
    "STEM/ROOT": ["stem", "root"],
    "FLOWER/FRUIT": ["flower", "fruit"],
    "FRUIT/LVS": ["fruit", "leaf"],
    "BARK": ["bark"],
    # ALL PLANT, VARIOUS: no invented enum
}
ADDITIVE_FOOD = {
    "flavoring", "sweetener", "coloring", "dietary fiber",
    "thickening agent", "gelling agent", "emulsifier", "stabilizer",
}
RANK_RE = re.compile(
    r"\s+(?:var\.|subsp\.|ssp\.|f\.|subvar\.|prol\.|race)\s+",
    re.I,
)


def norm_name(s: str) -> str:
    if not s:
        return ""
    s = s.replace("\u00d7", "x").replace("×", "x")
    s = s.replace("&times;", "x")
    s = re.sub(r"\s+", " ", s).strip()
    # "Citrus ×sinensis" / "Citrus xsinensis" → "citrus x sinensis"
    s = re.sub(r"\s*x\s*", " x ", s, flags=re.I)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\bssp\.\s*", "subsp. ", s, flags=re.I)
    return s.casefold().strip()


def is_species_rank(name: str) -> bool:
    n = norm_name(name)
    # genus + epithet, optional hybrid "x epithet", no var/subsp
    if RANK_RE.search(" " + n + " "):
        return False
    parts = n.split()
    if len(parts) == 2:
        return True
    if len(parts) == 3 and parts[1] == "x":
        return True
    return False


def species_prefix(name: str) -> str:
    return norm_name(name)


def is_infra_of(child: str, species: str) -> bool:
    c, s = norm_name(child), norm_name(species)
    if not c.startswith(s + " "):
        return False
    rest = c[len(s) + 1:]
    return bool(re.match(r"(var\.|subsp\.|ssp\.|f\.|subvar\.|prol\.|race)\b", rest))


def read_tsv(path: Path):
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    hdr = [h.strip() for h in lines[0].split("\t")]
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) < len(hdr):
            parts += [""] * (len(hdr) - len(parts))
        yield dict(zip(hdr, parts))


def load_frontmatter_sci(path: Path):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return None, None, text
    _, fm, body = text.split("---", 2)
    def field(k):
        m = re.search(rf"^{k}:\s*(.+)$", fm, re.M)
        if not m:
            return None
        return m.group(1).strip().strip('"').strip("'")
    return field("slug") or path.stem, field("scientific_name"), text


def nil(v):
    return v in (None, "", r"\N", "\\N")


def parts_from_use(u):
    found = []
    code = (u.get("plant_part_code") or "").strip()
    if not nil(code) and code in PART_CODE_TO_PARTS:
        found.extend(PART_CODE_TO_PARTS[code])
    ut = (u.get("usage_type") or "").strip()
    if u.get("economic_usage_code") == "FOOD" and ut in FOOD_TYPE_TO_PART:
        found.append(FOOD_TYPE_TO_PART[ut])
    # unique, stable order
    out, seen = [], set()
    for p in found:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def load_grin(txt_dir: Path):
    species = list(read_tsv(txt_dir / "taxonomy_species.txt"))
    uses = list(read_tsv(txt_dir / "taxonomy_use.txt"))
    by_id = {s["taxonomy_species_id"]: s for s in species}
    by_name = defaultdict(list)
    for s in species:
        by_name[norm_name(s["name"])].append(s)
    uses_by_id = defaultdict(list)
    for u in uses:
        uses_by_id[u["taxonomy_species_id"]].append(u)
    synonyms_of = defaultdict(list)
    for s in species:
        cur = s["current_taxonomy_species_id"] or s["taxonomy_species_id"]
        synonyms_of[cur].append(s["taxonomy_species_id"])
        synonyms_of[s["taxonomy_species_id"]].append(s["taxonomy_species_id"])
    # children by species-rank prefix
    infra = defaultdict(list)
    for s in species:
        n = s["name"]
        if not is_species_rank(n):
            # attach to its species-rank prefix
            m = re.match(r"^((?:[A-Z][a-z]+(?:\s+x)?\s+[a-z-]+))", n)
            # better: if has rank, species is text before rank
            m2 = RANK_RE.search(n)
            if m2:
                sp = n[: m2.start()].strip()
                infra[norm_name(sp)].append(s)
    return by_id, by_name, uses_by_id, infra, synonyms_of


def pick_taxon(cands):
    if not cands:
        return None
    accepted = [s for s in cands if s["taxonomy_species_id"] == s["current_taxonomy_species_id"]]
    return accepted[0] if accepted else cands[0]


def synonym_ids(taxon, synonyms_of):
    """The matched record, its accepted id, and other synonyms of that accepted id only."""
    current = taxon["current_taxonomy_species_id"] or taxon["taxonomy_species_id"]
    ids = set(synonyms_of.get(current, []))
    ids.add(taxon["taxonomy_species_id"])
    ids.add(current)
    ids.discard("")
    ids.discard(r"\N")
    return ids


def collect_ids(taxon, include_infra, infra, synonyms_of):
    core = synonym_ids(taxon, synonyms_of)
    infra_ids = set()
    if include_infra:
        keys = {norm_name(taxon["name"])}
        for child in infra.get(norm_name(taxon["name"]), []):
            # Own record only. Do not follow a var. that GRIN treats as a *different* species.
            infra_ids.add(child["taxonomy_species_id"])
    return core, infra_ids


def rec_of(u, sid, by_id):
    return {
        "taxonomy_species_id": sid,
        "name": by_id.get(sid, {}).get("name"),
        "economic_usage_code": u.get("economic_usage_code"),
        "usage_type": u.get("usage_type") if not nil(u.get("usage_type")) else None,
        "plant_part_code": u.get("plant_part_code") if not nil(u.get("plant_part_code")) else None,
    }


def bucket_uses(id_list, uses_by_id, by_id):
    food, additive, poison, raw = [], [], [], []
    parts, tox = [], []
    seen_p, seen_t = set(), set()
    for sid in id_list:
        for u in uses_by_id.get(sid, []):
            code = u.get("economic_usage_code")
            if code not in ("FOOD", "ADDITIVE", "POISON"):
                continue
            rec = rec_of(u, sid, by_id)
            raw.append(rec)
            if code == "FOOD":
                food.append(rec)
                for p in parts_from_use(u):
                    if p not in seen_p:
                        seen_p.add(p); parts.append(p)
            elif code == "ADDITIVE" and (u.get("usage_type") or "") in ADDITIVE_FOOD:
                additive.append(rec)
            elif code == "POISON":
                poison.append(rec)
                code_part = u.get("plant_part_code")
                if not nil(code_part) and code_part in PART_CODE_TO_PARTS:
                    for p in PART_CODE_TO_PARTS[code_part]:
                        if p not in seen_t:
                            seen_t.add(p); tox.append(p)
    return food, additive, poison, parts, tox, raw


def summarise(core_ids, infra_ids, uses_by_id, by_id):
    """Parts come from the matched taxon (and its synonyms). Infraspecific parts
    are used only when the species record itself has no FOOD/ADDITIVE part and
    the infraspecific named parts are unanimous — otherwise a polymorphic
    species (e.g. Brassica oleracea) would inherit every cultivar group's parts.
    When species-level and infraspecific uses disagree about parts, omit parts.
    """
    c_food, c_add, c_poi, c_parts, c_tox, c_raw = bucket_uses(core_ids, uses_by_id, by_id)
    i_food, i_add, i_poi, i_parts, i_tox, i_raw = bucket_uses(infra_ids, uses_by_id, by_id)
    food, additive, poison = c_food + i_food, c_add + i_add, c_poi + i_poi
    raw = c_raw + i_raw
    edible = bool(food or additive)
    toxic = bool(poison)

    def parts_by_taxon(food_recs, add_recs, id_list, uses_by_id):
        """Named edible parts per taxon id, only from FOOD (and oil/fat etc.) uses."""
        groups = {}
        for sid in id_list:
            named = []
            seen = set()
            for u in uses_by_id.get(sid, []):
                if u.get("economic_usage_code") != "FOOD":
                    continue
                for p in parts_from_use(u):
                    if p not in seen:
                        seen.add(p); named.append(p)
            if named:
                groups[sid] = named
        return groups

    # Intersection of named parts across taxa that name any part. A polymorphic
    # species (Brassica oleracea, lettuce vs oilseed) then yields no part rather
    # than a union of every cultivar group. A consistent part (tomato fruit,
    # cucumber fruit) is kept; an extra part on only some taxa (cucumber oil)
    # is dropped.
    groups = {}
    groups.update(parts_by_taxon(c_food, c_add, core_ids, uses_by_id))
    groups.update(parts_by_taxon(i_food, i_add, infra_ids, uses_by_id))
    if groups:
        inter = None
        for named in groups.values():
            s = set(named)
            inter = s if inter is None else (inter & s)
        edible_parts = [p for p in next(iter(groups.values())) if p in inter] if inter else None
    else:
        edible_parts = None
    # toxic parts: only from the matched taxon + synonyms, never from a different species reached via infra
    toxic_parts = c_tox or None
    return {
        "edible": True if edible else None,
        "edible_parts": edible_parts or None,
        "toxic": True if toxic else None,
        "toxic_parts": toxic_parts or None,
        "food_records": len(food),
        "additive_records": len(additive),
        "poison_records": len(poison),
        "uses": raw,
    }


def insert_frontmatter(text, fields, source_key="usda-grin"):
    """Insert edibility keys. On imported rescue records, do not add a
    field_sources block (the validator then requires every wiki field to be
    attributed). Cite usda-grin on the top-level sources list instead.
    """
    if not text.startswith("---"):
        raise ValueError("no frontmatter")
    _, fm, body = text.split("---", 2)
    if re.search(r"^edible:", fm, re.M) or re.search(r"^toxic:", fm, re.M):
        return text, False

    lines_to_add = []
    if fields.get("edible") is True:
        lines_to_add.append("edible: true")
    if fields.get("edible_parts"):
        lines_to_add.append("edible_parts: [" + ", ".join(fields["edible_parts"]) + "]")
    if fields.get("toxic") is True:
        lines_to_add.append("toxic: true")
    if fields.get("toxic_parts"):
        lines_to_add.append("toxic_parts: [" + ", ".join(fields["toxic_parts"]) + "]")
    if not lines_to_add:
        return text, False

    imported = bool(re.search(r"^origin:\s*imported\s*$", fm, re.M))
    has_fs = bool(re.search(r"^field_sources:\s*$", fm, re.M))
    fs_keys = []
    if fields.get("edible") is True:
        fs_keys.append("  edible: [usda-grin]")
    if fields.get("edible_parts"):
        fs_keys.append("  edible_parts: [usda-grin]")
    if fields.get("toxic") is True:
        fs_keys.append("  toxic: [usda-grin]")
    if fields.get("toxic_parts"):
        fs_keys.append("  toxic_parts: [usda-grin]")

    if imported and not has_fs:
        block = "\n".join(lines_to_add) + "\n"
    elif has_fs:
        fm = re.sub(r"^field_sources:\s*$", "field_sources:\n" + "\n".join(fs_keys), fm, count=1, flags=re.M)
        block = "\n".join(lines_to_add) + "\n"
    else:
        block = "\n".join(lines_to_add + ["field_sources:"] + fs_keys) + "\n"

    if re.search(r"^sources:", fm, re.M):
        fm = re.sub(r"^sources:", block + "sources:", fm, count=1, flags=re.M)
    else:
        fm = fm.rstrip() + "\n" + block

    m_inline = re.search(r"^sources:\s*\[([^\]]*)\]", fm, re.M)
    if m_inline:
        if source_key not in m_inline.group(1):
            fm = re.sub(r"^sources:\s*\[", "sources: [" + source_key + ", ", fm, count=1, flags=re.M)
    elif not re.search(r"^  - " + source_key + r"\s*$", fm, re.M):
        fm = re.sub(r"^sources:\s*$", "sources:\n  - " + source_key, fm, count=1, flags=re.M)
    return "---" + fm + "---" + body, True



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--txt-dir", default=str(DEFAULT_TXT), help="Extracted GRIN taxonomy_* .txt directory")
    ap.add_argument("--apply", action="store_true", help="Write frontmatter into content/crops/*.md")
    args = ap.parse_args()
    txt = Path(args.txt_dir)
    if not (txt / "taxonomy_species.txt").exists() or not (txt / "taxonomy_use.txt").exists():
        sys.exit(f"GRIN tables not found in {txt}. Download taxonomy_data.cab from NPGS and extract it.")

    by_id, by_name, uses_by_id, infra, synonyms_of = load_grin(txt)
    records = []
    unmatched = []
    no_sci = []
    updated = 0
    for path in sorted(CROPS.glob("*.md")):
        slug, sci, text = load_frontmatter_sci(path)
        if not sci:
            no_sci.append({"slug": slug, "reason": "no scientific_name"})
            continue
        cands = by_name.get(norm_name(sci), [])
        if not cands:
            unmatched.append({"slug": slug, "scientific_name": sci, "reason": "no exact GRIN name match"})
            continue
        taxon = pick_taxon(cands)
        include_infra = is_species_rank(sci)
        core_ids, infra_ids = collect_ids(taxon, include_infra, infra, synonyms_of)
        summary = summarise(core_ids, infra_ids, uses_by_id, by_id)
        rec = {
            "slug": slug,
            "scientific_name": sci,
            "grin_name": taxon["name"],
            "grin_taxonomy_species_id": taxon["taxonomy_species_id"],
            "grin_current_id": taxon["current_taxonomy_species_id"],
            "included_infra": include_infra,
            **summary,
        }
        records.append(rec)
        if args.apply and (summary["edible"] or summary["toxic"]):
            new_text, changed = insert_frontmatter(text, summary)
            if changed:
                path.write_text(new_text, encoding="utf-8")
                updated += 1

    out = {
        "source": {
            "title": "USDA-ARS National Plant Germplasm System, GRIN Taxonomy",
            "url": "https://npgsweb.ars-grin.gov/gringlobal/taxon/taxonomysearch",
            "dump": "https://npgsweb.ars-grin.gov/gringlobal/uploads/documents/taxonomy_data.cab",
            "dump_modified": "2026-10-05",
            "license": "PD-USGov",
            "license_note": "GRIN-Global FAQ: All information in GRIN is in the public domain. Citations are appreciated but not required. Checked 11 November 2026.",
            "faq": "https://www.grin-global.org/help_pw2/Content/A_Introduction%20Topics/faq.htm",
        },
        "matched": records,
        "unmatched": unmatched,
        "no_scientific_name": no_sci,
        "stats": {
            "crops": len(list(CROPS.glob("*.md"))),
            "matched": len(records),
            "edible": sum(1 for r in records if r["edible"]),
            "with_parts": sum(1 for r in records if r["edible_parts"]),
            "toxic": sum(1 for r in records if r["toxic"]),
            "with_toxic_parts": sum(1 for r in records if r["toxic_parts"]),
            "unmatched": len(unmatched),
            "no_scientific_name": len(no_sci),
            "frontmatter_updated": updated,
        },
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(out["stats"], indent=2))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
