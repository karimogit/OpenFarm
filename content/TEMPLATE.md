---
# Copy to content/guides/<crop>/<variant>.md – <crop> must match the folder, <variant> the file name.
crop: example-crop
common_name: Example crop
scientific_name: Genus species
family: Examplaceae            # botanical family, ends in -aceae
variant: temperate-oceanic     # short climate-group name, e.g. temperate-oceanic, mediterranean, subarctic
title: Example crop in mild oceanic climates (Netherlands, UK)
koppen: [Cfb]                  # one or more Köppen-Geiger classes this calendar was written for
hemisphere: north              # north | south | any (any = tied to wet/dry season, not to months)
reference_location: Where you checked the calendar, e.g. "Netherlands / UK lowlands"
calendar:                      # month numbers 1–12; omit rows that don't apply
  sow_indoors: [3, 4]
  sow_direct: [5]
  plant: [5, 6]                # set out transplants, tubers, cloves or sets
  harvest: [8, 9]              # required
days_to_maturity: [60, 90]     # [min, max]
spacing:
  in_row_cm: [30, 45]
  between_rows_cm: [45, 60]
sun: full                      # full | full-partial | partial | shade
water: moderate                # low | moderate | high
companions:
  good: []
  avoid: []
  evidence: traditional        # research | extension-advice | traditional
confidence: medium             # high | medium | low – how sure are you this fits the listed climates?
uncertainty: >-
  Required unless confidence is high. Say what you are unsure about and where the
  calendar came from.
sources:                       # at least one real, public source – never invent citations
  - title: Title of the page or publication
    publisher: Who published it
    url: https://example.org/page
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

## Problems
