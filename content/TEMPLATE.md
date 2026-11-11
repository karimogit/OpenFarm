---
# Copy to content/guides/<crop>/<region>.md
#   <crop>   = a file name in content/crops/ (e.g. tomato)
#   <region> = a climate region in content/regions/ (e.g. temperate-oceanic) – one guide per crop per region.
# Crop facts that are true everywhere (scientific name, family, seed saving, perennial facts) live in
# content/crops/<crop>.md, not here. A guide only holds what changes with the climate.
crop: example-crop
region: temperate-oceanic
title: Example crop in temperate oceanic climates
koppen: [Cfb]                  # the Köppen-Geiger classes this calendar was written for (normally a subset of the region's)
hemisphere: north              # north | south | any (any = tied to wet/dry season, not to months)
reference_location: Where you checked the calendar, e.g. "Netherlands / UK lowlands"
calendar:                      # month numbers 1–12; omit rows that don't apply
  sow_indoors: [3, 4]
  sow_direct: [5]
  plant: [5, 6]                # set out transplants, tubers, cloves, sets, crowns or trees
  # prune: [1, 2]              # fruit trees and bushes
  harvest: [8, 9]              # required
days_to_maturity: [60, 90]     # [min, max]
spacing:
  in_row_cm: [30, 45]
  between_rows_cm: [45, 60]
sun: full                      # full | full-partial | partial | shade
water: moderate                # low | moderate | high
varieties: []                  # slugs from content/varieties/<crop>/ that do well here
problems: []                   # slugs from content/problems/ that matter in this climate
# seed_saving_note: When seed ripens here, or why saving is hard in this climate.
confidence: medium             # high | medium | low – how sure are you this fits the listed climates?
uncertainty: >-
  Required unless confidence is high. Say what you are unsure about and where the
  calendar came from.
sources:                       # at least one real, public source – never invent citations
  - title: Title of the page or publication       # inline …
    publisher: Who published it
    url: https://example.org/page
  # - rhs-apples                                   # … or a key from content/sources.yaml
license: CC-BY-SA-4.0
authors: [Your Name]
last_reviewed: 2026-01-01
---

## Summary

Two or three sentences: what limits this crop in this climate?

## Sowing

## Planting

## Care

## Harvest
